const express = require('express');
const { query } = require('../db/connection');

const router = express.Router();

// Validar y parsear una fecha ISO, retorna Date o null
function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/oee/current
router.get('/current', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT ps.*,
             w.code  AS workcell_code,
             w.name  AS workcell_name
        FROM plc_state ps
        JOIN workcells w ON w.id = ps.workcell_id
       WHERE w.active = true
       ORDER BY w.code ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/oee/current error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/oee/:workcellId/today
router.get('/:workcellId/today', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const { rows } = await query(`
      SELECT o.shift_id,
             s.name            AS shift_name,
             AVG(o.oee)          AS oee,
             AVG(o.availability) AS availability,
             AVG(o.performance)  AS performance,
             AVG(o.quality)      AS quality,
             SUM(o.good_parts)   AS good_parts,
             SUM(o.total_parts)  AS total_parts,
             SUM(o.scrap_parts)  AS scrap_parts,
             SUM(o.running_time)   AS running_time,
             SUM(o.available_time) AS available_time
        FROM oee_records o
        LEFT JOIN shifts s ON s.id = o.shift_id
       WHERE o.workcell_id = $1
         AND o.period_start >= CURRENT_DATE
       GROUP BY o.shift_id, s.name
       ORDER BY o.shift_id
    `, [workcellId]);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/oee/:workcellId/today error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/oee/:workcellId/history
router.get('/:workcellId/history', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    // Defaults: últimos 7 días
    const start = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = to || new Date();

    const values = [workcellId, start.toISOString(), end.toISOString()];

    let shiftFilter = '';
    if (req.query.shift_id) {
      const shiftId = parseInt(req.query.shift_id, 10);
      if (isNaN(shiftId)) {
        return res.status(400).json({ error: 'shift_id inválido' });
      }
      shiftFilter = 'AND o.shift_id = $4';
      values.push(shiftId);
    }

    const { rows } = await query(`
      SELECT date_trunc('hour', o.period_start) AS hora,
             AVG(o.oee)          AS oee,
             AVG(o.availability) AS availability,
             AVG(o.performance)  AS performance,
             AVG(o.quality)      AS quality,
             SUM(o.good_parts)   AS good_parts,
             SUM(o.total_parts)  AS total_parts
        FROM oee_records o
       WHERE o.workcell_id = $1
         AND o.period_start >= $2
         AND o.period_start <= $3
         ${shiftFilter}
       GROUP BY date_trunc('hour', o.period_start)
       ORDER BY hora ASC
    `, values);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/oee/:workcellId/history error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/oee/:workcellId/pareto
router.get('/:workcellId/pareto', async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    // Default: día actual
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const start = from || today;
    const end = to || tomorrow;

    const { rows } = await query(`
      WITH paros AS (
        SELECT COALESCE(e.reason_label, e.event_type) AS causa,
               e.event_type,
               COUNT(*)                   AS cantidad,
               SUM(e.duration_seconds)    AS total_segundos
          FROM events e
         WHERE e.workcell_id = $1
           AND e.started_at >= $2
           AND e.started_at < $3
           AND e.ended_at IS NOT NULL
         GROUP BY COALESCE(e.reason_label, e.event_type), e.event_type
      )
      SELECT causa,
             event_type,
             cantidad,
             ROUND(total_segundos::numeric, 1) AS total_segundos,
             CASE WHEN SUM(total_segundos) OVER () > 0
                  THEN ROUND((total_segundos / SUM(total_segundos) OVER () * 100)::numeric, 1)
                  ELSE 0
             END AS porcentaje
        FROM paros
       ORDER BY total_segundos DESC
    `, [workcellId, start.toISOString(), end.toISOString()]);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/oee/:workcellId/pareto error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
