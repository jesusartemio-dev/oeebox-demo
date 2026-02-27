import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// ── WebSocket directo (sin auth) ──────────────────────────
function useAndonWebSocket() {
  const [data, setData] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (Array.isArray(parsed)) setData(parsed);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { data, connected };
}

// ── Reloj en tiempo real ──────────────────────────────────
function useClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const formatted = now.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const time = now.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Capitalize first letter
  const display = `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}  ${time}`;

  return display;
}

// ── Color por OEE ─────────────────────────────────────────
function oeeColor(val) {
  const pct = Math.round((val || 0) * 100);
  if (pct >= 85) return '#22c55e';
  if (pct >= 65) return '#eab308';
  return '#ef4444';
}

function pct(val) {
  return `${Math.round((val || 0) * 100)}%`;
}

// ── Estado de máquina ─────────────────────────────────────
function MachineState({ running, fault, large }) {
  const base = large ? 'text-4xl font-bold' : 'text-2xl font-bold';

  if (fault) {
    return (
      <span className={`${base} text-red-500 animate-pulse`}>
        ▲ FALLA
      </span>
    );
  }
  if (running) {
    return (
      <span className={`${base} text-green-400`}>
        <span className="inline-block animate-pulse">●</span> RUNNING
      </span>
    );
  }
  return (
    <span className={`${base} text-yellow-400`}>
      ■ DETENIDA
    </span>
  );
}

// ── Fullscreen button ─────────────────────────────────────
function FullscreenBtn() {
  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <button
      onClick={toggle}
      className="fixed top-3 right-4 z-50 text-gray-500 hover:text-white text-sm px-2 py-1 rounded bg-gray-900/50 hover:bg-gray-800 transition-colors"
    >
      ⛶ Pantalla completa
    </button>
  );
}

