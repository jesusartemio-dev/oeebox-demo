import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  Factory, Wifi, WifiOff, LogOut, Activity, AlertTriangle, CheckCircle,
  XCircle, Clock, Hash, Trash2, Zap, X, Filter, MessageSquare, Plus, Settings, FileText,
  ShieldCheck, ShieldOff, Monitor,
} from 'lucide-react';
import useWebSocket from '../hooks/useWebSocket';
import client from '../api/client';
import { API_URL } from '../config';

// ── Gauge SVG ──────────────────────────────────────────────
function Gauge({ value = 0, label, size = 160 }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = pct >= 85 ? '#22c55e' : pct >= 65 ? '#eab308' : '#ef4444';
  const r = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const circumference = Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#374151" strokeWidth="12" strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy - 15} textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">
          {pct}%
        </text>
      </svg>
      <span className="text-gray-400 text-sm mt-1">{label}</span>
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color = 'text-white' }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
        <Icon size={16} />
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────
function MachineStatus({ running, fault }) {
  if (fault) return <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={16} /> Fault</span>;
  if (running) return <span className="flex items-center gap-1 text-green-400"><CheckCircle size={16} /> Running</span>;
  return <span className="flex items-center gap-1 text-yellow-400"><XCircle size={16} /> Stopped</span>;
}

