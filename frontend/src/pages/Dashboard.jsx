import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  Factory, Wifi, WifiOff, LogOut, Activity, AlertTriangle, CheckCircle,
  XCircle, Clock, Hash, Trash2, Zap,
} from 'lucide-react';
import useWebSocket from '../hooks/useWebSocket';
import client from '../api/client';

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
function OverviewTab({ wc }) {
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

// ── Eventos Tab ────────────────────────────────────────────
function EventsTab() {
  return (
    <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">
      <AlertTriangle size={48} className="mx-auto mb-4 text-gray-600" />
      <p className="text-lg">Sin eventos registrados</p>
      <p className="text-sm mt-1">Los eventos aparecerán aquí cuando se detecten paros</p>
    </div>
  );
}

// ── Pareto Tab ─────────────────────────────────────────────
const EVENT_TYPE_STYLES = {
  fault: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Falla' },
  starved: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Starved' },
  blocked: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Bloqueado' },
  changeover: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Cambio' },
  planned: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Planeado' },
};

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
          <span className="text-gray-400 text-sm hidden sm:inline">Planta Industrial</span>
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
          {user && <span className="text-sm text-gray-400">{user.username}</span>}
          <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </header>

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

              {activeTab === 'overview' && <OverviewTab wc={selectedWc} />}
              {activeTab === 'trend' && <TrendTab workcellId={selectedWcId} />}
              {activeTab === 'events' && <EventsTab />}
              {activeTab === 'pareto' && <ParetoTab workcellId={selectedWcId} />}
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>Esperando conexión con las workcells...</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
