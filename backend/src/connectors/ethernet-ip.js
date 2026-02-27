const { Controller, Tag, TagGroup } = require('ethernet-ip');
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

class EthernetIPConnector {
  constructor(workcell) {
    this.workcell = workcell;
    this.plc = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.pollTimer = null;
  }

  async connect() {
    this.clearTimers();

    if (this.plc) {
      try { this.plc.destroy(); } catch {}
      this.plc = null;
    }

    const { plc_ip, plc_slot, code } = this.workcell;
    const slot = plc_slot || 0;

    this.plc = new Controller();

    try {
      await this.plc.connect(plc_ip, slot);
      this.connected = true;
      console.log(`EtherNet/IP connected: ${code} (${plc_ip}, slot ${slot})`);
      this.startPolling();
    } catch (err) {
      console.error(`EtherNet/IP connect error ${code}:`, err.message);
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const { code } = this.workcell;
    console.log(`Reconnecting EIP ${code} in 5s...`);
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
      // Crear TagGroup con los tags configurados
      const group = new TagGroup();
      const tagMap = {};

      const tagDefs = {
        total_parts:  wc.tag_total_parts,
        good_parts:   wc.tag_good_parts,
        scrap_parts:  wc.tag_scrap_parts,
        machine_run:  wc.tag_machine_run,
        fault_active: wc.tag_fault_active,
        fault_code:   wc.tag_fault_code,
      };

      for (const [key, tagName] of Object.entries(tagDefs)) {
        if (!tagName) continue;
        const tag = new Tag(tagName);
        group.add(tag);
        tagMap[key] = tag;
      }

      // Leer todos los tags de una sola vez
      await this.plc.readTagGroup(group);

      const values = {};
      for (const [key, tagName] of Object.entries(tagDefs)) {
        if (!tagName || !tagMap[key]) {
          values[key] = 0;
          continue;
        }
        values[key] = tagMap[key].value ?? 0;
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
      console.error(`EtherNet/IP readAndStore error ${wc.code}:`, err.message);
      this.connected = false;
      this.markDisconnected();
      this.clearTimers();
      this.scheduleReconnect();
    }
  }

  async markDisconnected() {
    try {
      await query(
        'UPDATE plc_state SET connected = false, last_update = NOW() WHERE workcell_id = $1',
        [this.workcell.id]
      );
    } catch (err) {
      console.error(`EtherNet/IP markDisconnected error ${this.workcell.code}:`, err.message);
    }
  }

  clearTimers() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  disconnect() {
    this.clearTimers();
    this.connected = false;
    if (this.plc) {
      try { this.plc.destroy(); } catch {}
      this.plc = null;
    }
  }
}

// ── Inicializar conectores ────────────────────────────────

const connectors = new Map();

async function startEthernetIPConnectors() {
  const { rows: workcells } = await query(
    "SELECT * FROM workcells WHERE active = true AND plc_protocol = 'ethernet-ip'"
  );

  if (workcells.length === 0) {
    console.log('No EtherNet/IP workcells configured');
    return;
  }

  const codes = [];
  for (const wc of workcells) {
    const connector = new EthernetIPConnector(wc);
    connectors.set(wc.id, connector);
    connector.connect();
    codes.push(wc.code);
  }

  console.log(`EtherNet/IP connectors started for: ${codes.join(', ')}`);
}

function stopEthernetIPConnectors() {
  for (const [id, connector] of connectors) {
    connector.disconnect();
  }
  connectors.clear();
  console.log('EtherNet/IP connectors stopped');
}

module.exports = { EthernetIPConnector, startEthernetIPConnectors, stopEthernetIPConnectors };
