const express = require('express');
const { query } = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

// Middleware: verificar rol admin
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol admin' });
  }
  next();
}

// GET /api/workcells
router.get('/', async (req, res) => {
  try {
    const { rows: workcells } = await query(`
      SELECT w.*,
             COALESCE(json_agg(DISTINCT jsonb_build_object(
               'id', s.id, 'shift_number', s.shift_number, 'name', s.name,
               'start_time', s.start_time, 'end_time', s.end_time,
               'active_days', s.active_days, 'active', s.active
             )) FILTER (WHERE s.id IS NOT NULL), '[]') AS shifts,
             CASE WHEN ps.workcell_id IS NOT NULL THEN jsonb_build_object(
               'machine_running', ps.machine_running, 'fault_active', ps.fault_active,
               'fault_code', ps.fault_code, 'connected', ps.connected,
               'oee', ps.oee, 'availability', ps.availability,
               'performance', ps.performance, 'quality', ps.quality,
               'last_update', ps.last_update
             ) ELSE NULL END AS plc_state
        FROM workcells w
        LEFT JOIN shifts s ON s.workcell_id = w.id
        LEFT JOIN plc_state ps ON ps.workcell_id = w.id
       WHERE w.active = true
       GROUP BY w.id, ps.workcell_id, ps.machine_running, ps.fault_active,
                ps.fault_code, ps.connected, ps.oee, ps.availability,
                ps.performance, ps.quality, ps.last_update
       ORDER BY w.code ASC
    `);

    res.json(workcells);
  } catch (err) {
    console.error('GET /api/workcells error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/workcells/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM workcells WHERE id = $1', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Workcell no encontrada' });
    }

    const workcell = rows[0];

    const [shiftsResult, partsResult, stateResult] = await Promise.all([
      query('SELECT id, shift_number, name, start_time, end_time, active_days, active FROM shifts WHERE workcell_id = $1 ORDER BY shift_number', [workcell.id]),
      query('SELECT id, part_number, description, ideal_cycle_time, active FROM part_numbers WHERE workcell_id = $1 AND active = true ORDER BY part_number', [workcell.id]),
      query('SELECT machine_running, fault_active, fault_code, connected, oee, availability, performance, quality, last_update FROM plc_state WHERE workcell_id = $1', [workcell.id]),
    ]);

    workcell.shifts = shiftsResult.rows;
    workcell.part_numbers = partsResult.rows;
    workcell.plc_state = stateResult.rows[0] || null;

    res.json(workcell);
  } catch (err) {
    console.error('GET /api/workcells/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/workcells
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { code, name, plc_protocol, plc_ip, plc_port, plc_slot,
            tag_total_parts, tag_good_parts, tag_scrap_parts,
            tag_machine_run, tag_fault_active, tag_fault_code, tag_shift_active } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'code y name son requeridos' });
    }

    const { rows } = await query(`
      INSERT INTO workcells (code, name, plc_protocol, plc_ip, plc_port, plc_slot,
        tag_total_parts, tag_good_parts, tag_scrap_parts,
        tag_machine_run, tag_fault_active, tag_fault_code, tag_shift_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [code, name, plc_protocol, plc_ip, plc_port || 502, plc_slot || 0,
        tag_total_parts, tag_good_parts, tag_scrap_parts,
        tag_machine_run, tag_fault_active, tag_fault_code, tag_shift_active]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/workcells error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/workcells/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const allowed = ['code', 'name', 'active', 'plc_protocol', 'plc_ip', 'plc_port', 'plc_slot',
      'tag_total_parts', 'tag_good_parts', 'tag_scrap_parts',
      'tag_machine_run', 'tag_fault_active', 'tag_fault_code', 'tag_shift_active'];

    const sets = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
    }

    sets.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE workcells SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Workcell no encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/workcells/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/workcells/:id (soft delete)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE workcells SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id, code, name, active',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Workcell no encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('DELETE /api/workcells/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
