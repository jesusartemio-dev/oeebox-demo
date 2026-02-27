const express = require('express');
const PDFDocument = require('pdfkit');
const { query } = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────

function pct(v) {
  return v != null ? `${Math.round(v * 100)}%` : '—';
}

function oeeColor(v) {
  const n = v != null ? v * 100 : 0;
  if (n >= 85) return '#22c55e';
  if (n >= 65) return '#eab308';
  return '#ef4444';
}

function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${s}s`;
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const EVENT_LABELS = {
  fault: 'Falla', starved: 'Sin Material', blocked: 'Bloqueado',
  changeover: 'Cambio', planned: 'Planeado', unplanned: 'Sin clasificar',
};

const SOURCE_LABELS = { plc: 'PLC', manual: 'Manual', both: 'Ambos' };

// ── PDF Drawing helpers ───────────────────────────────────

function drawHeader(doc, workcell, periodLabel, dateStr, pageW) {
  const headerH = 80;
  doc.rect(0, 0, pageW, headerH).fill('#1e3a5f');

  doc.fill('#ffffff').fontSize(22).font('Helvetica-Bold')
    .text('OEE BOX', 40, 18, { continued: false });

  doc.fontSize(11).font('Helvetica')
    .text(`${workcell.code} — ${workcell.name}`, 40, 44)
    .text(`Período: ${periodLabel}  |  Fecha: ${dateStr}`, 40, 59);

  const now = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  doc.fontSize(8).text(`Generado: ${now}`, pageW - 200, 62, { width: 160, align: 'right' });

  doc.fill('#000000');
  return headerH + 20;
}

function drawKpiBox(doc, x, y, w, h, label, value, color) {
  doc.rect(x, y, w, h).lineWidth(1).stroke('#cccccc');
  doc.fill(color).fontSize(24).font('Helvetica-Bold')
    .text(value, x, y + 10, { width: w, align: 'center' });
  doc.fill('#555555').fontSize(9).font('Helvetica')
    .text(label, x, y + 40, { width: w, align: 'center' });
}

function drawSectionTitle(doc, y, title) {
  doc.fontSize(12).font('Helvetica-Bold').fill('#1e3a5f').text(title, 40, y);
  doc.moveTo(40, y + 16).lineTo(555, y + 16).lineWidth(0.5).stroke('#cccccc');
  return y + 24;
}

function drawTableRow(doc, y, cols, values, opts = {}) {
  const { bold, bg, fontSize: fs } = opts;
  if (bg) {
    doc.rect(40, y - 2, 515, 16).fill(bg);
  }
  doc.fill(opts.color || '#333333').fontSize(fs || 8).font(bold ? 'Helvetica-Bold' : 'Helvetica');
  cols.forEach((col, i) => {
    doc.text(values[i] || '', col.x, y, { width: col.w, align: col.align || 'left' });
  });
  return y + 16;
}

function checkPage(doc, y, needed, pageH, pageW, footerText) {
  if (y + needed > pageH - 50) {
    drawFooter(doc, pageH, pageW, footerText);
    doc.addPage();
    return 40;
  }
  return y;
}

let pageNum = 0;
function drawFooter(doc, pageH, pageW, text) {
  pageNum++;
  doc.fontSize(7).font('Helvetica').fill('#999999');
  doc.text(text, 40, pageH - 30, { width: pageW - 80, align: 'left', lineBreak: false });
  doc.text(`Página ${pageNum}`, pageW - 100, pageH - 30, { width: 60, align: 'right', lineBreak: false });
}

// ── Main Route ────────────────────────────────────────────

router.get('/pdf/:workcellId', auth, async (req, res) => {
  try {
    const workcellId = parseInt(req.params.workcellId, 10);
    if (isNaN(workcellId)) {
      return res.status(400).json({ error: 'workcellId inválido' });
    }

    const period = req.query.period || 'day';
    let date = req.query.date;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Formato de fecha inválido, usar YYYY-MM-DD' });
    }
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    // ── 1. Recopilar datos ──────────────────────────────

    // a. Info workcell
    const { rows: wcRows } = await query('SELECT id, code, name FROM workcells WHERE id = $1', [workcellId]);
    if (wcRows.length === 0) {
      return res.status(404).json({ error: 'Workcell no encontrada' });
    }
    const workcell = wcRows[0];

    // Rango de fechas
    let rangeStart, rangeEnd, periodLabel;
    if (period === 'shift') {
      const hour = new Date().getHours();
      let shiftName, shiftStart, shiftEnd;
      if (hour >= 6 && hour < 14) {
        shiftName = 'Turno A'; shiftStart = '06:00:00'; shiftEnd = '14:00:00';
      } else if (hour >= 14 && hour < 22) {
        shiftName = 'Turno B'; shiftStart = '14:00:00'; shiftEnd = '22:00:00';
      } else {
        shiftName = 'Turno C'; shiftStart = '22:00:00'; shiftEnd = '06:00:00';
      }
      if (shiftName === 'Turno C') {
        rangeStart = `${date}T${shiftStart}`;
        // Turno C cruza medianoche
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        rangeEnd = `${nextDay.toISOString().slice(0, 10)}T${shiftEnd}`;
      } else {
        rangeStart = `${date}T${shiftStart}`;
        rangeEnd = `${date}T${shiftEnd}`;
      }
      periodLabel = `${shiftName} (${shiftStart.slice(0, 5)} - ${shiftEnd.slice(0, 5)})`;
    } else {
      rangeStart = `${date}T00:00:00`;
      rangeEnd = `${date}T23:59:59`;
      periodLabel = 'Día completo';
    }

    // b. OEE agregado
    const { rows: oeeRows } = await query(`
      SELECT
        AVG(oee) as oee, AVG(availability) as availability,
        AVG(performance) as performance, AVG(quality) as quality,
        SUM(good_parts) as good_parts, SUM(total_parts) as total_parts,
        SUM(scrap_parts) as scrap_parts,
        SUM(running_time) as running_time, SUM(available_time) as available_time
      FROM oee_records
      WHERE workcell_id = $1 AND period_start >= $2 AND period_start < $3
    `, [workcellId, rangeStart, rangeEnd]);
    const oee = oeeRows[0] || {};

    // c. Historial por hora
    const { rows: hourly } = await query(`
      SELECT date_trunc('hour', period_start) as hora, AVG(oee) as oee
      FROM oee_records
      WHERE workcell_id = $1 AND period_start >= $2 AND period_start < $3
      GROUP BY hora ORDER BY hora
    `, [workcellId, rangeStart, rangeEnd]);

    // d. Pareto top 5
    const { rows: pareto } = await query(`
      SELECT event_type,
        COALESCE(reason_label, fault_code, 'Sin clasificar') as causa,
        COUNT(*) as cantidad,
        SUM(duration_seconds) as total_segundos
      FROM events
      WHERE workcell_id = $1 AND started_at >= $2 AND started_at < $3 AND ended_at IS NOT NULL
      GROUP BY event_type, causa
      ORDER BY total_segundos DESC LIMIT 5
    `, [workcellId, rangeStart, rangeEnd]);

    // e. Eventos detallados (max 20)
    const { rows: events } = await query(`
      SELECT event_type, fault_code, reason_label,
        started_at, ended_at, duration_seconds, source
      FROM events
      WHERE workcell_id = $1 AND started_at >= $2 AND started_at < $3
      ORDER BY started_at DESC LIMIT 20
    `, [workcellId, rangeStart, rangeEnd]);

    // ── 2. Generar PDF ──────────────────────────────────

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 0, bottom: 40, left: 40, right: 40 } });
    const pageW = 612;
    const pageH = 792;
    const footerText = `OEE Box — Reporte generado el ${new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}`;

    pageNum = 0;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OEE-${workcell.code}-${date}.pdf"`);
    doc.pipe(res);

    // ── Header
    let y = drawHeader(doc, workcell, periodLabel, date, pageW);

    // ── KPI Boxes
    const kpiW = 120;
    const kpiGap = 12;
    const kpiStartX = 40;
    const kpis = [
      { label: 'OEE', value: oee.oee },
      { label: 'Disponibilidad', value: oee.availability },
      { label: 'Performance', value: oee.performance },
      { label: 'Calidad', value: oee.quality },
    ];
    kpis.forEach((k, i) => {
      drawKpiBox(doc, kpiStartX + i * (kpiW + kpiGap), y, kpiW, 58, k.label, pct(k.value), oeeColor(k.value));
    });
    y += 72;

    // ── Producción
    y = drawSectionTitle(doc, y, 'Producción');

    const prodCols = [
      { x: 40, w: 85, align: 'left' }, { x: 125, w: 85, align: 'center' },
      { x: 210, w: 85, align: 'center' }, { x: 295, w: 85, align: 'center' },
      { x: 380, w: 85, align: 'center' }, { x: 465, w: 90, align: 'center' },
    ];
    y = drawTableRow(doc, y, prodCols,
      ['', 'Partes Buenas', 'Scrap', 'Total', 'Tiempo Corr.', 'Tiempo Disp.'],
      { bold: true, bg: '#e8edf2' });
    y = drawTableRow(doc, y, prodCols, [
      'Valores',
      String(Math.round(oee.good_parts || 0)),
      String(Math.round(oee.scrap_parts || 0)),
      String(Math.round(oee.total_parts || 0)),
      `${Math.round((oee.running_time || 0) / 60)} min`,
      `${Math.round((oee.available_time || 0) / 60)} min`,
    ]);
    y += 16;

    // ── Gráfica de tendencia OEE
    y = checkPage(doc, y, 160, pageH, pageW, footerText);
    y = drawSectionTitle(doc, y, 'Tendencia OEE por Hora');

    if (hourly.length > 0) {
      const chartX = 60;
      const chartW = 480;
      const chartH = 110;
      const chartY = y;

      // Eje Y labels
      doc.fontSize(7).font('Helvetica').fill('#999999');
      doc.text('100%', 36, chartY - 3, { width: 24, align: 'right' });
      doc.text('50%', 36, chartY + chartH / 2 - 3, { width: 24, align: 'right' });
      doc.text('0%', 36, chartY + chartH - 3, { width: 24, align: 'right' });

      // Grid lines
      doc.moveTo(chartX, chartY).lineTo(chartX + chartW, chartY).lineWidth(0.3).stroke('#dddddd');
      doc.moveTo(chartX, chartY + chartH / 2).lineTo(chartX + chartW, chartY + chartH / 2).stroke('#dddddd');
      doc.moveTo(chartX, chartY + chartH).lineTo(chartX + chartW, chartY + chartH).lineWidth(0.5).stroke('#999999');

      // Barras
      const barW = Math.min(30, (chartW - 10) / hourly.length - 4);
      const totalBarSpace = hourly.length * (barW + 4);
      const barStartX = chartX + (chartW - totalBarSpace) / 2;

      hourly.forEach((h, i) => {
        const val = Number(h.oee) || 0;
        const barH = val * chartH;
        const bx = barStartX + i * (barW + 4);
        const by = chartY + chartH - barH;

        doc.rect(bx, by, barW, barH).fill(oeeColor(val));

        // Hora label
        const hourLabel = new Date(h.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        doc.fontSize(6).font('Helvetica').fill('#666666')
          .text(hourLabel, bx - 4, chartY + chartH + 3, { width: barW + 8, align: 'center' });
      });

      y = chartY + chartH + 20;
    } else {
      doc.fontSize(9).font('Helvetica').fill('#999999')
        .text('Sin datos de tendencia disponibles', 40, y);
      y += 20;
    }

    // ── Pareto de paros
    y = checkPage(doc, y, 120, pageH, pageW, footerText);
    y = drawSectionTitle(doc, y, 'Pareto de Paros');

    if (pareto.length > 0) {
      const paretoCols = [
        { x: 40, w: 150, align: 'left' }, { x: 190, w: 60, align: 'center' },
        { x: 250, w: 70, align: 'center' }, { x: 320, w: 50, align: 'center' },
        { x: 370, w: 185, align: 'left' },
      ];
      y = drawTableRow(doc, y, paretoCols, ['Causa', 'Eventos', 'Tiempo', '%', ''], { bold: true, bg: '#e8edf2' });

      const maxSeconds = Math.max(...pareto.map(p => Number(p.total_segundos) || 1));
      pareto.forEach((p, i) => {
        const secs = Number(p.total_segundos) || 0;
        const pctVal = maxSeconds > 0 ? Math.round(secs / pareto.reduce((s, pp) => s + (Number(pp.total_segundos) || 0), 0) * 100) : 0;
        const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
        y = drawTableRow(doc, y, paretoCols, [
          p.causa || '—',
          String(p.cantidad),
          `${Math.round(secs / 60)} min`,
          `${pctVal}%`,
          '',
        ], { bg });
        // Barra proporcional
        const barMaxW = 180;
        const barW = maxSeconds > 0 ? (secs / maxSeconds) * barMaxW : 0;
        doc.rect(372, y - 14, barW, 10).fill('#f59e0b');
        doc.fill('#333333');
      });
      y += 8;
    } else {
      doc.fontSize(9).font('Helvetica').fill('#999999')
        .text('Sin paros registrados en el período', 40, y);
      y += 20;
    }

    // ── Tabla de eventos
    y = checkPage(doc, y, 60, pageH, pageW, footerText);
    y = drawSectionTitle(doc, y, 'Eventos Detallados');

    if (events.length > 0) {
      const evCols = [
        { x: 40, w: 70, align: 'left' }, { x: 110, w: 80, align: 'left' },
        { x: 190, w: 160, align: 'left' }, { x: 350, w: 70, align: 'center' },
        { x: 420, w: 55, align: 'center' },
      ];
      y = drawTableRow(doc, y, evCols, ['Hora', 'Tipo', 'Causa', 'Duración', 'Fuente'], { bold: true, bg: '#e8edf2' });

      events.forEach((ev, i) => {
        y = checkPage(doc, y, 18, pageH, pageW, footerText);
        const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
        y = drawTableRow(doc, y, evCols, [
          formatTime(ev.started_at),
          EVENT_LABELS[ev.event_type] || ev.event_type,
          ev.reason_label || ev.fault_code || 'Sin clasificar',
          formatDuration(ev.duration_seconds),
          SOURCE_LABELS[ev.source] || ev.source,
        ], { bg });
      });
      y += 8;
    } else {
      doc.fontSize(9).font('Helvetica').fill('#999999')
        .text('Sin eventos registrados en el período', 40, y);
      y += 20;
    }

    // ── Sección Firma
    y = checkPage(doc, y, 100, pageH, pageW, footerText);
    y += 20;
    doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke('#cccccc');
    y += 20;

    doc.fontSize(10).font('Helvetica').fill('#333333');
    doc.text('Supervisor: _______________________________________', 40, y);
    y += 24;
    doc.text('Fecha:        _______________________________________', 40, y);
    y += 24;
    doc.text('Firma:         _______________________________________', 40, y);

    // ── Footer última página
    drawFooter(doc, pageH, pageW, footerText);

    doc.end();
  } catch (err) {
    console.error('GET /api/reports/pdf/:workcellId error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
});

module.exports = router;
