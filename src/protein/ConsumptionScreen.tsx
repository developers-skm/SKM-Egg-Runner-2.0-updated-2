import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  getTodayEntries, getTodayStats, getTrackerSettings,
  logManualEntry, deleteLogEntry,
  FOOD_DATABASE, FOOD_CATEGORIES,
  type ProteinLogEntry, type DailyStats, type TrackerSettings, type FoodItem,
} from '../services/protein/proteinTrackerService';
import {
  EggIcon, FoodLogIcon, SearchIcon, PlusIcon, TrashIcon, CloseIcon, CameraIcon, ChevronDownIcon,
} from './Icons';

interface ConsumptionScreenProps {
  user: User;
  onScanQR: () => void;
  refreshKey: number;
}

type MealFilter = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_FILTERS: { key: MealFilter; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch'     },
  { key: 'dinner',    label: 'Dinner'    },
  { key: 'snack',     label: 'Snack'     },
];

const MEAL_OPTIONS: ProteinLogEntry['meal'][] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface AddForm {
  foodName: string;
  protein: string;
  calories: string;
  quantity: string;
  meal: ProteinLogEntry['meal'];
  category: string;
}

const EMPTY_FORM: AddForm = { foodName: '', protein: '', calories: '', quantity: '1', meal: 'breakfast', category: 'Other' };

