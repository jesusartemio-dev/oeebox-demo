const express = require('express');
const { query } = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/events/reason-codes
router.get('/reason-codes', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, code, label, category, event_type FROM reason_codes WHERE active = true ORDER BY category ASC, label ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/events/reason-codes error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/events/:workcellId
router.get('/:workcellId', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    // Fecha: default hoy
    let date = req.query.date;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Formato de fecha inválido, usar YYYY-MM-DD' });
    }
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const values = [workcellId, dayStart, dayEnd];
    let shiftFilter = '';

    if (req.query.shift_id) {
      const shiftId = parseInt(req.query.shift_id, 10);
      if (isNaN(shiftId)) {
        return res.status(400).json({ error: 'shift_id inválido' });
      }
      shiftFilter = 'AND o.shift_id = $4';
      values.push(shiftId);
    }

    const sql = req.query.shift_id
      ? `SELECT e.id, e.event_type, e.fault_code, e.fault_code_raw,
                e.reason_code, e.reason_label, e.comment, e.source,
                e.started_at, e.ended_at, e.duration_seconds, e.acknowledged_at,
                rc.label AS reason_code_label, rc.category AS reason_category
           FROM events e
           LEFT JOIN reason_codes rc ON rc.code = e.reason_code
           LEFT JOIN oee_records o ON o.id = e.oee_record_id
          WHERE e.workcell_id = $1
            AND e.started_at >= $2
            AND e.started_at <= $3
            ${shiftFilter}
          ORDER BY e.started_at DESC`
      : `SELECT e.id, e.event_type, e.fault_code, e.fault_code_raw,
                e.reason_code, e.reason_label, e.comment, e.source,
                e.started_at, e.ended_at, e.duration_seconds, e.acknowledged_at,
                rc.label AS reason_code_label, rc.category AS reason_category
           FROM events e
           LEFT JOIN reason_codes rc ON rc.code = e.reason_code
          WHERE e.workcell_id = $1
            AND e.started_at >= $2
            AND e.started_at <= $3
          ORDER BY e.started_at DESC`;

    const { rows } = await query(sql, values);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/events/:workcellId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/events/:eventId/classify
router.put('/:eventId/classify', auth, async (req, res) => {
  if (!global.licenseInfo || !global.licenseInfo.valid) {
    return res.status(403).json({ error: 'Sistema en modo lectura. Licencia requerida.' });
  }

  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'eventId inválido' });
    }

    const { reason_code, reason_label, comment, operator_id } = req.body;

    const { rows } = await query(`
      UPDATE events SET
        reason_code = $1,
        reason_label = $2,
        comment = $3,
        operator_id = $4,
        acknowledged_at = NOW(),
        source = 'both'
      WHERE id = $5
      RETURNING *
    `, [reason_code || null, reason_label || null, comment || null, operator_id || null, eventId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/events/:eventId/classify error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/events/:workcellId/manual
const ALLOWED_EVENT_TYPES = ['fault', 'starved', 'blocked', 'changeover', 'planned', 'unplanned'];

router.post('/:workcellId/manual', auth, async (req, res) => {
  if (!global.licenseInfo || !global.licenseInfo.valid) {
    return res.status(403).json({ error: 'Sistema en modo lectura. Licencia requerida.' });
  }

  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const { event_type, reason_code, reason_label, comment } = req.body;

    if (!event_type || !ALLOWED_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({
        error: `event_type inválido. Debe ser uno de: ${ALLOWED_EVENT_TYPES.join(', ')}`,
      });
    }

    if (!reason_label || reason_label.trim() === '') {
      return res.status(400).json({ error: 'reason_label es requerido' });
    }

    const { rows } = await query(`
      INSERT INTO events (workcell_id, started_at, event_type, reason_code, reason_label, comment, source)
      VALUES ($1, NOW(), $2, $3, $4, $5, 'manual')
      RETURNING *
    `, [workcellId, event_type, reason_code || null, reason_label.trim(), comment || null]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/events/:workcellId/manual error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/events/:eventId/close
router.put('/:eventId/close', auth, async (req, res) => {
  if (!global.licenseInfo || !global.licenseInfo.valid) {
    return res.status(403).json({ error: 'Sistema en modo lectura. Licencia requerida.' });
  }

  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'eventId inválido' });
    }

    // Verificar que el evento existe y está abierto
    const { rows: existing } = await query(
      'SELECT id, ended_at FROM events WHERE id = $1',
      [eventId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    if (existing[0].ended_at !== null) {
      return res.status(400).json({ error: 'El evento ya está cerrado' });
    }

    const { rows } = await query(`
      UPDATE events SET
        ended_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
      WHERE id = $1
      RETURNING *
    `, [eventId]);

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/events/:eventId/close error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