// ── Card para una workcell (modo grid) ────────────────────
function WorkcellCard({ wc }) {
  const isFault = wc.fault_active;

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 rounded-2xl transition-all ${
        isFault
          ? 'bg-red-950 border-4 border-red-500 animate-pulse'
          : 'bg-gray-900 border border-gray-800'
      }`}
    >
      {/* Workcell name */}
      <h2 className="text-4xl font-bold text-white mb-2 tracking-wide">
        {wc.workcell_code}
      </h2>
      <p className="text-gray-500 text-lg mb-4">{wc.workcell_name}</p>

      {/* OEE */}
      <div
        className="text-8xl font-black mb-4 tabular-nums"
        style={{ color: oeeColor(wc.oee) }}
      >
        {pct(wc.oee)}
      </div>

      {/* A P Q */}
      <div className="flex gap-8 mb-6">
        <div className="text-center">
          <span className="text-3xl font-bold text-green-400">{pct(wc.availability)}</span>
          <p className="text-gray-500 text-sm">Disp</p>
        </div>
        <div className="text-center">
          <span className="text-3xl font-bold text-purple-400">{pct(wc.performance)}</span>
          <p className="text-gray-500 text-sm">Rend</p>
        </div>
        <div className="text-center">
          <span className="text-3xl font-bold text-orange-400">{pct(wc.quality)}</span>
          <p className="text-gray-500 text-sm">Cal</p>
        </div>
      </div>

      {/* Parts */}
      <div className="flex gap-8 mb-6">
        <div className="text-center">
          <span className="text-2xl font-bold text-green-400">{wc.raw_good_parts ?? 0}</span>
          <p className="text-gray-500 text-sm">Buenas</p>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-red-400">{wc.raw_scrap_parts ?? 0}</span>
          <p className="text-gray-500 text-sm">Scrap</p>
        </div>
      </div>

      {/* Machine state */}
      <div className="mb-3">
        <MachineState running={wc.machine_running} fault={wc.fault_active} />
      </div>

      {/* Fault code */}
      {isFault && wc.fault_code > 0 && (
        <p className="text-red-400 text-xl font-mono animate-pulse">
          Código: {wc.fault_code}
        </p>
      )}
    </div>
  );
}

// ── Vista: Todas las workcells ────────────────────────────
function AndonGrid({ workcells, plantInfo }) {
  const clock = useClock();

  const gridClass = useMemo(() => {
    const n = workcells.length;
    if (n <= 1) return 'grid-cols-1';
    if (n === 2) return 'grid-cols-2';
    return 'grid-cols-2';
  }, [workcells.length]);

  const headerTitle = plantInfo
    ? `${plantInfo.companyName} | ${plantInfo.plantName}`
    : '...';

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 shrink-0">
        <span className="text-white text-2xl font-bold tracking-wider">{headerTitle}</span>
        <span className="text-white text-xl font-mono tracking-wide">{clock}</span>
      </header>

      {/* Grid */}
      <div className={`flex-1 grid ${gridClass} gap-4 p-4`}>
        {workcells.map(wc => (
          <WorkcellCard key={wc.workcell_id} wc={wc} />
        ))}
      </div>

      {workcells.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-3xl">
          Esperando datos de workcells...
        </div>
      )}
    </div>
  );
}

// ── Vista: Una workcell (pantalla completa) ───────────────
function AndonSingle({ wc }) {
  const navigate = useNavigate();
  const clock = useClock();
  const isFault = wc.fault_active;

  return (
    <div
      onClick={() => navigate('/andon')}
      className={`min-h-screen flex flex-col items-center justify-center cursor-pointer ${
        isFault ? 'bg-red-950' : 'bg-black'
      }`}
    >
      {/* Clock top-left */}
      <div className="fixed top-3 left-4 text-gray-500 font-mono text-sm z-10">{clock}</div>

      {/* Workcell name */}
      <h1 className="text-5xl font-bold text-white mb-2 tracking-wider">{wc.workcell_code}</h1>
      <p className="text-gray-500 text-xl mb-8">{wc.workcell_name}</p>

      {/* OEE huge */}
      <div
        className="font-black mb-8 tabular-nums"
        style={{ color: oeeColor(wc.oee), fontSize: 'clamp(8rem, 20vw, 16rem)' }}
      >
        {pct(wc.oee)}
      </div>

      {/* A P Q */}
      <div className="flex gap-16 mb-10">
        <div className="text-center">
          <span className="text-5xl font-bold text-green-400">{pct(wc.availability)}</span>
          <p className="text-gray-500 text-lg">Disponibilidad</p>
        </div>
        <div className="text-center">
          <span className="text-5xl font-bold text-purple-400">{pct(wc.performance)}</span>
          <p className="text-gray-500 text-lg">Rendimiento</p>
        </div>
        <div className="text-center">
          <span className="text-5xl font-bold text-orange-400">{pct(wc.quality)}</span>
          <p className="text-gray-500 text-lg">Calidad</p>
        </div>
      </div>

      {/* Parts */}
      <div className="flex gap-16 mb-10">
        <div className="text-center">
          <span className="text-4xl font-bold text-green-400">{wc.raw_good_parts ?? 0}</span>
          <p className="text-gray-500 text-lg">Partes Buenas</p>
        </div>
        <div className="text-center">
          <span className="text-4xl font-bold text-red-400">{wc.raw_scrap_parts ?? 0}</span>
          <p className="text-gray-500 text-lg">Scrap</p>
        </div>
      </div>

      {/* Machine state */}
      <div className="mb-4">
        <MachineState running={wc.machine_running} fault={wc.fault_active} large />
      </div>

      {/* Fault code */}
      {isFault && wc.fault_code > 0 && (
        <p className="text-red-400 text-3xl font-mono animate-pulse">
          Código: {wc.fault_code}
        </p>
      )}
    </div>
  );
}

// ── Hook para plant info (sin auth) ──────────────────────
function usePlantInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch('/api/config/plant-info')
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  return info;
}

// ── Componente principal ──────────────────────────────────
export default function Andon() {
  const { code } = useParams();
  const { data: workcells, connected } = useAndonWebSocket();
  const plantInfo = usePlantInfo();

  // Single workcell mode
  if (code) {
    const wc = workcells.find(
      w => w.workcell_code?.toLowerCase() === code.toLowerCase()
    );

    if (!wc && workcells.length > 0) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-3xl">
          Workcell "{code}" no encontrada
        </div>
      );
    }

    if (!wc) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center text-gray-600 text-3xl">
          Conectando...
        </div>
      );
    }

    return (
      <>
        <FullscreenBtn />
        <AndonSingle wc={wc} />
      </>
    );
  }

  // Grid mode
  return (
    <>
      <FullscreenBtn />
      <AndonGrid workcells={workcells} plantInfo={plantInfo} />
    </>
  );
}
