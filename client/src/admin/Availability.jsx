import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2, Copy, Save, CalendarOff, CalendarPlus, Clock4, Timer, Hourglass, CalendarRange, Eye, X } from 'lucide-react';
import { Button, EmptyState, Field, Spinner, Toggle } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api, qs } from '../lib/api.js';
import { addDays, fmtDateMedium, fmtDayShort, fmtTime, todayParis } from '../lib/format.js';

const DAYS = [
  [1, 'Lundi'],
  [2, 'Mardi'],
  [3, 'Mercredi'],
  [4, 'Jeudi'],
  [5, 'Vendredi'],
  [6, 'Samedi'],
  [7, 'Dimanche'],
];
const DEFAULT_RANGE = { start: '09:00', end: '12:00' };

function RangeEditor({ ranges, onChange }) {
  const set = (i, k, v) => onChange(ranges.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => {
    const last = ranges.at(-1);
    const start = last ? last.end : '09:00';
    const [h, m] = start.split(':').map(Number);
    const end = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange([...ranges, { start, end: end > start ? end : '23:59' }]);
  };
  return (
    <div className="ranges">
      {ranges.map((r, i) => (
        <div className={`range ${r.start >= r.end ? 'range--invalid' : ''}`} key={i}>
          <input type="time" className="input input--sm" value={r.start} step={300} onChange={(e) => set(i, 'start', e.target.value)} aria-label="Début" />
          <span className="range__sep">→</span>
          <input type="time" className="input input--sm" value={r.end} step={300} onChange={(e) => set(i, 'end', e.target.value)} aria-label="Fin" />
          <button type="button" className="icon-btn icon-btn--danger" onClick={() => onChange(ranges.filter((_, j) => j !== i))} aria-label="Supprimer la plage">
            <X size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="link-btn ranges__add" onClick={add}>
        <Plus size={15} /> Ajouter une plage
      </button>
    </div>
  );
}

function groupOverrides(list) {
  const groups = [];
  for (const o of list) {
    const g = groups.at(-1);
    if (g && o.kind === 'blocked' && g.kind === 'blocked' && g.reason === o.reason && addDays(g.end, 1) === o.date) {
      g.end = o.date;
      g.ids.push(o.id);
    } else groups.push({ ...o, start: o.date, end: o.date, ids: [o.id] });
  }
  return groups;
}

export default function Availability() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState([]);
  const [preview, setPreview] = useState(null);
  const [ov, setOv] = useState({ kind: 'blocked', date: '', endDate: '', ranges: [DEFAULT_RANGE], reason: '' });
  const [ovErrors, setOvErrors] = useState({});
  const [adding, setAdding] = useState(false);

  const today = todayParis();

  const loadPreview = useCallback(async () => {
    const r = await api.get('/api/public/availability' + qs({ from: today, to: addDays(today, 13) }));
    setPreview(r.days);
  }, [today]);
  const loadOverrides = useCallback(() => api.get('/api/admin/overrides').then(setOverrides), []);

  useEffect(() => {
    api.get('/api/admin/settings').then((s) => {
      setSaved(s);
      setDraft(s);
    });
    loadOverrides();
    loadPreview();
  }, [loadOverrides, loadPreview]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const setRule = (k) => (e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) }));
  const setDay = (day, ranges) => setDraft((d) => ({ ...d, weekly: { ...d.weekly, [day]: ranges } }));

  const copyToWeekdays = (day) => {
    const src = draft.weekly[day];
    setDraft((d) => ({ ...d, weekly: { ...d.weekly, 1: src, 2: src, 3: src, 4: src, 5: src } }));
    toast('Horaires copiés du lundi au vendredi.', 'info');
  };

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.put('/api/admin/settings', draft);
      setSaved(s);
      setDraft(s);
      toast('Disponibilités enregistrées — la page de réservation est à jour.');
      loadPreview();
    } catch (e) {
      toast(Object.values(e.fields)[0] || e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addOverride = async (e) => {
    e.preventDefault();
    const err = {};
    if (!ov.date) err.date = 'Choisissez une date';
    if (ov.kind === 'blocked' && ov.endDate && ov.endDate < ov.date) err.endDate = 'Doit être après la date de début';
    if (ov.kind === 'custom' && !ov.ranges.length) err.ranges = 'Ajoutez au moins une plage';
    setOvErrors(err);
    if (Object.keys(err).length) return;
    setAdding(true);
    try {
      const body = { kind: ov.kind, date: ov.date, reason: ov.reason };
      if (ov.kind === 'blocked' && ov.endDate) body.endDate = ov.endDate;
      if (ov.kind === 'custom') body.ranges = ov.ranges;
      const r = await api.post('/api/admin/overrides', body);
      toast(ov.kind === 'blocked' ? `${r.count} jour${r.count > 1 ? 's' : ''} bloqué${r.count > 1 ? 's' : ''}.` : 'Disponibilité exceptionnelle ajoutée.');
      if (r.impacted) toast(`Attention : ${r.impacted} rendez-vous déjà planifié${r.impacted > 1 ? 's' : ''} sur cette période. Pensez à les déplacer ou les annuler.`, 'info', 8000);
      setOv((o) => ({ ...o, date: '', endDate: '', reason: '' }));
      loadOverrides();
      loadPreview();
    } catch (e2) {
      setOvErrors(e2.fields);
      toast(e2.message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const removeGroup = async (g) => {
    try {
      for (const id of g.ids) await api.del(`/api/admin/overrides/${id}`);
      toast('Exception supprimée.');
      loadOverrides();
      loadPreview();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!draft) {
    return (
      <div className="page-loader" style={{ minHeight: 400 }}>
        <Spinner />
      </div>
    );
  }

  const groups = groupOverrides(overrides);

  return (
    <div className="page page--with-savebar">
      <div className="page__head">
        <div>
          <h1>Disponibilités</h1>
          <p className="muted">Les modifications sont appliquées immédiatement sur la page de réservation. Heures de Paris.</p>
        </div>
      </div>

      <div className="avail-grid">
        <div className="avail-grid__main">
          <section className="card">
            <header className="card__head">
              <h2>Règles de réservation</h2>
            </header>
            <div className="rules">
              <Field label="Durée d’un rendez-vous">
                {(a) => (
                  <div className="input-icon">
                    <Timer size={18} />
                    <select {...a} className="select input" value={draft.slotDuration} onChange={setRule('slotDuration')}>
                      {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                        <option key={m} value={m}>
                          {m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} heure${m > 60 ? 's' : ''}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>
              <Field label="Battement entre deux RDV">
                {(a) => (
                  <div className="input-icon">
                    <Hourglass size={18} />
                    <select {...a} className="select input" value={draft.bufferMinutes} onChange={setRule('bufferMinutes')}>
                      {[0, 5, 10, 15, 30].map((m) => (
                        <option key={m} value={m}>
                          {m ? `${m} minutes` : 'Aucun'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>
              <Field label="Délai minimum de réservation">
                {(a) => (
                  <div className="input-icon">
                    <Clock4 size={18} />
                    <select {...a} className="select input" value={draft.minNoticeHours} onChange={setRule('minNoticeHours')}>
                      {[0, 1, 2, 4, 12, 24, 48, 72].map((h) => (
                        <option key={h} value={h}>
                          {h === 0 ? 'Aucun' : h < 24 ? `${h} heure${h > 1 ? 's' : ''} avant` : `${h / 24} jour${h > 24 ? 's' : ''} avant`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>
              <Field label="Réservation possible jusqu’à">
                {(a) => (
                  <div className="input-icon">
                    <CalendarRange size={18} />
                    <select {...a} className="select input" value={draft.horizonDays} onChange={setRule('horizonDays')}>
                      {[7, 14, 21, 30, 45, 60, 90].map((d) => (
                        <option key={d} value={d}>
                          {d} jours à l’avance
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>
            </div>
          </section>

          <section className="card">
            <header className="card__head">
              <h2>Semaine type</h2>
              <span className="muted">Jours et horaires de travail</span>
            </header>
            <div className="week">
              {DAYS.map(([d, label]) => {
                const ranges = draft.weekly[d] || [];
                const on = ranges.length > 0;
                return (
                  <div className={`week__row ${on ? '' : 'is-off'}`} key={d}>
                    <div className="week__day">
                      <Toggle checked={on} onChange={(v) => setDay(d, v ? [{ ...DEFAULT_RANGE }, { start: '14:00', end: '18:00' }] : [])} label={`${label} ouvert`} />
                      <strong>{label}</strong>
                    </div>
                    <div className="week__ranges">
                      {on ? <RangeEditor ranges={ranges} onChange={(r) => setDay(d, r)} /> : <span className="muted">Fermé</span>}
                    </div>
                    {on && (
                      <button className="icon-btn week__copy" title="Appliquer ces horaires du lundi au vendredi" aria-label="Copier du lundi au vendredi" onClick={() => copyToWeekdays(d)}>
                        <Copy size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <header className="card__head">
              <h2>Exceptions</h2>
              <span className="muted">Jours bloqués et disponibilités exceptionnelles</span>
            </header>
            <form className="override-form" onSubmit={addOverride} noValidate>
              <div className="segmented segmented--full">
                {[
                  ['blocked', 'Bloquer des dates', CalendarOff],
                  ['custom', 'Disponibilité exceptionnelle', CalendarPlus],
                ].map(([k, label, Icon]) => (
                  <button type="button" key={k} className={ov.kind === k ? 'is-active' : ''} onClick={() => setOv((o) => ({ ...o, kind: k }))}>
                    {ov.kind === k && <motion.span layoutId="ov-seg" className="segmented__bg" />}
                    <span>
                      <Icon size={16} /> {label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="muted override-form__help">
                {ov.kind === 'blocked'
                  ? 'Aucun créneau ne sera proposé sur ces dates (congés, jours fériés, formation…).'
                  : 'Remplace les horaires habituels de ce jour, ou ouvre un jour normalement fermé (ex. : un samedi matin).'}
              </p>
              <div className="override-form__fields">
                <Field label={ov.kind === 'blocked' ? 'Du' : 'Date'} error={ovErrors.date} required>
                  {(a) => <input {...a} type="date" className="input" min={today} value={ov.date} onChange={(e) => setOv((o) => ({ ...o, date: e.target.value }))} />}
                </Field>
                {ov.kind === 'blocked' && (
                  <Field label="Au (optionnel)" error={ovErrors.endDate}>
                    {(a) => <input {...a} type="date" className="input" min={ov.date || today} value={ov.endDate} onChange={(e) => setOv((o) => ({ ...o, endDate: e.target.value }))} />}
                  </Field>
                )}
                <Field label="Motif (optionnel)">
                  {(a) => <input {...a} className="input" placeholder={ov.kind === 'blocked' ? 'Congés' : 'Permanence'} maxLength={200} value={ov.reason} onChange={(e) => setOv((o) => ({ ...o, reason: e.target.value }))} />}
                </Field>
              </div>
              {ov.kind === 'custom' && (
                <Field label="Horaires de ce jour" error={ovErrors.ranges}>
                  {() => <RangeEditor ranges={ov.ranges} onChange={(r) => setOv((o) => ({ ...o, ranges: r }))} />}
                </Field>
              )}
              <div>
                <Button type="submit" variant="secondary" icon={Plus} loading={adding}>
                  Ajouter l’exception
                </Button>
              </div>
            </form>

            {groups.length > 0 ? (
              <ul className="overrides">
                <AnimatePresence initial={false}>
                  {groups.map((g) => (
                    <motion.li key={g.ids.join('-')} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <span className={`overrides__icon overrides__icon--${g.kind}`}>{g.kind === 'blocked' ? <CalendarOff size={17} /> : <CalendarPlus size={17} />}</span>
                      <div className="overrides__main">
                        <strong>{g.start === g.end ? fmtDateMedium(g.start) : `Du ${fmtDayShort(g.start)} au ${fmtDayShort(g.end)}`}</strong>
                        <span>
                          {g.kind === 'blocked' ? 'Fermé' : g.ranges.map((r) => `${fmtTime(r.start)}–${fmtTime(r.end)}`).join(' · ')}
                          {g.reason && ` — ${g.reason}`}
                        </span>
                      </div>
                      <button className="icon-btn icon-btn--danger" onClick={() => removeGroup(g)} aria-label="Supprimer l’exception" title="Supprimer">
                        <Trash2 size={17} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <EmptyState icon={CalendarOff} title="Aucune exception programmée" />
            )}
          </section>
        </div>

        <aside className="avail-grid__side">
          <section className="card preview">
            <header className="card__head">
              <h2>
                <Eye size={18} /> Aperçu client
              </h2>
            </header>
            <p className="muted preview__help">Créneaux réellement proposés aux clients sur les 14 prochains jours.</p>
            {!preview ? (
              <Spinner />
            ) : (
              <ul className="preview__list">
                {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => {
                  const n = preview[d]?.length || 0;
                  return (
                    <li key={d} className={n ? '' : 'is-empty'}>
                      <span>{fmtDayShort(d)}</span>
                      <span className="preview__bar">
                        <motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, (n / 16) * 100)}%` }} />
                      </span>
                      <strong>{n || '—'}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
            {dirty && <p className="preview__dirty">Enregistrez pour mettre à jour l’aperçu.</p>}
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div className="savebar" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
            <span>Modifications non enregistrées</span>
            <div>
              <Button variant="ghost" onClick={() => setDraft(saved)} className="savebar__ghost">
                Annuler
              </Button>
              <Button icon={Save} loading={saving} onClick={save}>
                Enregistrer
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
