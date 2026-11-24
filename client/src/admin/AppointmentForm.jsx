import { useEffect, useState } from 'react';
import { Save, Plus } from 'lucide-react';
import { Button, Field, Modal, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api, qs } from '../lib/api.js';
import { EMAIL_RE, fmtPhone, fmtTime, normalizePhone, todayParis } from '../lib/format.js';

const blank = () => ({ lastName: '', firstName: '', email: '', phone: '', date: todayParis(), time: '', notes: '', status: 'confirmed' });

export default function AppointmentForm({ open, appointment, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!appointment?.id;
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState({});
  const [slots, setSlots] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(appointment ? { ...blank(), ...appointment, phone: fmtPhone(appointment.phone) } : blank());
  }, [open, appointment]);

  useEffect(() => {
    if (!open || !v.date) return;
    let alive = true;
    setSlots(null);
    api
      .get('/api/admin/availability' + qs({ date: v.date, exclude: appointment?.id }))
      .then((r) => alive && setSlots(r.slots))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [open, v.date, appointment?.id]);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e?.preventDefault();
    const err = {};
    if (!v.lastName.trim()) err.lastName = 'Obligatoire';
    if (!v.firstName.trim()) err.firstName = 'Obligatoire';
    if (!EMAIL_RE.test(v.email.trim())) err.email = 'E-mail invalide';
    if (!normalizePhone(v.phone)) err.phone = 'Numéro invalide';
    if (!v.date) err.date = 'Obligatoire';
    if (!/^\d{2}:\d{2}$/.test(v.time)) err.time = 'Choisissez un horaire';
    setErrors(err);
    if (Object.keys(err).length) return;

    setSaving(true);
    const body = {
      lastName: v.lastName,
      firstName: v.firstName,
      email: v.email,
      phone: v.phone,
      date: v.date,
      time: v.time,
      notes: v.notes || '',
      status: v.status,
    };
    try {
      const saved = editing ? await api.patch(`/api/admin/appointments/${appointment.id}`, body) : await api.post('/api/admin/appointments', body);
      toast(editing ? 'Rendez-vous mis à jour.' : 'Rendez-vous créé.');
      onSaved(saved);
    } catch (e2) {
      setErrors(e2.fields || {});
      if (e2.code === 'SLOT_TAKEN') setErrors((x) => ({ ...x, time: e2.message }));
      toast(e2.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const slotList = slots && v.time && !slots.includes(v.time) ? [...slots, v.time].sort() : slots;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
      subtitle={editing ? `Référence ${appointment.reference}` : 'Pour un client qui vous a contacté directement.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button icon={editing ? Save : Plus} loading={saving} onClick={submit}>
            {editing ? 'Enregistrer' : 'Créer le rendez-vous'}
          </Button>
        </>
      }
    >
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field label="Nom" required error={errors.lastName}>
          {(a) => <input {...a} className="input" value={v.lastName} onChange={set('lastName')} />}
        </Field>
        <Field label="Prénom" required error={errors.firstName}>
          {(a) => <input {...a} className="input" value={v.firstName} onChange={set('firstName')} />}
        </Field>
        <Field label="E-mail" required error={errors.email}>
          {(a) => <input {...a} className="input" type="email" value={v.email} onChange={set('email')} />}
        </Field>
        <Field label="Téléphone" required error={errors.phone}>
          {(a) => <input {...a} className="input" type="tel" value={v.phone} onChange={set('phone')} />}
        </Field>
        <Field label="Date" required error={errors.date}>
          {(a) => <input {...a} className="input" type="date" value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value, time: '' }))} />}
        </Field>
        {editing ? (
          <Field label="Statut">
            {(a) => (
              <select {...a} className="select" value={v.status} onChange={set('status')}>
                <option value="confirmed">Planifié</option>
                <option value="completed">Effectué</option>
                <option value="cancelled">Annulé</option>
              </select>
            )}
          </Field>
        ) : (
          <span />
        )}

        <div className="form-grid__full">
          <Field label="Horaire" required error={errors.time} hint="Créneaux libres selon vos disponibilités. Vous pouvez aussi saisir un horaire libre.">
            {() => (
              <div className="admin-slots">
                {!slotList ? (
                  <span className="muted admin-slots__loading">
                    <Spinner size={16} /> Chargement…
                  </span>
                ) : slotList.length === 0 ? (
                  <span className="muted">Aucun créneau standard ce jour-là.</span>
                ) : (
                  slotList.map((t) => (
                    <button type="button" key={t} className={`slot slot--sm ${v.time === t ? 'is-selected' : ''}`} onClick={() => setV((s) => ({ ...s, time: t }))}>
                      {fmtTime(t)}
                    </button>
                  ))
                )}
                <label className="admin-slots__custom">
                  <span>Autre :</span>
                  <input type="time" className="input input--sm" step={300} value={v.time} onChange={set('time')} />
                </label>
              </div>
            )}
          </Field>
        </div>

        <div className="form-grid__full">
          <Field label="Notes">{(a) => <textarea {...a} className="textarea" value={v.notes} onChange={set('notes')} maxLength={2000} />}</Field>
        </div>
      </form>
    </Modal>
  );
}
