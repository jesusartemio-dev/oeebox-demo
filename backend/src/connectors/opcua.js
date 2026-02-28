const { query } = require('../db/connection');

// Determina shift_number segun hora actual
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

class OpcuaConnector {
  constructor(workcell) {
    this.workcell = workcell;
    this.client = null;
    this.session = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.pollTimer = null;
  }

  async connect() {
    this.clearTimers();

    if (this.session) {
      try { await this.session.close(); } catch {}
      this.session = null;
    }
    if (this.client) {
      try { await this.client.disconnect(); } catch {}
      this.client = null;
    }

    const { plc_ip, plc_port, code } = this.workcell;
    const port = plc_port || 4840;
    const endpointUrl = `opc.tcp://${plc_ip}:${port}`;

    try {
      const {
        OPCUAClient,
        MessageSecurityMode,
        SecurityPolicy,
      } = require('node-opcua');

      this.client = OPCUAClient.create({
        applicationName: 'OEEBox',
        connectionStrategy: {
          initialDelay: 1000,
          maxRetry: 1,
        },
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
        endpointMustExist: false,
      });

      await this.client.connect(endpointUrl);
      this.session = await this.client.createSession();
      this.connected = true;
      console.log(`OPC-UA connected: ${code} (${endpointUrl})`);
      this.startPolling();
    } catch (err) {
      console.error(`OPC-UA connect error ${code}:`, err.message);
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const { code } = this.workcell;
    console.log(`Reconnecting OPC-UA ${code} in 5s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
    this.markDisconnected();
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.readAndStore(), 1000);
  }

  async readAndStore() {
    if (!this.connected || !this.session) return;

    const wc = this.workcell;

    try {
      const { AttributeIds } = require('node-opcua');

      // Build list of nodes to read, filtering out empty tags
      const tagDefs = [
        { key: 'total_parts', nodeId: wc.tag_total_parts },
        { key: 'good_parts', nodeId: wc.tag_good_parts },
        { key: 'scrap_parts', nodeId: wc.tag_scrap_parts },
        { key: 'machine_run', nodeId: wc.tag_machine_run },
        { key: 'fault_active', nodeId: wc.tag_fault_active },
        { key: 'fault_code', nodeId: wc.tag_fault_code },
      ];

      const activeTags = tagDefs.filter(t => t.nodeId);
      const nodesToRead = activeTags.map(t => ({
        nodeId: t.nodeId,
        attributeId: AttributeIds.Value,
      }));

      const results = nodesToRead.length > 0
        ? await this.session.read(nodesToRead)
        : [];

      // Map results back by key
      const values = {};
      for (const def of tagDefs) {
        values[def.key] = 0;
      }
      activeTags.forEach((t, i) => {
        values[t.key] = results[i]?.value?.value ?? 0;
      });

      const data = {
        raw_total_parts: values.total_parts,
        raw_good_parts: values.good_parts,
        raw_scrap_parts: values.scrap_parts,
        machine_running: !!values.machine_run,
        fault_active: !!values.fault_active,
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
      console.error(`OPC-UA readAndStore error ${wc.code}:`, err.message);
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
      console.error(`OPC-UA markDisconnected error ${this.workcell.code}:`, err.message);
    }
  }

  clearTimers() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  async disconnect() {
    this.clearTimers();
    this.connected = false;
    try {
      if (this.session) await this.session.close();
    } catch {}
    try {
      if (this.client) await this.client.disconnect();
    } catch {}
    this.session = null;
    this.client = null;
  }
}

// -- Inicializar conectores ------------------------------------------------

const connectors = new Map();

async function startOpcuaConnectors() {
  try {
    const { rows: workcells } = await query(
      "SELECT * FROM workcells WHERE active = true AND plc_protocol = 'opcua'"
    );

    if (workcells.length === 0) {
      console.log('No OPC-UA workcells configured');
      return;
    }

    const codes = [];
    for (const wc of workcells) {
      const connector = new OpcuaConnector(wc);
      connectors.set(wc.id, connector);
      connector.connect();
      codes.push(wc.code);
    }

    console.log(`OPC-UA connectors started for: ${codes.join(', ')}`);
  } catch (err) {
    console.warn('OPC-UA: tablas no listas, saltando conectores:', err.message);
  }
}

function stopOpcuaConnectors() {
  for (const [id, connector] of connectors) {
    connector.disconnect();
  }
  connectors.clear();
  console.log('OPC-UA connectors stopped');
}

module.exports = { OpcuaConnector, startOpcuaConnectors, stopOpcuaConnectors };