// ── Tabs component ─────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            active === t.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────
function OverviewTab({ wc, onOpenManualModal, licenseValid }) {
  const [todayData, setTodayData] = useState({ runMins: 0, availMins: 0 });

  useEffect(() => {
    if (!wc) return;

    function fetchToday() {
      client.get(`/oee/${wc.workcell_id}/today`)
        .then(r => {
          const rows = r.data || [];
          const runMins = Math.round(rows.reduce((s, r) => s + Number(r.running_time || 0), 0) / 60);
          const availMins = Math.round(rows.reduce((s, r) => s + Number(r.available_time || 0), 0) / 60);
          setTodayData({ runMins, availMins });
        })
        .catch(() => {});
    }

    fetchToday();
    const id = setInterval(fetchToday, 30000);
    return () => clearInterval(id);
  }, [wc?.workcell_id]);

  if (!wc) return null;

  const fmt = (v) => `${Math.round((v || 0) * 100)}%`;

  return (
    <div className="space-y-6">
      {/* Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex justify-center">
          <Gauge value={wc.oee} label="OEE" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex justify-center">
          <Gauge value={wc.availability} label="Availability" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex justify-center">
          <Gauge value={wc.performance} label="Performance" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex justify-center">
          <Gauge value={wc.quality} label="Quality" />
        </div>
      </div>

      {/* Formula */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-center gap-3 text-lg flex-wrap">
        <span className="font-bold text-blue-400">OEE {fmt(wc.oee)}</span>
        <span className="text-gray-500">=</span>
        <span className="text-green-400">{fmt(wc.availability)}</span>
        <span className="text-gray-500">&times;</span>
        <span className="text-purple-400">{fmt(wc.performance)}</span>
        <span className="text-gray-500">&times;</span>
        <span className="text-orange-400">{fmt(wc.quality)}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={Hash} label="Partes Buenas" value={wc.raw_good_parts ?? 0} color="text-green-400" />
        <KpiCard icon={Trash2} label="Scrap" value={wc.raw_scrap_parts ?? 0} color="text-red-400" />
        <KpiCard icon={Clock} label="Tiempo Corriendo" value={`${todayData.runMins} min`} color="text-blue-400" />
        <KpiCard icon={Clock} label="Tiempo Disponible" value={`${todayData.availMins} min`} color="text-cyan-400" />
        <KpiCard
          icon={Activity}
          label="Estado Máquina"
          value={<MachineStatus running={wc.machine_running} fault={wc.fault_active} />}
        />
        <KpiCard
          icon={wc.connected ? Wifi : WifiOff}
          label="Conexión PLC"
          value={wc.connected ? 'Conectado' : 'Desconectado'}
          color={wc.connected ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* Floating button */}
      <button
        onClick={onOpenManualModal}
        disabled={!licenseValid}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors z-40 ${
          licenseValid
            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30'
            : 'bg-red-600/50 text-white/50 cursor-not-allowed'
        }`}
        title={licenseValid ? 'Registrar Paro Manual' : 'Requiere licencia válida'}
      >
        <Plus size={28} />
      </button>
    </div>
  );
}

// ── Tendencia Tab ──────────────────────────────────────────
function TrendTab({ workcellId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workcellId) return;

    function fetchHistory() {
      client.get(`/oee/${workcellId}/history`)
        .then(r => setHistory(r.data || []))
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    }

    setLoading(true);
    fetchHistory();
    const id = setInterval(fetchHistory, 60000);
    return () => clearInterval(id);
  }, [workcellId]);

  const averages = useMemo(() => {
    if (history.length === 0) return null;
    const sum = (key) => history.reduce((s, h) => s + Number(h[key] || 0), 0) / history.length;
    return { oee: sum('oee'), availability: sum('availability'), performance: sum('performance'), quality: sum('quality') };
  }, [history]);

  const pctTooltip = (v) => `${(v * 100).toFixed(1)}%`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-3">
        <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
        <span>Cargando datos históricos...</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">
        <Clock size={48} className="mx-auto mb-4 text-gray-600" />
        <p className="text-lg">Sin datos históricos disponibles</p>
        <p className="text-sm mt-1">Los datos aparecerán cuando el motor OEE genere registros</p>
      </div>
    );
  }

  const METRICS = [
    { key: 'oee', label: 'OEE', color: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-400' },
    { key: 'availability', label: 'Disponibilidad', color: '#22c55e', bg: 'bg-green-500/10', text: 'text-green-400' },
    { key: 'performance', label: 'Performance', color: '#a855f7', bg: 'bg-purple-500/10', text: 'text-purple-400' },
    { key: 'quality', label: 'Calidad', color: '#f97316', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map(m => (
          <div key={m.key} className={`${m.bg} rounded-lg p-4 border border-gray-700`}>
            <p className="text-gray-400 text-sm">{m.label} promedio</p>
            <p className={`text-2xl font-bold ${m.text}`}>
              {averages ? `${Math.round(averages[m.key] * 100)}%` : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700" style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="hora"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={(v) => new Date(v).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              angle={-30} textAnchor="end" height={50}
            />
            <YAxis
              tick={{ fill: '#9ca3af' }}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#f3f4f6' }}
              labelFormatter={(v) => new Date(v).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              formatter={(v, name) => [pctTooltip(v), name]}
            />
            <Legend />
            {METRICS.map(m => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Shared event type styles ───────────────────────────────
const EVENT_TYPE_STYLES = {
  fault: { bg: 'bg-red-500/10', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', label: 'Falla' },
  starved: { bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-400', label: 'Sin Material' },
  blocked: { bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', label: 'Bloqueado' },
  changeover: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400', label: 'Cambio' },
  planned: { bg: 'bg-green-500/10', text: 'text-green-400', badge: 'bg-green-500/20 text-green-400', label: 'Planeado' },
  unplanned: { bg: 'bg-gray-500/10', text: 'text-gray-400', badge: 'bg-gray-500/20 text-gray-400', label: 'Sin clasificar' },
};

const SOURCE_BADGE = {
  plc: 'bg-blue-500/20 text-blue-400',
  manual: 'bg-green-500/20 text-green-400',
  both: 'bg-yellow-500/20 text-yellow-400',
};

function formatDuration(seconds) {
  if (seconds == null) return null;
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

// ── Toast Notification ────────────────────────────────────
function Toast({ message, type, visible, onHide }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onHide, 3000);
      return () => clearTimeout(t);
    }
  }, [visible, onHide]);

  if (!visible) return null;

  const bg = type === 'error' ? 'bg-red-600' : 'bg-green-600';

  return (
    <div className={`fixed top-4 right-4 z-[60] ${bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-opacity`}>
      {type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ── Classify Modal ─────────────────────────────────────────
function ClassifyModal({ eventId, onClose, onSaved, onToast }) {
  const [reasonCodes, setReasonCodes] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.get('/events/reason-codes')
      .then(r => setReasonCodes(r.data || []))
      .catch(() => {});
  }, []);

  // Group by category
  const grouped = useMemo(() => {
    const map = {};
    for (const rc of reasonCodes) {
      if (!map[rc.category]) map[rc.category] = [];
      map[rc.category].push(rc);
    }
    return map;
  }, [reasonCodes]);

  async function handleSave() {
    if (!selectedCode) return;
    setSaving(true);
    const rc = reasonCodes.find(r => r.code === selectedCode);
    try {
      await client.put(`/events/${eventId}/classify`, {
        reason_code: selectedCode,
        reason_label: rc?.label || selectedCode,
        comment: comment || null,
      });
      if (onToast) onToast('Evento clasificado correctamente', 'success');
      onSaved();
    } catch {
      if (onToast) onToast('Error al clasificar evento', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Clasificar Evento</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Razón de paro</label>
            <select
              value={selectedCode}
              onChange={e => setSelectedCode(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Seleccionar razón...</option>
              {Object.entries(grouped).map(([cat, codes]) => (
                <optgroup key={cat} label={cat}>
                  {codes.map(rc => (
                    <option key={rc.code} value={rc.code}>{rc.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Comentario (opcional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
              placeholder="Agregar comentario..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedCode || saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Stop Modal ─────────────────────────────────────
const MANUAL_EVENT_TYPES = [
  { value: 'fault', label: 'Falla' },
  { value: 'starved', label: 'Sin Material' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'changeover', label: 'Cambio de referencia' },
  { value: 'planned', label: 'Mantenimiento planeado' },
  { value: 'unplanned', label: 'Sin clasificar' },
];

function ManualStopModal({ workcellId, onClose, onSaved, onToast }) {
  const [reasonCodes, setReasonCodes] = useState([]);
  const [eventType, setEventType] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [reasonLabel, setReasonLabel] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.get('/events/reason-codes')
      .then(r => setReasonCodes(r.data || []))
      .catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    for (const rc of reasonCodes) {
      if (!map[rc.category]) map[rc.category] = [];
      map[rc.category].push(rc);
    }
    return map;
  }, [reasonCodes]);

  function handleReasonChange(code) {
    setSelectedCode(code);
    const rc = reasonCodes.find(r => r.code === code);
    setReasonLabel(rc?.label || '');
  }

  async function handleSave() {
    if (!eventType || !reasonLabel.trim()) return;
    setSaving(true);
    try {
      await client.post(`/events/${workcellId}/manual`, {
        event_type: eventType,
        reason_code: selectedCode || null,
        reason_label: reasonLabel.trim(),
        comment: comment || null,
      });
      if (onToast) onToast('Paro registrado correctamente', 'success');
      onSaved();
    } catch {
      if (onToast) onToast('Error al registrar paro', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Registrar Paro Manual</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Tipo de paro</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Seleccionar tipo...</option>
              {MANUAL_EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Razón</label>
            <select
              value={selectedCode}
              onChange={e => handleReasonChange(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Seleccionar razón...</option>
              {Object.entries(grouped).map(([cat, codes]) => (
                <optgroup key={cat} label={cat}>
                  {codes.map(rc => (
                    <option key={rc.code} value={rc.code}>{rc.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Comentario (opcional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
              placeholder="Descripción adicional..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!eventType || !reasonLabel.trim() || saving}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded transition-colors"
          >
            {saving ? 'Abriendo...' : 'Abrir Paro'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Eventos Tab ────────────────────────────────────────────
const EVENT_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'fault', label: 'Fallas' },
  { key: 'starved', label: 'Sin Material' },
  { key: 'other', label: 'Otros' },
];

function EventsTab({ workcellId, onOpenManualModal, onToast, licenseValid }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [classifyId, setClassifyId] = useState(null);

  function fetchEvents() {
    if (!workcellId) return;
    client.get(`/events/${workcellId}`)
      .then(r => setEvents(r.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }

  async function handleCloseEvent(eventId) {
    try {
      await client.put(`/events/${eventId}/close`);
      if (onToast) onToast('Paro cerrado correctamente', 'success');
      fetchEvents();
    } catch {
      if (onToast) onToast('Error al cerrar paro', 'error');
    }
  }

  useEffect(() => {
    if (!workcellId) return;
    setLoading(true);
    fetchEvents();
    const id = setInterval(fetchEvents, 30000);
    return () => clearInterval(id);
  }, [workcellId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'other') return events.filter(e => e.event_type !== 'fault' && e.event_type !== 'starved');
    return events.filter(e => e.event_type === filter);
  }, [events, filter]);

  const summary = useMemo(() => ({
    total: events.length,
    unclassified: events.filter(e => !e.reason_code).length,
    downMins: Math.round(events.reduce((s, e) => s + Number(e.duration_seconds || 0), 0) / 60),
  }), [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-3">
        <div className="w-6 h-6 border-2 border-gray-600 border-t-red-500 rounded-full animate-spin" />
        <span>Cargando eventos...</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={onOpenManualModal}
            disabled={!licenseValid}
            className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              licenseValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600/50 opacity-50 cursor-not-allowed'
            }`}
            title={licenseValid ? undefined : 'Requiere licencia válida'}
          >
            <Plus size={16} />
            Registrar Paro
          </button>
        </div>
        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-600" />
          <p className="text-lg">Sin eventos registrados hoy</p>
          <p className="text-sm mt-1">No se han detectado paros en esta workcell</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards + manual button */}
      <div className="flex items-start gap-4">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total eventos</p>
            <p className="text-2xl font-bold text-white">{summary.total}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Sin clasificar</p>
            <p className={`text-2xl font-bold ${summary.unclassified > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {summary.unclassified}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Tiempo paro total</p>
            <p className="text-2xl font-bold text-red-400">{summary.downMins} min</p>
          </div>
        </div>
        <button
          onClick={onOpenManualModal}
          disabled={!licenseValid}
          className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shrink-0 ${
            licenseValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600/50 opacity-50 cursor-not-allowed'
          }`}
          title={licenseValid ? undefined : 'Requiere licencia válida'}
        >
          <Plus size={16} />
          Registrar Paro
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={16} className="text-gray-500" />
        {EVENT_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left p-3">Hora</th>
              <th className="text-left p-3">Duración</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Código PLC</th>
              <th className="text-left p-3">Causa</th>
              <th className="text-left p-3">Fuente</th>
              <th className="text-left p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ev => {
              const style = EVENT_TYPE_STYLES[ev.event_type] || { bg: 'bg-gray-500/10', badge: 'bg-gray-500/20 text-gray-400', label: ev.event_type };
              const srcStyle = SOURCE_BADGE[ev.source] || SOURCE_BADGE.plc;
              const srcLabel = ev.source === 'plc' ? 'PLC' : ev.source === 'manual' ? 'Manual' : 'Ambos';
              return (
                <tr key={ev.id} className={`${style.bg} border-b border-gray-700/50`}>
                  <td className="p-3 text-white font-mono">
                    {new Date(ev.started_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="p-3">
                    {ev.ended_at
                      ? <span className="text-white">{formatDuration(ev.duration_seconds)}</span>
                      : <span className="text-red-400 text-xs font-medium animate-pulse">EN CURSO</span>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>{style.label}</span>
                  </td>
                  <td className="p-3 text-gray-300 font-mono text-xs">{ev.fault_code || '—'}</td>
                  <td className="p-3">
                    {ev.reason_label
                      ? <span className="text-white flex items-center gap-1"><MessageSquare size={12} className="text-green-400" />{ev.reason_label}</span>
                      : <span className="text-gray-500 italic">Sin clasificar</span>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${srcStyle}`}>{srcLabel}</span>
                  </td>
                  <td className="p-3">
                    {ev.source === 'manual' && !ev.ended_at ? (
                      <button
                        onClick={() => handleCloseEvent(ev.id)}
                        disabled={!licenseValid}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          licenseValid
                            ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40'
                            : 'bg-red-600/10 text-red-400/50 cursor-not-allowed'
                        }`}
                        title={licenseValid ? undefined : 'Requiere licencia válida'}
                      >
                        Cerrar Paro
                      </button>
                    ) : !ev.reason_code ? (
                      <button
                        onClick={() => setClassifyId(ev.id)}
                        disabled={!licenseValid}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          licenseValid
                            ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40'
                            : 'bg-blue-600/10 text-blue-400/50 cursor-not-allowed'
                        }`}
                        title={licenseValid ? undefined : 'Requiere licencia válida'}
                      >
                        Clasificar
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Classify modal */}
      {classifyId && (
        <ClassifyModal
          eventId={classifyId}
          onClose={() => setClassifyId(null)}
          onSaved={() => { setClassifyId(null); fetchEvents(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ── Pareto Tab ─────────────────────────────────────────────

function ParetoTab({ workcellId }) {
  const [pareto, setPareto] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workcellId) return;

    function fetchPareto() {
      client.get(`/oee/${workcellId}/pareto`)
        .then(r => setPareto((r.data || []).map(p => ({
          ...p,
          total_segundos: Number(p.total_segundos),
          total_segundos_min: Math.round(Number(p.total_segundos) / 60 * 10) / 10,
          cantidad: Number(p.cantidad),
          porcentaje: Number(p.porcentaje),
        }))))
        .catch(() => setPareto([]))
        .finally(() => setLoading(false));
    }

    setLoading(true);
    fetchPareto();
    const id = setInterval(fetchPareto, 60000);
    return () => clearInterval(id);
  }, [workcellId]);

  const totals = useMemo(() => {
    if (pareto.length === 0) return null;
    return {
      minutos: Math.round(pareto.reduce((s, p) => s + p.total_segundos, 0) / 60),
      eventos: pareto.reduce((s, p) => s + p.cantidad, 0),
      topCausa: pareto[0]?.causa || '—',
    };
  }, [pareto]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-3">
        <div className="w-6 h-6 border-2 border-gray-600 border-t-yellow-500 rounded-full animate-spin" />
        <span>Cargando datos de pareto...</span>
      </div>
    );
  }

  if (pareto.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">
        <CheckCircle size={48} className="mx-auto mb-4 text-green-600" />
        <p className="text-lg">Sin paros registrados hoy</p>
        <p className="text-sm mt-1">No se han detectado paros en esta workcell</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Tiempo total paro</p>
          <p className="text-2xl font-bold text-yellow-400">{totals.minutos} min</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total eventos</p>
          <p className="text-2xl font-bold text-white">{totals.eventos}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Causa principal</p>
          <p className="text-lg font-bold text-red-400 truncate">{totals.topCausa}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700" style={{ height: Math.max(300, pareto.length * 45 + 60) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pareto} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              type="number"
              tick={{ fill: '#9ca3af' }}
              tickFormatter={(v) => `${Math.round(v)} min`}
            />
            <YAxis dataKey="causa" type="category" tick={{ fill: '#9ca3af', fontSize: 12 }} width={120} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#f3f4f6' }}
              formatter={(v, name, props) => [`${v} min (${props.payload.porcentaje}%)`, 'Duración']}
            />
            <Bar dataKey="total_segundos_min" name="Duración" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left p-3">Causa</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-right p-3">Eventos</th>
              <th className="text-right p-3">Tiempo (min)</th>
              <th className="text-right p-3">% del total</th>
            </tr>
          </thead>
          <tbody>
            {pareto.map((p, i) => {
              const style = EVENT_TYPE_STYLES[p.event_type] || { bg: 'bg-gray-500/10', text: 'text-gray-400', label: p.event_type };
              return (
                <tr key={i} className={`${style.bg} border-b border-gray-700/50`}>
                  <td className="p-3 text-white">{p.causa}</td>
                  <td className={`p-3 ${style.text}`}>{style.label}</td>
                  <td className="p-3 text-right text-white">{p.cantidad}</td>
                  <td className="p-3 text-right text-white">{p.total_segundos_min}</td>
                  <td className="p-3 text-right text-yellow-400">{p.porcentaje}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Report Modal ──────────────────────────────────────────
function ReportModal({ workcellId, onClose, onToast }) {
  const [period, setPeriod] = useState('day');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    if (onToast) onToast('Generando PDF...', 'success');
    try {
      const token = localStorage.getItem('oee_token');
      const response = await fetch(`${API_URL}/api/reports/pdf/${workcellId}?period=${period}&date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Error al generar PDF');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `OEE-reporte-${date}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      if (onToast) onToast('PDF descargado', 'success');
      onClose();
    } catch {
      if (onToast) onToast('Error al descargar PDF', 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Generar Reporte PDF</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Período</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="shift">Turno actual</option>
              <option value="day">Día completo</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded transition-colors flex items-center gap-2"
          >
            <FileText size={14} />
            {downloading ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
const MAIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'trend', label: 'Tendencia' },
  { key: 'events', label: 'Eventos' },
  { key: 'pareto', label: 'Pareto' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: wsData, connected: wsConnected } = useWebSocket();
  const [selectedWcId, setSelectedWcId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const [showManualModal, setShowManualModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [license, setLicense] = useState(null);
  const [plantInfo, setPlantInfo] = useState(null);

  // Fetch license status + plant info
  useEffect(() => {
    client.get('/license/status')
      .then(r => setLicense(r.data))
      .catch(() => setLicense({ valid: false, reason: 'No se pudo verificar licencia' }));
    client.get('/config/plant-info')
      .then(r => setPlantInfo(r.data))
      .catch(() => {});
  }, []);

  function showToast(message, type = 'success') {
    setToast({ message, type, visible: true });
  }

  const licenseValid = license?.valid === true;

  // Workcells list from WS
  const workcells = useMemo(() => {
    if (!Array.isArray(wsData)) return [];
    return wsData;
  }, [wsData]);

  // Auto-select first workcell
  useEffect(() => {
    if (workcells.length > 0 && selectedWcId === null) {
      setSelectedWcId(workcells[0].workcell_id);
    }
  }, [workcells, selectedWcId]);

  const selectedWc = useMemo(
    () => workcells.find(w => w.workcell_id === selectedWcId) || null,
    [workcells, selectedWcId]
  );

  // User from JWT
  const user = useMemo(() => {
    const token = localStorage.getItem('oee_token');
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch {
      return null;
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem('oee_token');
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Factory size={24} className="text-blue-500" />
          <span className="text-xl font-bold">OEE Box</span>
          <span className="text-gray-500 hidden sm:inline">|</span>
          <span className="text-gray-400 text-sm hidden sm:inline">{plantInfo?.plantName || '...'}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {wsConnected
              ? <Wifi size={16} className="text-green-400" />
              : <WifiOff size={16} className="text-red-400" />}
            <span className="text-sm text-gray-400 hidden sm:inline">
              {wsConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <a
            href="/andon"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-sm rounded-lg transition-colors"
            title="Abrir Andon Board en nueva pestaña"
          >
            <Monitor size={14} />
            <span className="hidden sm:inline">Andon</span>
          </a>
          {selectedWcId && (
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-sm rounded-lg transition-colors"
              title="Generar Reporte PDF"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">Reporte</span>
            </button>
          )}
          {license && (
            licenseValid ? (
              <span
                className="flex items-center gap-1 px-2 py-0.5 bg-green-500/15 text-green-400 text-xs font-medium rounded-full cursor-default"
                title={`${license.companyName} — ${license.customerName} — vence ${new Date(license.expiresAt).toLocaleDateString('es-MX')}`}
              >
                <ShieldCheck size={12} /> Licenciado
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/15 text-red-400 text-xs font-medium rounded-full cursor-default" title={license.reason || 'Sin licencia'}>
                <ShieldOff size={12} /> Sin licencia
              </span>
            )
          )}
          {user && <span className="text-sm text-gray-400">{user.username}</span>}
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/config')} className="text-gray-400 hover:text-white transition-colors" title="Configuración">
              <Settings size={18} />
            </button>
          )}
          <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* License warning banner */}
      {license && !license.valid && (
        <div className="bg-yellow-600/20 border-b border-yellow-600/40 px-6 py-2 flex items-center gap-2 text-yellow-300 text-sm shrink-0">
          <AlertTriangle size={16} />
          <span className="font-medium">Modo lectura</span>
          <span className="text-yellow-400/80">— Sistema sin licencia válida. Contacte a GYS Automation para activar.</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-48 bg-gray-800 border-r border-gray-700 p-3 shrink-0 overflow-y-auto hidden md:block">
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3 px-2">Workcells</h2>
          {workcells.length === 0 && (
            <p className="text-gray-500 text-sm px-2">Esperando datos...</p>
          )}
          {workcells.map(wc => (
            <button
              key={wc.workcell_id}
              onClick={() => setSelectedWcId(wc.workcell_id)}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm transition-colors flex items-center gap-2 ${
                selectedWcId === wc.workcell_id
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-gray-400 hover:bg-gray-700 border border-transparent'
              }`}
            >
              <Zap size={14} className={wc.machine_running ? 'text-green-400' : 'text-gray-600'} />
              <div>
                <div className="font-medium">{wc.workcell_code}</div>
                <div className="text-xs text-gray-500">{wc.workcell_name}</div>
              </div>
            </button>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Mobile workcell select */}
          <div className="md:hidden mb-4">
            <select
              value={selectedWcId || ''}
              onChange={e => setSelectedWcId(Number(e.target.value))}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-2"
            >
              {workcells.map(wc => (
                <option key={wc.workcell_id} value={wc.workcell_id}>
                  {wc.workcell_code} - {wc.workcell_name}
                </option>
              ))}
            </select>
          </div>

          {selectedWc ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold">{selectedWc.workcell_code} - {selectedWc.workcell_name}</h1>
                  <p className="text-gray-500 text-sm">
                    Actualizado: {selectedWc.last_update ? new Date(selectedWc.last_update).toLocaleTimeString('es-MX') : '—'}
                  </p>
                </div>
                <Tabs tabs={MAIN_TABS} active={activeTab} onChange={setActiveTab} />
              </div>

              {activeTab === 'overview' && <OverviewTab wc={selectedWc} onOpenManualModal={() => setShowManualModal(true)} licenseValid={licenseValid} />}
              {activeTab === 'trend' && <TrendTab workcellId={selectedWcId} />}
              {activeTab === 'events' && <EventsTab workcellId={selectedWcId} onOpenManualModal={() => setShowManualModal(true)} onToast={showToast} licenseValid={licenseValid} />}
              {activeTab === 'pareto' && <ParetoTab workcellId={selectedWcId} />}
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>Esperando conexión con las workcells...</p>
            </div>
          )}
        </main>
      </div>

      {/* Report Modal */}
      {showReportModal && selectedWcId && (
        <ReportModal
          workcellId={selectedWcId}
          onClose={() => setShowReportModal(false)}
          onToast={showToast}
        />
      )}

      {/* Manual Stop Modal */}
      {showManualModal && selectedWcId && (
        <ManualStopModal
          workcellId={selectedWcId}
          onClose={() => setShowManualModal(false)}
          onSaved={() => setShowManualModal(false)}
          onToast={showToast}
        />
      )}

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
