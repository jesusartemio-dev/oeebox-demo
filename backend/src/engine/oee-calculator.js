const { query } = require('../db/connection');

const TICK_SECONDS = 10;
const workcellStates = {};
let intervalId = null;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

// ── initEngine ─────────────────────────────────────────────
async function initEngine() {
  const { rows } = await query(
    'SELECT id, code FROM workcells WHERE active = true'
  );

  for (const wc of rows) {
    workcellStates[wc.id] = {
      workcellId: wc.id,
      code: wc.code,
      currentRecordId: null,
      periodStart: null,
      lastShiftId: null,
      lastPartId: null,
      baselineTotalParts: null,
      baselineGoodParts: null,
      baselineScrapParts: null,
      runningSeconds: 0,
      availableSeconds: 0,
    };
  }

  console.log(`OEE Engine initialized for ${rows.length} workcell(s): ${rows.map(w => w.code).join(', ')}`);
}

// ── openRecord ─────────────────────────────────────────────
async function openRecord(state, plcState) {
  const { rows } = await query(`
    INSERT INTO oee_records (workcell_id, shift_id, part_number_id, period_start)
    VALUES ($1, $2, $3, NOW())
    RETURNING id, period_start
  `, [state.workcellId, plcState.current_shift_id, plcState.current_part_id]);

  const record = rows[0];
  state.currentRecordId = record.id;
  state.periodStart = record.period_start;
  state.lastShiftId = plcState.current_shift_id;
  state.lastPartId = plcState.current_part_id;
  state.baselineTotalParts = plcState.raw_total_parts;
  state.baselineGoodParts = plcState.raw_good_parts;
  state.baselineScrapParts = plcState.raw_scrap_parts;
  state.runningSeconds = 0;
  state.availableSeconds = 0;
}

// ── closeRecord ────────────────────────────────────────────
async function closeRecord(state) {
  if (state.currentRecordId === null) return;

  await query(
    'UPDATE oee_records SET period_end = NOW(), updated_at = NOW() WHERE id = $1',
    [state.currentRecordId]
  );

  state.currentRecordId = null;
  state.periodStart = null;
}

// ── getIdealCycleTime ──────────────────────────────────────
async function getIdealCycleTime(partId) {
  if (!partId) return null;
  const { rows } = await query(
    'SELECT ideal_cycle_time FROM part_numbers WHERE id = $1',
    [partId]
  );
  return rows.length > 0 ? rows[0].ideal_cycle_time : null;
}

// ── processWorkcell ────────────────────────────────────────
async function processWorkcell(workcellId) {
  const state = workcellStates[workcellId];
  if (!state) return;

  // a. Leer plc_state actual
  const { rows } = await query(
    'SELECT * FROM plc_state WHERE workcell_id = $1',
    [workcellId]
  );
  if (rows.length === 0) return;
  const plc = rows[0];

  // b. Si no hay registro abierto → abrir
  if (state.currentRecordId === null) {
    await openRecord(state, plc);
    return;
  }

  // c. Si cambió shift o part → cerrar y abrir nuevo
  const shiftChanged = plc.current_shift_id !== state.lastShiftId;
  const partChanged = plc.current_part_id !== state.lastPartId;

  if (shiftChanged || partChanged) {
    await closeRecord(state);
    await openRecord(state, plc);
    return;
  }

  // d. Acumular tiempos
  if (plc.connected) state.availableSeconds += TICK_SECONDS;
  if (plc.machine_running) state.runningSeconds += TICK_SECONDS;

  // e. Calcular partes del período
  const totalParts = plc.raw_total_parts - state.baselineTotalParts;
  const goodParts = plc.raw_good_parts - state.baselineGoodParts;
  const scrapParts = plc.raw_scrap_parts - state.baselineScrapParts;

  // f. Obtener ideal_cycle_time
  const idealCycleTime = await getIdealCycleTime(plc.current_part_id);

  // g. Calcular OEE
  const availability = state.availableSeconds > 0
    ? clamp01(state.runningSeconds / state.availableSeconds)
    : 0;

  const performance = (state.runningSeconds > 0 && idealCycleTime)
    ? clamp01((totalParts * idealCycleTime) / state.runningSeconds)
    : 0;

  const quality = totalParts > 0
    ? clamp01(goodParts / totalParts)
    : 0;

  const oee = clamp01(availability * performance * quality);

  // h. UPDATE oee_records
  await query(`
    UPDATE oee_records SET
      total_parts      = $1,
      good_parts       = $2,
      scrap_parts      = $3,
      available_time   = $4,
      running_time     = $5,
      ideal_cycle_time = $6,
      availability     = $7,
      performance      = $8,
      quality          = $9,
      oee              = $10,
      period_end       = NOW(),
      updated_at       = NOW()
    WHERE id = $11
  `, [
    totalParts, goodParts, scrapParts,
    state.availableSeconds, state.runningSeconds,
    idealCycleTime,
    availability, performance, quality, oee,
    state.currentRecordId,
  ]);

  // i. UPDATE plc_state con métricas calculadas
  await query(`
    UPDATE plc_state SET
      oee          = $1,
      availability = $2,
      performance  = $3,
      quality      = $4
    WHERE workcell_id = $5
  `, [oee, availability, performance, quality, workcellId]);
}

// ── startEngine / stopEngine ───────────────────────────────
async function startEngine() {
  await initEngine();

  const ids = Object.keys(workcellStates).map(Number);

  if (ids.length === 0) {
    console.error('OEE Engine: no active workcells, not starting');
    return;
  }

  intervalId = setInterval(async () => {
    for (const id of ids) {
      try {
        await processWorkcell(id);
      } catch (err) {
        console.error(`OEE Engine error (workcell ${id}):`, err.message);
      }
    }
  }, TICK_SECONDS * 1000);

  console.log('OEE Engine started');
}

function stopEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('OEE Engine stopped');
  }
}

module.exports = { startEngine, stopEngine };
