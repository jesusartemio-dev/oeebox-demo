const express = require('express');
const { query } = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

// ── Rutas públicas (sin auth) ─────────────────────────────
router.get('/plant-info', (req, res) => {
  res.json({
    plantName: process.env.PLANT_NAME || 'Planta Industrial',
    companyName: process.env.COMPANY_NAME || 'OEE Box',
  });
});

// Middleware: verificar rol admin
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol admin' });
  }
  next();
}

// Aplicar auth + adminOnly a todas las rutas siguientes
router.use(auth, adminOnly);

// ═══════════════════════════════════════════════════════════
// TURNOS
// ═══════════════════════════════════════════════════════════

// GET /api/config/shifts/:workcellId
router.get('/shifts/:workcellId', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const { rows } = await query(
      'SELECT * FROM shifts WHERE workcell_id = $1 ORDER BY shift_number ASC',
      [workcellId]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/config/shifts/:workcellId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/config/shifts/:shiftId
router.put('/shifts/:shiftId', async (req, res) => {
  try {
    const shiftId = parseInt(req.params.shiftId, 10);
    if (isNaN(shiftId)) {
      return res.status(400).json({ error: 'shiftId inválido' });
    }

    const { name, start_time, end_time, active_days, active } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name); }
    if (start_time !== undefined) { sets.push(`start_time = $${idx++}`); values.push(start_time); }
    if (end_time !== undefined) { sets.push(`end_time = $${idx++}`); values.push(end_time); }
    if (active_days !== undefined) { sets.push(`active_days = $${idx++}`); values.push(active_days); }
    if (active !== undefined) { sets.push(`active = $${idx++}`); values.push(active); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
    }

    sets.push('updated_at = NOW()');
    values.push(shiftId);

    const { rows } = await query(
      `UPDATE shifts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/config/shifts/:shiftId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// NÚMEROS DE PARTE
// ═══════════════════════════════════════════════════════════

// GET /api/config/parts/:workcellId
router.get('/parts/:workcellId', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const { rows } = await query(
      'SELECT * FROM part_numbers WHERE workcell_id = $1 ORDER BY part_number ASC',
      [workcellId]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/config/parts/:workcellId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/config/parts/:workcellId
router.post('/parts/:workcellId', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const { part_number, description, ideal_cycle_time } = req.body;

    if (!part_number) {
      return res.status(400).json({ error: 'part_number es requerido' });
    }

    const cycleTime = parseFloat(ideal_cycle_time);
    if (isNaN(cycleTime) || cycleTime <= 0) {
      return res.status(400).json({ error: 'ideal_cycle_time debe ser un número positivo' });
    }

    const { rows } = await query(`
      INSERT INTO part_numbers (workcell_id, part_number, description, ideal_cycle_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [workcellId, part_number, description || null, cycleTime]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/config/parts/:workcellId error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este número de parte ya existe en esta workcell' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/config/parts/:partId
router.put('/parts/:partId', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    if (isNaN(partId)) {
      return res.status(400).json({ error: 'partId inválido' });
    }

    const { part_number, description, ideal_cycle_time, active } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    if (part_number !== undefined) { sets.push(`part_number = $${idx++}`); values.push(part_number); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); values.push(description); }
    if (ideal_cycle_time !== undefined) {
      const cycleTime = parseFloat(ideal_cycle_time);
      if (isNaN(cycleTime) || cycleTime <= 0) {
        return res.status(400).json({ error: 'ideal_cycle_time debe ser un número positivo' });
      }
      sets.push(`ideal_cycle_time = $${idx++}`);
      values.push(cycleTime);
    }
    if (active !== undefined) { sets.push(`active = $${idx++}`); values.push(active); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
    }

    sets.push('updated_at = NOW()');
    values.push(partId);

    const { rows } = await query(
      `UPDATE part_numbers SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Número de parte no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/config/parts/:partId error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este número de parte ya existe en esta workcell' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/config/parts/:partId (soft delete)
router.delete('/parts/:partId', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    if (isNaN(partId)) {
      return res.status(400).json({ error: 'partId inválido' });
    }

    const { rowCount } = await query(
      'UPDATE part_numbers SET active = false, updated_at = NOW() WHERE id = $1',
      [partId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Número de parte no encontrado' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/config/parts/:partId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// WORKCELLS
// ═══════════════════════════════════════════════════════════

// GET /api/config/workcells
router.get('/workcells', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM workcells ORDER BY code ASC'
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/config/workcells error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/config/workcells
router.post('/workcells', async (req, res) => {
  try {
    const { code, name, description, plc_protocol, plc_ip, plc_port, plc_slot,
            tag_total_parts, tag_good_parts, tag_scrap_parts,
            tag_machine_run, tag_fault_active, tag_fault_code, tag_shift_active } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'code y name son requeridos' });
    }

    // Crear workcell
    const { rows: wcRows } = await query(`
      INSERT INTO workcells (code, name, plc_protocol, plc_ip, plc_port, plc_slot,
        tag_total_parts, tag_good_parts, tag_scrap_parts,
        tag_machine_run, tag_fault_active, tag_fault_code, tag_shift_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [code, name, plc_protocol || 'modbus-tcp', plc_ip || '0.0.0.0',
        plc_port || 502, plc_slot || 0,
        tag_total_parts || null, tag_good_parts || null, tag_scrap_parts || null,
        tag_machine_run || null, tag_fault_active || null, tag_fault_code || null,
        tag_shift_active || null]);

    const workcell = wcRows[0];

    // Crear 3 turnos por defecto
    const { rows: shiftRows } = await query(`
      INSERT INTO shifts (workcell_id, shift_number, name, start_time, end_time, active_days) VALUES
        ($1, 1, 'Turno A', '06:00', '14:00', '{1,2,3,4,5}'),
        ($1, 2, 'Turno B', '14:00', '22:00', '{1,2,3,4,5}'),
        ($1, 3, 'Turno C', '22:00', '06:00', '{1,2,3,4,5}')
      RETURNING *
    `, [workcell.id]);

    // Inicializar plc_state
    await query(
      'INSERT INTO plc_state (workcell_id) VALUES ($1) ON CONFLICT (workcell_id) DO NOTHING',
      [workcell.id]
    );

    workcell.shifts = shiftRows;

    res.status(201).json(workcell);
  } catch (err) {
    console.error('POST /api/config/workcells error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una workcell con ese código' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/config/workcells/:id
router.put('/workcells/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }

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

    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await query(
      `UPDATE workcells SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Workcell no encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/config/workcells/:id error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una workcell con ese código' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════

// GET /api/config/users
router.get('/users', async (req, res) => {
  res.json([
    { username: 'admin', role: 'admin' },
    { username: 'supervisor', role: 'supervisor' },
    { username: 'operador', role: 'operator' },
  ]);
});

module.exports = router;
