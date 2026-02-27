const net = require('net');
const jsmodbus = require('jsmodbus');
const { query } = require('../db/connection');

// Determina shift_number según hora actual
function getShiftNumber() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 1;
  if (hour >= 14 && hour < 22) return 2;
  return 3;
}

// Busca el shift_id real en la DB
async function getCurrentShiftId(workcellId) {
  const shiftNumber = getShiftNumber();
  const { rows } = await query(
    'SELECT id FROM shifts WHERE workcell_id = $1 AND shift_number = $2 LIMIT 1',
    [workcellId, shiftNumber]
  );
  return rows.length > 0 ? rows[0].id : null;
}

// Parsea tag "HR100" → 100, "HR0" → 0
function parseRegister(tag) {
  if (!tag) return null;
  const num = parseInt(tag.replace(/\D/g, ''), 10);
  return isNaN(num) ? null : num;
}

class ModbusConnector {
  constructor(workcell) {
    this.workcell = workcell;
    this.client = null;
    this.socket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.pollTimer = null;
  }

  async connect() {
    // Limpiar conexión anterior si existe
    this.clearTimers();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }

    const { plc_ip, plc_port, code } = this.workcell;
    const port = plc_port || 502;

    this.socket = new net.Socket();
    this.client = new jsmodbus.client.TCP(this.socket);

    this.socket.on('connect', () => {
      this.connected = true;
      console.log(`Modbus connected: ${code} (${plc_ip}:${port})`);
      this.startPolling();
    });

    this.socket.on('error', (err) => {
      console.error(`Modbus error ${code}:`, err.message);
      this.connected = false;
      this.scheduleReconnect();
    });

    this.socket.on('close', () => {
      if (this.connected) {
        console.log(`Modbus disconnected: ${code}`);
        this.connected = false;
        this.markDisconnected();
      }
      this.clearTimers();
      this.scheduleReconnect();
    });

    this.socket.connect({ host: plc_ip, port });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return; // ya programado
    const { code } = this.workcell;
    console.log(`Reconnecting ${code} in 5s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.readAndStore(), 1000);
  }

  async readAndStore() {
    if (!this.connected) return;

    const wc = this.workcell;

    try {
      // Parsear direcciones de registros
      const regs = {
        total_parts:  parseRegister(wc.tag_total_parts),
        good_parts:   parseRegister(wc.tag_good_parts),
        scrap_parts:  parseRegister(wc.tag_scrap_parts),
        machine_run:  parseRegister(wc.tag_machine_run),
        fault_active: parseRegister(wc.tag_fault_active),
        fault_code:   parseRegister(wc.tag_fault_code),
      };

      // Leer cada tag como registro individual
      const values = {};
      for (const [key, addr] of Object.entries(regs)) {
        if (addr === null) {
          values[key] = 0;
          continue;
        }
        try {
          const resp = await this.client.readHoldingRegisters(addr, 1);
          values[key] = resp.response.body.values[0] || 0;
        } catch (readErr) {
          console.error(`Modbus read error ${wc.code} tag ${key} @${addr}:`, readErr.message);
          values[key] = 0;
        }
      }

      const data = {
        raw_total_parts: values.total_parts,
        raw_good_parts: values.good_parts,
        raw_scrap_parts: values.scrap_parts,
        machine_running: values.machine_run > 0,
        fault_active: values.fault_active > 0,
        fault_code: values.fault_code,
      };

      // Determinar turno actual
      const currentShiftId = await getCurrentShiftId(wc.id);

      // UPSERT plc_state
      await query(`
        INSERT INTO plc_state (
          workcell_id, machine_running, fault_active, fault_code, connected,
          raw_total_parts, raw_good_parts, raw_scrap_parts,
          current_shift_id, last_update
        ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,NOW())
        ON CONFLICT (workcell_id) DO UPDATE SET
          machine_running  = EXCLUDED.machine_running,
          fault_active     = EXCLUDED.fault_active,
          fault_code       = EXCLUDED.fault_code,
          connected        = true,
          raw_total_parts  = EXCLUDED.raw_total_parts,
          raw_good_parts   = EXCLUDED.raw_good_parts,
          raw_scrap_parts  = EXCLUDED.raw_scrap_parts,
          current_shift_id = EXCLUDED.current_shift_id,
          last_update      = NOW()
      `, [
        wc.id, data.machine_running, data.fault_active, data.fault_code,
        data.raw_total_parts, data.raw_good_parts, data.raw_scrap_parts,
        currentShiftId,
      ]);
    } catch (err) {
      console.error(`Modbus readAndStore error ${wc.code}:`, err.message);
      this.connected = false;
      this.markDisconnected();
    }
  }

  async markDisconnected() {
    try {
      await query(
        'UPDATE plc_state SET connected = false, last_update = NOW() WHERE workcell_id = $1',
        [this.workcell.id]
      );
    } catch (err) {
      console.error(`Modbus markDisconnected error ${this.workcell.code}:`, err.message);
    }
  }

  clearTimers() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  disconnect() {
    this.clearTimers();
    this.connected = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.client = null;
  }
}

// ── Inicializar conectores ────────────────────────────────

const connectors = new Map();

async function startModbusConnectors() {
  const { rows: workcells } = await query(
    "SELECT * FROM workcells WHERE active = true AND plc_protocol = 'modbus-tcp'"
  );

  if (workcells.length === 0) {
    console.log('No Modbus workcells configured');
    return;
  }

  const codes = [];
  for (const wc of workcells) {
    const connector = new ModbusConnector(wc);
    connectors.set(wc.id, connector);
    connector.connect();
    codes.push(wc.code);
  }

  console.log(`Modbus connectors started for: ${codes.join(', ')}`);
}

function stopModbusConnectors() {
  for (const [id, connector] of connectors) {
    connector.disconnect();
  }
  connectors.clear();
  console.log('Modbus connectors stopped');
}

module.exports = { ModbusConnector, startModbusConnectors, stopModbusConnectors };
