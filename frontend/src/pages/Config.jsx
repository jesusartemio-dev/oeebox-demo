import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Factory, LogOut, ArrowLeft, Settings, Cpu, Clock, Package, Users,
  Plus, Pencil, Trash2, X, CheckCircle, XCircle, Loader2,
} from 'lucide-react';
import client from '../api/client';

// ── Toast ─────────────────────────────────────────────────
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
    <div className={`fixed top-4 right-4 z-[60] ${bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2`}>
      {type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────
function Spinner({ text = 'Cargando...' }) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-3">
      <Loader2 size={24} className="animate-spin" />
      <span>{text}</span>
    </div>
  );
}

// ── Day pills ─────────────────────────────────────────────
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function DayPills({ days = [] }) {
  return (
    <div className="flex gap-1">
      {DAY_LABELS.map((d, i) => {
        const dayNum = i + 1;
        const active = days.includes(dayNum);
        return (
          <span
            key={dayNum}
            className={`w-6 h-6 rounded text-xs font-medium flex items-center justify-center ${
              active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
            }`}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
}

// ── Active badge ──────────────────────────────────────────
function ActiveBadge({ active }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
    }`}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ── Role badge ────────────────────────────────────────────
const ROLE_STYLES = {
  admin: 'bg-red-500/20 text-red-400',
  supervisor: 'bg-yellow-500/20 text-yellow-400',
  operator: 'bg-blue-500/20 text-blue-400',
};

// ── Modal wrapper ─────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Workcell select dropdown ──────────────────────────────
function WorkcellSelect({ workcells, value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(Number(e.target.value))}
      className="bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="">Seleccionar workcell...</option>
      {workcells.map(wc => (
        <option key={wc.id} value={wc.id}>{wc.code} - {wc.name}</option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════
// WORKCELLS SECTION
// ═══════════════════════════════════════════════════════════

const PLC_PROTOCOLS = [
  { value: 'modbus-tcp', label: 'Modbus TCP' },
  { value: 'ethernet-ip', label: 'EtherNet/IP (Allen-Bradley)' },
  { value: 'opcua', label: 'OPC-UA (Siemens S7)' },
  { value: 'manual', label: 'Manual' },
];

const TAG_PLACEHOLDERS = {
  'modbus-tcp': 'HR100',
  'ethernet-ip': 'Program:Main.TotalParts',
  'opcua': 'ns=3;s="TotalParts"',
  'manual': '',
};

function WorkcellModal({ workcell, onClose, onSaved, onToast }) {
  const isEdit = !!workcell;
  const [form, setForm] = useState({
    code: '', name: '', plc_protocol: 'modbus-tcp', plc_ip: '', plc_port: 502, plc_slot: 0,
    tag_total_parts: '', tag_good_parts: '', tag_scrap_parts: '',
    tag_machine_run: '', tag_fault_active: '', tag_fault_code: '', tag_shift_active: '',
    ...(workcell || {}),
  });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSave() {
    if (!form.code || !form.name) {
      onToast('Code y Nombre son requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await client.put(`/config/workcells/${workcell.id}`, form);
        onToast('Workcell actualizada', 'success');
      } else {
        await client.post('/config/workcells', form);
        onToast('Workcell creada con turnos por defecto', 'success');
      }
      onSaved();
    } catch (err) {
      onToast(err.response?.data?.error || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none text-sm';

  return (
    <Modal title={isEdit ? 'Editar Workcell' : 'Nueva Workcell'} onClose={onClose}>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Code *</label>
            <input value={form.code} onChange={e => set('code', e.target.value)} className={inputCls} placeholder="L03" />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Nombre *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Ensamble Final" />
          </div>
        </div>

        <div className="border-t border-gray-700 pt-4">
          <p className="text-gray-400 text-xs font-semibold uppercase mb-3">Conexión PLC</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Protocolo</label>
              <select value={form.plc_protocol} onChange={e => set('plc_protocol', e.target.value)} className={inputCls}>
                {PLC_PROTOCOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">IP</label>
              <input value={form.plc_ip} onChange={e => set('plc_ip', e.target.value)} className={inputCls} placeholder="192.168.1.10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Puerto</label>
                <input type="number" value={form.plc_port} onChange={e => set('plc_port', Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Slot</label>
                <input type="number" value={form.plc_slot} onChange={e => set('plc_slot', Number(e.target.value))} className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-4">
          <p className="text-gray-400 text-xs font-semibold uppercase mb-3">Tags PLC</p>
          <div className="grid grid-cols-2 gap-3">
            {['tag_total_parts', 'tag_good_parts', 'tag_scrap_parts', 'tag_machine_run', 'tag_fault_active', 'tag_fault_code', 'tag_shift_active'].map(tag => (
              <div key={tag}>
                <label className="block text-gray-400 text-xs mb-1">{tag.replace(/^tag_/, '').replace(/_/g, ' ')}</label>
                <input value={form[tag] || ''} onChange={e => set(tag, e.target.value)} className={inputCls} placeholder={TAG_PLACEHOLDERS[form.plc_protocol] || tag} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded transition-colors">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}

function WorkcellsSection({ onToast }) {
  const [workcells, setWorkcells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editWc, setEditWc] = useState(undefined); // undefined=closed, null=new, obj=edit

  async function fetch() {
    try {
      const { data } = await client.get('/config/workcells');
      setWorkcells(data);
    } catch { /* */ }
    setLoading(false);
  }

  useEffect(() => { fetch(); }, []);

  if (loading) return <Spinner text="Cargando workcells..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Workcells</h2>
        <button onClick={() => setEditWc(null)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          <Plus size={16} /> Nueva Workcell
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">Protocolo PLC</th>
              <th className="text-left p-3">IP</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-left p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {workcells.map(wc => (
              <tr key={wc.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="p-3 text-white font-mono font-medium">{wc.code}</td>
                <td className="p-3 text-white">{wc.name}</td>
                <td className="p-3 text-gray-300">{wc.plc_protocol}</td>
                <td className="p-3 text-gray-300 font-mono text-xs">{wc.plc_ip}:{wc.plc_port}</td>
                <td className="p-3"><ActiveBadge active={wc.active} /></td>
                <td className="p-3">
                  <button onClick={() => setEditWc(wc)} className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors flex items-center gap-1">
                    <Pencil size={12} /> Editar
                  </button>
                </td>
              </tr>
            ))}
            {workcells.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">No hay workcells configuradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editWc !== undefined && (
        <WorkcellModal
          workcell={editWc}
          onClose={() => setEditWc(undefined)}
          onSaved={() => { setEditWc(undefined); fetch(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHIFTS SECTION
// ═══════════════════════════════════════════════════════════

function ShiftModal({ shift, onClose, onSaved, onToast }) {
  const [form, setForm] = useState({
    name: shift.name,
    start_time: shift.start_time?.slice(0, 5) || '06:00',
    end_time: shift.end_time?.slice(0, 5) || '14:00',
    active_days: [...(shift.active_days || [1, 2, 3, 4, 5])],
    active: shift.active !== false,
  });
  const [saving, setSaving] = useState(false);

  function toggleDay(day) {
    setForm(f => ({
      ...f,
      active_days: f.active_days.includes(day)
        ? f.active_days.filter(d => d !== day)
        : [...f.active_days, day].sort(),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await client.put(`/config/shifts/${shift.id}`, form);
      onToast('Turno actualizado', 'success');
      onSaved();
    } catch (err) {
      onToast(err.response?.data?.error || 'Error al guardar turno', 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none text-sm';

  return (
    <Modal title="Editar Turno" onClose={onClose}>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-gray-400 text-sm mb-1">Nombre del turno</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Hora inicio</label>
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Hora fin</label>
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-gray-400 text-sm mb-2">Días activos</label>
          <div className="flex gap-2">
            {DAY_LABELS.map((d, i) => {
              const dayNum = i + 1;
              const active = form.active_days.includes(dayNum);
              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => toggleDay(dayNum)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-gray-400 text-sm">Estado:</label>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, active: !f.active }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.active ? 'bg-green-600' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.active ? 'translate-x-6' : ''}`} />
          </button>
          <span className={`text-sm ${form.active ? 'text-green-400' : 'text-gray-500'}`}>{form.active ? 'Activo' : 'Inactivo'}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded transition-colors">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}

function ShiftsSection({ onToast }) {
  const [workcells, setWorkcells] = useState([]);
  const [selectedWcId, setSelectedWcId] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editShift, setEditShift] = useState(null);

  useEffect(() => {
    client.get('/config/workcells').then(r => {
      const wcs = (r.data || []).filter(w => w.active);
      setWorkcells(wcs);
      if (wcs.length > 0) setSelectedWcId(wcs[0].id);
    }).catch(() => {});
  }, []);

  async function fetchShifts() {
    if (!selectedWcId) return;
    setLoading(true);
    try {
      const { data } = await client.get(`/config/shifts/${selectedWcId}`);
      setShifts(data);
    } catch { setShifts([]); }
    setLoading(false);
  }

  useEffect(() => { fetchShifts(); }, [selectedWcId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Turnos</h2>
        <WorkcellSelect workcells={workcells} value={selectedWcId} onChange={setSelectedWcId} />
      </div>

      {loading ? <Spinner text="Cargando turnos..." /> : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Hora inicio</th>
                <th className="text-left p-3">Hora fin</th>
                <th className="text-left p-3">Días activos</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 text-gray-400">{s.shift_number}</td>
                  <td className="p-3 text-white font-medium">{s.name}</td>
                  <td className="p-3 text-gray-300 font-mono">{s.start_time?.slice(0, 5)}</td>
                  <td className="p-3 text-gray-300 font-mono">{s.end_time?.slice(0, 5)}</td>
                  <td className="p-3"><DayPills days={s.active_days} /></td>
                  <td className="p-3"><ActiveBadge active={s.active} /></td>
                  <td className="p-3">
                    <button onClick={() => setEditShift(s)} className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors flex items-center gap-1">
                      <Pencil size={12} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 && !loading && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                  {selectedWcId ? 'No hay turnos configurados' : 'Selecciona una workcell'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editShift && (
        <ShiftModal
          shift={editShift}
          onClose={() => setEditShift(null)}
          onSaved={() => { setEditShift(null); fetchShifts(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PARTS SECTION
// ═══════════════════════════════════════════════════════════

function PartModal({ part, workcellId, onClose, onSaved, onToast }) {
  const isEdit = !!part;
  const [form, setForm] = useState({
    part_number: '', description: '', ideal_cycle_time: '',
    ...(part ? { part_number: part.part_number, description: part.description || '', ideal_cycle_time: part.ideal_cycle_time } : {}),
  });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSave() {
    if (!form.part_number) { onToast('Número de parte es requerido', 'error'); return; }
    const ct = parseFloat(form.ideal_cycle_time);
    if (isNaN(ct) || ct <= 0) { onToast('Cycle time debe ser un número positivo', 'error'); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await client.put(`/config/parts/${part.id}`, { ...form, ideal_cycle_time: ct });
        onToast('Número de parte actualizado', 'success');
      } else {
        await client.post(`/config/parts/${workcellId}`, { ...form, ideal_cycle_time: ct });
        onToast('Número de parte creado', 'success');
      }
      onSaved();
    } catch (err) {
      onToast(err.response?.data?.error || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none text-sm';

  return (
    <Modal title={isEdit ? 'Editar Número de Parte' : 'Agregar Número de Parte'} onClose={onClose}>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-gray-400 text-sm mb-1">Número de Parte *</label>
          <input value={form.part_number} onChange={e => set('part_number', e.target.value)} className={inputCls} placeholder="PN-1003" />
        </div>
        <div>
          <label className="block text-gray-400 text-sm mb-1">Descripción</label>
          <input value={form.description} onChange={e => set('description', e.target.value)} className={inputCls} placeholder="Descripción del parte" />
        </div>
        <div>
          <label className="block text-gray-400 text-sm mb-1">Ideal Cycle Time (segundos) *</label>
          <input type="number" step="0.1" min="0.1" value={form.ideal_cycle_time} onChange={e => set('ideal_cycle_time', e.target.value)} className={inputCls} placeholder="12.5" />
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded transition-colors">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}

function PartsSection({ onToast }) {
  const [workcells, setWorkcells] = useState([]);
  const [selectedWcId, setSelectedWcId] = useState(null);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editPart, setEditPart] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    client.get('/config/workcells').then(r => {
      const wcs = (r.data || []).filter(w => w.active);
      setWorkcells(wcs);
      if (wcs.length > 0) setSelectedWcId(wcs[0].id);
    }).catch(() => {});
  }, []);

  async function fetchParts() {
    if (!selectedWcId) return;
    setLoading(true);
    try {
      const { data } = await client.get(`/config/parts/${selectedWcId}`);
      setParts(data);
    } catch { setParts([]); }
    setLoading(false);
  }

  useEffect(() => { fetchParts(); }, [selectedWcId]);

  async function handleDelete(partId) {
    try {
      await client.delete(`/config/parts/${partId}`);
      onToast('Número de parte eliminado', 'success');
      setDeleting(null);
      fetchParts();
    } catch (err) {
      onToast(err.response?.data?.error || 'Error al eliminar', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Números de Parte</h2>
        <div className="flex items-center gap-3">
          <WorkcellSelect workcells={workcells} value={selectedWcId} onChange={setSelectedWcId} />
          {selectedWcId && (
            <button onClick={() => setEditPart(null)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
              <Plus size={16} /> Agregar Parte
            </button>
          )}
        </div>
      </div>

      {loading ? <Spinner text="Cargando números de parte..." /> : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-3">Número de Parte</th>
                <th className="text-left p-3">Descripción</th>
                <th className="text-right p-3">Cycle Time (seg)</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(p => (
                <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 text-white font-mono font-medium">{p.part_number}</td>
                  <td className="p-3 text-gray-300">{p.description || '—'}</td>
                  <td className="p-3 text-right text-white font-mono">{p.ideal_cycle_time}</td>
                  <td className="p-3"><ActiveBadge active={p.active} /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditPart(p)} className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors flex items-center gap-1">
                        <Pencil size={12} /> Editar
                      </button>
                      {p.active && (
                        <button onClick={() => setDeleting(p.id)} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded transition-colors flex items-center gap-1">
                          <Trash2 size={12} /> Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {parts.length === 0 && !loading && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">
                  {selectedWcId ? 'No hay números de parte' : 'Selecciona una workcell'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editPart !== undefined && (
        <PartModal
          part={editPart}
          workcellId={selectedWcId}
          onClose={() => setEditPart(undefined)}
          onSaved={() => { setEditPart(undefined); fetchParts(); }}
          onToast={onToast}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal title="Confirmar eliminación" onClose={() => setDeleting(null)}>
          <div className="p-4">
            <p className="text-gray-300">¿Eliminar este número de parte?</p>
            <p className="text-gray-500 text-sm mt-1">Se marcará como inactivo y no se podrá usar en nuevos registros.</p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
            <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button onClick={() => handleDelete(deleting)} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors">Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// USERS SECTION
// ═══════════════════════════════════════════════════════════

function UsersSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/config/users')
      .then(r => setUsers(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner text="Cargando usuarios..." />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Usuarios</h2>

      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left p-3">Username</th>
              <th className="text-left p-3">Rol</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.username} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="p-3 text-white font-medium">{u.username}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[u.role] || ROLE_STYLES.operator}`}>
                    {u.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
        <Settings size={20} className="text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-blue-400 text-sm font-medium">Gestión de usuarios</p>
          <p className="text-gray-400 text-sm mt-1">La gestión avanzada de usuarios estará disponible próximamente.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN CONFIG PAGE
// ═══════════════════════════════════════════════════════════

const NAV_ITEMS = [
  { key: 'workcells', label: 'Workcells', icon: Cpu },
  { key: 'shifts', label: 'Turnos', icon: Clock },
  { key: 'parts', label: 'Números de Parte', icon: Package },
  { key: 'users', label: 'Usuarios', icon: Users },
];

export default function Config() {
  const navigate = useNavigate();
  const [section, setSection] = useState('workcells');
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });

  function showToast(message, type = 'success') {
    setToast({ message, type, visible: true });
  }

  // Verify admin role
  const user = useMemo(() => {
    const token = localStorage.getItem('oee_token');
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
  }, []);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

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
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 text-sm">Configuración</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={16} /> Volver al Dashboard
          </button>
          {user && <span className="text-sm text-gray-400">{user.username}</span>}
          <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 bg-gray-800 border-r border-gray-700 p-3 shrink-0 overflow-y-auto">
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3 px-2">Secciones</h2>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors flex items-center gap-2.5 ${
                section === item.key
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-gray-400 hover:bg-gray-700 border border-transparent'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          {section === 'workcells' && <WorkcellsSection onToast={showToast} />}
          {section === 'shifts' && <ShiftsSection onToast={showToast} />}
          {section === 'parts' && <PartsSection onToast={showToast} />}
          {section === 'users' && <UsersSection />}
        </main>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
