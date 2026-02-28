const { query } = require('../db/connection');

const TICK_MS = 6000; // 6 segundos entre ticks

// Estado interno por workcell
const state = {
  L01: {
    workcellCode: 'L01',
    workcellId: null,
    totalParts: 0,
    goodParts: 0,
    scrapParts: 0,
    machineRunning: true,
    faultActive: false,
    faultCode: 0,
    currentShiftId: null,
    currentPartId: null,
    idealCycleTime: null,
    partIds: [],
    faultTicksLeft: 0,
    currentEventId: null,
  },
  L02: {
    workcellCode: 'L02',
    workcellId: null,
    totalParts: 0,
    goodParts: 0,
    scrapParts: 0,
    machineRunning: true,
    faultActive: false,
    faultCode: 0,
    currentShiftId: null,
    currentPartId: null,
    idealCycleTime: null,
    partIds: [],
    faultTicksLeft: 0,
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
  return wc.partIds[slot].id;
}

function pickIdealCycleTime(wc) {
  if (wc.partIds.length === 0) return 12;
  const slot = Math.floor(new Date().getHours() / 2) % wc.partIds.length;
  return wc.partIds[slot].idealCycleTime;
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
    'SELECT id, ideal_cycle_time FROM part_numbers WHERE workcell_id = $1 AND active = true ORDER BY id',
    [wc.workcellId]
  );
  wc.partIds = partRows.map(r => ({ id: r.id, idealCycleTime: r.ideal_cycle_time }));

  // Inicializar conteo base desde plc_state existente (para no resetear en cada deploy)
  const { rows: plcRows } = await query(
    'SELECT raw_total_parts, raw_good_parts, raw_scrap_parts FROM plc_state WHERE workcell_id = $1',
    [wc.workcellId]
  );
  if (plcRows.length > 0 && plcRows[0].raw_total_parts > 0) {
    wc.totalParts = plcRows[0].raw_total_parts;
    wc.goodParts = plcRows[0].raw_good_parts;
    wc.scrapParts = plcRows[0].raw_scrap_parts;
  } else {
    // Seed inicial para que no empiece en 0
    wc.totalParts = 800 + Math.floor(Math.random() * 400);
    wc.goodParts = Math.floor(wc.totalParts * 0.97);
    wc.scrapParts = wc.totalParts - wc.goodParts;
  }

  return true;
}

// Abre un evento de paro en la DB
async function openEvent(wc, eventType) {
  try {
    const { rows } = await query(`
      INSERT INTO events (workcell_id, started_at, event_type, fault_code, fault_code_raw, source)
      VALUES ($1, NOW(), $2, $3, $4, 'plc')
      RETURNING id
    `, [wc.workcellId, eventType, wc.faultCode ? `Fault Code ${wc.faultCode}` : null, wc.faultCode || null]);
    wc.currentEventId = rows[0].id;
  } catch (err) {
    console.error('Event INSERT error:', err.message);
  }
}

// Cierra el evento de paro abierto
async function closeEvent(wc) {
  if (wc.currentEventId === null) return;
  try {
    await query(`
      UPDATE events SET
        ended_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
      WHERE id = $1
    `, [wc.currentEventId]);
    wc.currentEventId = null;
  } catch (err) {
    console.error('Event UPDATE error:', err.message);
  }
}

// Simula un tick para una workcell
async function tick(wc) {
  const wasRunning = wc.machineRunning;
  const tickSeconds = TICK_MS / 1000;

  // ── Resolver falla si ya pasaron los ticks ──
  if (wc.faultActive) {
    wc.faultTicksLeft--;
    if (wc.faultTicksLeft <= 0) {
      wc.faultActive = false;
      wc.faultCode = 0;
      wc.machineRunning = true;
    }
  }

  // ── Producir piezas si está corriendo ──
  if (wc.machineRunning) {
    const ict = pickIdealCycleTime(wc);
    // Cuántas partes teóricas caben en este tick
    const theoreticalParts = tickSeconds / ict;
    // Producir entre 70-95% de las teóricas (esto genera performance en ese rango)
    const perfFactor = 0.70 + Math.random() * 0.25;
    const newParts = Math.max(1, Math.round(theoreticalParts * perfFactor));

    // Calidad entre 95-99.5%
    const qualityFactor = 0.95 + Math.random() * 0.045;
    const newGood = Math.round(newParts * qualityFactor);
    const newScrap = newParts - newGood;

    wc.totalParts += newParts;
    wc.goodParts += newGood;
    wc.scrapParts += newScrap;
  }

  // ── Activar falla aleatoria (4% por tick ≈ una falla cada ~2.5 min) ──
  if (wc.machineRunning && !wc.faultActive && Math.random() < 0.04) {
    wc.machineRunning = false;
    wc.faultActive = true;
    wc.faultCode = Math.floor(Math.random() * 10) + 1;
    // Falla dura 2-5 ticks (12-30 segundos)
    wc.faultTicksLeft = 2 + Math.floor(Math.random() * 4);
  }

  // ── Registrar eventos de paro ──
  if (wasRunning && !wc.machineRunning) {
    await openEvent(wc, 'fault');
  } else if (!wasRunning && wc.machineRunning) {
    await closeEvent(wc);
  }

  // ── Actualizar shift y part ──
  wc.currentShiftId = await getCurrentShiftId(wc.workcellId);
  wc.currentPartId = pickPartId(wc);

  // ── UPSERT plc_state ──
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
    wc.totalParts, wc.goodParts, wc.scrapParts,
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

  console.log(`Simulator started for ${active.length} workcell(s): ${active.map(w => w.workcellCode).join(', ')} — tick every ${TICK_MS / 1000}s`);

  intervalId = setInterval(async () => {
    for (const wc of active) {
      try {
        await tick(wc);
      } catch (err) {
        console.error(`Simulator tick error (${wc.workcellCode}):`, err.message);
      }
    }
  }, TICK_MS);
}

function stopSimulator() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Simulator stopped');
  }
}

module.exports = { startSimulator, stopSimulator };