export default function ConsumptionScreen({ user, onScanQR, refreshKey }: ConsumptionScreenProps) {
  const [entries,  setEntries]  = useState<ProteinLogEntry[]>([]);
  const [stats,    setStats]    = useState<DailyStats | null>(null);
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [mealTab,  setMealTab]  = useState<MealFilter>('all');
  const [showAdd,  setShowAdd]  = useState(false);
  const [showFood, setShowFood] = useState(false);
  const [search,   setSearch]   = useState('');
  const [catFilter,setCatFilter]= useState('All');
  const [form,     setForm]     = useState<AddForm>(EMPTY_FORM);
  const [formErr,  setFormErr]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s, stg] = await Promise.all([
        getTodayEntries(user.uid),
        getTodayStats(user.uid),
        getTrackerSettings(user.uid),
      ]);
      setEntries(e); setStats(s); setSettings(stg);
    } catch (e) { console.error('[Consumption]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const goal      = settings?.dailyGoal ?? 60;
  const consumed  = stats?.totalProtein  ?? 0;
  const pct       = Math.min(100, Math.round((consumed / goal) * 100));
  const remaining = Math.max(0, goal - consumed);
  const filtered  = mealTab === 'all' ? entries : entries.filter(e => e.meal === mealTab);

  const foodResults = FOOD_DATABASE.filter(f =>
    (catFilter === 'All' || f.category === catFilter) &&
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectFood = (food: FoodItem) => {
    setForm(f => ({ ...f, foodName: food.name, protein: String(food.protein), calories: String(food.calories), category: food.category }));
    setShowFood(false);
    setShowAdd(true);
  };

  const handleAddEntry = async () => {
    const name = form.foodName.trim();
    const prot = parseFloat(form.protein);
    const cal  = parseFloat(form.calories || '0');
    const qty  = parseInt(form.quantity || '1', 10);
    if (!name)               { setFormErr('Food name is required.'); return; }
    if (isNaN(prot) || prot < 0) { setFormErr('Enter a valid protein amount.'); return; }
    if (isNaN(qty) || qty < 1)   { setFormErr('Quantity must be at least 1.'); return; }
    setSaving(true); setFormErr('');
    try {
      await logManualEntry(user.uid, { foodName: name, protein: prot, calories: cal, quantity: qty, meal: form.meal, category: form.category });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      await load();
    } catch { setFormErr('Failed to save. Please try again.'); }
    finally   { setSaving(false); }
  };

  const handleDelete = async (entry: ProteinLogEntry) => {
    setDeleting(entry.id);
    try {
      await deleteLogEntry(user.uid, entry.id, entry.protein * entry.quantity, entry.calories * entry.quantity, entry.type === 'qr_scan');
      await load();
    } catch { /* ignore */ }
    finally   { setDeleting(null); }
  };

  const mealTotal = (m: MealFilter) =>
    entries.filter(e => m === 'all' || e.meal === m).reduce((s, e) => s + e.protein, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Food Log</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={onScanQR} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)',
            border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 12,
            padding: '8px 14px', borderRadius: 12, backdropFilter: 'blur(8px)',
          }}>
            <CameraIcon size={14} color="#fff" /> Scan QR
          </button>
        </div>
        {/* Progress bar */}
        <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#22C55E' : 'rgba(255,255,255,0.9)', borderRadius: 4, transition: 'width 600ms ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{consumed}g consumed</span>
          <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>{remaining}g remaining</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '14px 16px 0' }}>
          {[
            { label: 'Protein',  value: `${consumed}g`,          icon: <EggIcon size={16} color="#D71920" /> },
            { label: 'Eggs',     value: `${stats?.totalEggs ?? 0}`, icon: <EggIcon size={16} color="#D71920" /> },
            { label: 'Entries',  value: `${entries.length}`,     icon: <FoodLogIcon size={16} color="#D71920" /> },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 16, padding: '12px 10px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{s.icon}</div>
              <p style={{ fontSize: 17, fontWeight: 900, color: '#D71920', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, marginTop: 3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Meal tabs */}
        <div style={{ padding: '12px 16px 0', overflowX: 'auto', display: 'flex', gap: 8, scrollbarWidth: 'none' }}>
          {MEAL_FILTERS.map(tab => (
            <button key={tab.key} onClick={() => setMealTab(tab.key)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              background: mealTab === tab.key ? '#D71920' : '#fff',
              color:      mealTab === tab.key ? '#fff' : '#666',
              boxShadow:  mealTab === tab.key ? '0 3px 10px rgba(215,25,32,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'all 150ms ease',
            }}>
              {tab.label}
              {mealTotal(tab.key) > 0 && (
                <span style={{ fontSize: 9, fontWeight: 900, opacity: 0.8 }}>{mealTotal(tab.key)}g</span>
              )}
            </button>
          ))}
        </div>

        {/* Entry list */}
        <div style={{ padding: '12px 16px 0' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 24, padding: 28, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: '#FCE8E8', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FoodLogIcon size={28} color="#D71920" />
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px' }}>No entries yet</p>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 18px', lineHeight: 1.5 }}>Scan an egg QR or add food manually to start tracking.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onScanQR} style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Scan QR
                </button>
                <button onClick={() => setShowFood(true)} style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: '1.5px solid #E8E8E8', cursor: 'pointer', background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 12 }}>
                  Add Food
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(entry => (
                <div key={entry.id} style={{ background: '#fff', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: entry.type === 'qr_scan' ? '#FCE8E8' : '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {entry.type === 'qr_scan'
                      ? <EggIcon size={20} color="#D71920" />
                      : <FoodLogIcon size={20} color="#666" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.foodName}</p>
                    <p style={{ fontSize: 10, color: '#999', margin: 0, marginTop: 2, textTransform: 'capitalize' }}>
                      {entry.meal} · qty {entry.quantity}
                      {entry.type === 'qr_scan' && <span style={{ color: '#D71920', fontWeight: 700, marginLeft: 4 }}>QR</span>}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 900, color: '#D71920', margin: 0 }}>+{entry.protein}g</p>
                    <p style={{ fontSize: 10, color: '#bbb', margin: 0 }}>{entry.calories} kcal</p>
                  </div>
                  <button onClick={() => handleDelete(entry)} disabled={deleting === entry.id}
                    style={{ width: 30, height: 30, borderRadius: 9, background: '#FEE2E2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {deleting === entry.id
                      ? <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #fca5a5', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
                      : <TrashIcon size={13} color="#D71920" />}
                  </button>
                </div>
              ))}

              {/* Add more */}
              <button onClick={() => setShowFood(true)} style={{
                width: '100%', padding: '12px 0', borderRadius: 16, border: '1.5px dashed rgba(215,25,32,0.3)',
                background: '#FCE8E8', color: '#D71920', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <PlusIcon size={16} color="#D71920" /> Add Food Entry
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Food Picker Modal ── */}
      {showFood && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowFood(false)}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '24px 24px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F5F5F5' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Select Food</h3>
              <button onClick={() => setShowFood(false)} style={{ width: 30, height: 30, borderRadius: '50%', background: '#F5F5F5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CloseIcon size={15} color="#666" />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                  <SearchIcon size={16} color="#999" />
                </div>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search foods…"
                  style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 12, border: '1.5px solid #E8E8E8', fontSize: 13, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', background: '#F8F8F8' }} />
              </div>
            </div>

            {/* Category chips */}
            <div style={{ padding: '0 16px 10px', overflowX: 'auto', display: 'flex', gap: 7, scrollbarWidth: 'none', flexShrink: 0 }}>
              {FOOD_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)} style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700,
                  background: catFilter === cat ? '#D71920' : '#F0F0F0',
                  color:      catFilter === cat ? '#fff' : '#666',
                }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Food list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Quick add custom */}
                <button onClick={() => { setShowFood(false); setShowAdd(true); }} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: '#FCE8E8', borderRadius: 16, border: '1.5px dashed rgba(215,25,32,0.4)', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: '#D71920', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <PlusIcon size={18} color="#fff" />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#D71920', margin: 0 }}>Add Custom Food</p>
                    <p style={{ fontSize: 10, color: '#999', margin: 0 }}>Enter name, protein and calories manually</p>
                  </div>
                </button>

                {foodResults.map(food => (
                  <button key={food.name} onClick={() => selectFood(food)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: '#fff', borderRadius: 16, border: '1px solid #F0F0F0', cursor: 'pointer', textAlign: 'left',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <EggIcon size={18} color="#D71920" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{food.name}</p>
                      <p style={{ fontSize: 10, color: '#999', margin: 0, marginTop: 1 }}>{food.category} · {food.serving}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 900, color: '#D71920', margin: 0 }}>{food.protein}g</p>
                      <p style={{ fontSize: 10, color: '#bbb', margin: 0 }}>{food.calories} kcal</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Entry Modal ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setFormErr(''); }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '24px 24px 0 0', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F5F5F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Add Food Entry</h3>
              <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setFormErr(''); }}
                style={{ width: 30, height: 30, borderRadius: '50%', background: '#F5F5F5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CloseIcon size={15} color="#666" />
              </button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Food Name">
                <input type="text" value={form.foodName} onChange={e => setForm(f => ({ ...f, foodName: e.target.value }))}
                  placeholder="e.g. Boiled SKM Egg"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #E8E8E8', fontSize: 13, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <Field label="Protein (g)">
                  <input type="number" min="0" value={form.protein} onChange={e => setForm(f => ({ ...f, protein: e.target.value }))}
                    placeholder="0"
                    style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: '1.5px solid #E8E8E8', fontSize: 14, fontWeight: 700, color: '#D71920', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                </Field>
                <Field label="Calories">
                  <input type="number" min="0" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))}
                    placeholder="0"
                    style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: '1.5px solid #E8E8E8', fontSize: 14, fontWeight: 700, color: '#1A1A1A', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                </Field>
                <Field label="Quantity">
                  <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="1"
                    style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: '1.5px solid #E8E8E8', fontSize: 14, fontWeight: 700, color: '#1A1A1A', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                </Field>
              </div>

              <Field label="Meal">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {MEAL_OPTIONS.map(m => (
                    <button key={m} onClick={() => setForm(f => ({ ...f, meal: m }))} style={{
                      padding: '9px 4px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                      background: form.meal === m ? '#D71920' : '#F5F5F5',
                      color:      form.meal === m ? '#fff'    : '#666',
                    }}>
                      {m}
                    </button>
                  ))}
                </div>
              </Field>

              {formErr && <p style={{ fontSize: 12, color: '#D71920', textAlign: 'center', margin: 0 }}>{formErr}</p>}

              <button onClick={handleAddEntry} disabled={saving} style={{
                width: '100%', padding: '14px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
                fontWeight: 900, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase',
                boxShadow: '0 6px 18px rgba(215,25,32,0.4)', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving…' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
