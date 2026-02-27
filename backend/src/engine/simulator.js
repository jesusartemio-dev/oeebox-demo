const { query } = require('../db/connection');

// Estado interno por workcell
const state = {
  L01: {
    workcellCode: 'L01',
    workcellId: null,
    basePartCount: 1000,
    goodPartsRatio: 0.97,
    machineRunning: true,
    faultActive: false,
    faultCode: 0,
    currentShiftId: null,
    currentPartId: null,
    partIds: [],
    starvedUntil: 0,
    currentEventId: null,
  },
  L02: {
    workcellCode: 'L02',
    workcellId: null,
    basePartCount: 500,
    goodPartsRatio: 0.98,
    machineRunning: true,
    faultActive: false,
    faultCode: 0,
    currentShiftId: null,
    currentPartId: null,
    partIds: [],
    starvedUntil: 0,
    currentEventId: null,
  },
};

let intervalId = null;

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

// Selecciona part_id basado en hora (alterna cada 2 horas)
function pickPartId(wc) {
  if (wc.partIds.length === 0) return null;
  const slot = Math.floor(new Date().getHours() / 2) % wc.partIds.length;
  return wc.partIds[slot];
}

// Inicializa workcell_id y part_ids desde la DB
async function initWorkcell(wc) {
  const { rows: wcRows } = await query(
    'SELECT id FROM workcells WHERE code = $1 LIMIT 1',
    [wc.workcellCode]
  );
  if (wcRows.length === 0) return false;
  wc.workcellId = wcRows[0].id;

  const { rows: partRows } = await query(
    'SELECT id FROM part_numbers WHERE workcell_id = $1 AND active = true ORDER BY id',
    [wc.workcellId]
  );
  wc.partIds = partRows.map(r => r.id);

  return true;
}

// Abre un evento de paro en la DB
async function openEvent(wc, eventType) {
  try {
    console.log('EVENT OPEN:', wc.workcellId, eventType, 'faultCode:', wc.faultCode);
    const { rows } = await query(`
      INSERT INTO events (workcell_id, started_at, event_type, fault_code, fault_code_raw, source)
      VALUES ($1, NOW(), $2, $3, $4, 'plc')
      RETURNING id
    `, [wc.workcellId, eventType, wc.faultCode ? `Fault Code ${wc.faultCode}` : null, wc.faultCode || null]);
    wc.currentEventId = rows[0].id;
    console.log('EVENT OPEN OK: id =', wc.currentEventId);
  } catch (err) {
    console.error('Event INSERT error:', err.message);
  }
}

// Cierra el evento de paro abierto
async function closeEvent(wc) {
  if (wc.currentEventId === null) return;
  try {
    console.log('EVENT CLOSE:', wc.workcellId, 'eventId:', wc.currentEventId);
    await query(`
      UPDATE events SET
        ended_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
      WHERE id = $1
    `, [wc.currentEventId]);
    console.log('EVENT CLOSE OK: id =', wc.currentEventId);
    wc.currentEventId = null;
  } catch (err) {
    console.error('Event UPDATE error:', err.message);
  }
}

// Simula un tick (1 segundo) para una workcell
async function tick(wc) {
  const now = Date.now();
  const wasRunning = wc.machineRunning;

  // Starved: máquina parada temporalmente
  if (wc.starvedUntil > now) {
    wc.machineRunning = false;
  } else if (wc.starvedUntil > 0 && now >= wc.starvedUntil) {
    wc.starvedUntil = 0;
    if (!wc.faultActive) wc.machineRunning = true;
  }

  // Resolver falla (10% probabilidad por segundo)
  if (wc.faultActive && Math.random() < 0.10) {
    wc.faultActive = false;
    wc.faultCode = 0;
    wc.machineRunning = true;
  }

  // Producir piezas si está corriendo
  if (wc.machineRunning) {
    const parts = Math.floor(Math.random() * 3); // 0, 1 o 2
    wc.basePartCount += parts;

    // Variar levemente el ratio de calidad
    wc.goodPartsRatio = 0.96 + Math.random() * 0.03;
  }

  // Activar falla (2% probabilidad)
  if (wc.machineRunning && Math.random() < 0.02) {
    wc.machineRunning = false;
    wc.faultActive = true;
    wc.faultCode = Math.floor(Math.random() * 10) + 1;
  }

  // Simular starved (0.5% probabilidad)
  if (wc.machineRunning && Math.random() < 0.005) {
    wc.starvedUntil = now + 30000;
    wc.machineRunning = false;
  }

  // Registrar eventos de paro
  if (wasRunning && !wc.machineRunning) {
    const eventType = wc.faultActive ? 'fault' : 'starved';
    await openEvent(wc, eventType);
  } else if (!wasRunning && wc.machineRunning) {
    await closeEvent(wc);
  }

  // Calcular partes
  const totalParts = wc.basePartCount;
  const goodParts = Math.floor(totalParts * wc.goodPartsRatio);
  const scrapParts = totalParts - goodParts;

  // Actualizar shift y part
  wc.currentShiftId = await getCurrentShiftId(wc.workcellId);
  wc.currentPartId = pickPartId(wc);

  // UPSERT plc_state
  await query(`
    INSERT INTO plc_state (
      workcell_id, machine_running, fault_active, fault_code, connected,
      raw_total_parts, raw_good_parts, raw_scrap_parts,
      current_shift_id, current_part_id, last_update
    ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (workcell_id) DO UPDATE SET
      machine_running  = EXCLUDED.machine_running,
      fault_active     = EXCLUDED.fault_active,
      fault_code       = EXCLUDED.fault_code,
      connected        = true,
      raw_total_parts  = EXCLUDED.raw_total_parts,
      raw_good_parts   = EXCLUDED.raw_good_parts,
      raw_scrap_parts  = EXCLUDED.raw_scrap_parts,
      current_shift_id = EXCLUDED.current_shift_id,
      current_part_id  = EXCLUDED.current_part_id,
      last_update      = NOW()
  `, [
    wc.workcellId, wc.machineRunning, wc.faultActive, wc.faultCode,
    totalParts, goodParts, scrapParts,
    wc.currentShiftId, wc.currentPartId,
  ]);
}

async function startSimulator() {
  const workcells = Object.values(state);

  for (const wc of workcells) {
    const ok = await initWorkcell(wc);
    if (!ok) {
      console.error(`Simulator: workcell ${wc.workcellCode} not found in DB, skipping`);
    }
  }

  const active = workcells.filter(wc => wc.workcellId !== null);

  if (active.length === 0) {
    console.error('Simulator: no workcells found, not starting');
    return;
  }

  console.log(`Simulator started for ${active.length} workcell(s): ${active.map(w => w.workcellCode).join(', ')}`);

  intervalId = setInterval(async () => {
    for (const wc of active) {
      try {
        await tick(wc);
      } catch (err) {
        console.error(`Simulator tick error (${wc.workcellCode}):`, err.message);
      }
    }
  }, 1000);
}

function stopSimulator() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Simulator stopped');
  }
}

module.exports = { startSimulator, stopSimulator };
