import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, PhoneCall, Mail, CheckCircle2, Ban, Trash2, PencilLine, RotateCcw, CalendarDays, Clock, Hash, Globe, UserCog, Copy } from 'lucide-react';
import { Button, ConfirmDialog, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { addMinutes, fmtDateLong, fmtPhone, fmtTime, initials, isPast, mailHref, telHref } from '../lib/format.js';

export default function AppointmentDrawer({ appointment: a, onClose, onChanged, onEdit }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    setNotes(a?.notes || '');
    setConfirm(null);
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!a) return;
    const onKey = (e) => e.key === 'Escape' && !confirm && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [a, confirm, onClose]);

  const patch = async (body, okMsg, key) => {
    setBusy(key);
    try {
      const updated = await api.patch(`/api/admin/appointments/${a.id}`, body);
      onChanged(updated);
      toast(okMsg);
      setConfirm(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await api.del(`/api/admin/appointments/${a.id}`);
      toast('Rendez-vous supprimé.');
      setConfirm(null);
      onChanged(null, a.id);
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text).then(() => toast(`${label} copié.`), () => {});
  };

  return createPortal(
    <AnimatePresence>
      {a && (
        <>
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Rendez-vous de ${a.firstName} ${a.lastName}`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <header className="drawer__header">
              <span className="avatar avatar--lg">{initials(a)}</span>
              <div className="drawer__title">
                <h2>
                  {a.firstName} {a.lastName.toUpperCase()}
                </h2>
                <StatusBadge status={a.status} past={isPast(a)} />
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>

            <div className="drawer__body">
              <div className="drawer__quick">
                <a className="quick-action quick-action--primary" href={telHref(a.phone)}>
                  <PhoneCall size={20} />
                  <span>
                    <small>Appeler</small>
                    <strong>{fmtPhone(a.phone)}</strong>
                  </span>
                </a>
                <a className="quick-action" href={mailHref(a.email)}>
                  <Mail size={20} />
                  <span>
                    <small>Écrire</small>
                    <strong>{a.email}</strong>
                  </span>
                </a>
              </div>

              <section className="drawer__section">
                <h3>Rendez-vous</h3>
                <dl className="details">
                  <div>
                    <dt>
                      <CalendarDays size={16} /> Date
                    </dt>
                    <dd>{fmtDateLong(a.date)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Clock size={16} /> Horaire
                    </dt>
                    <dd>
                      {fmtTime(a.time)} – {fmtTime(addMinutes(a.time, a.duration))} <span className="muted">({a.duration} min)</span>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Hash size={16} /> Référence
                    </dt>
                    <dd>
                      <button className="copy-chip" onClick={() => copy(a.reference, 'Référence')}>
                        {a.reference} <Copy size={13} />
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>{a.source === 'admin' ? <UserCog size={16} /> : <Globe size={16} />} Origine</dt>
                    <dd>{a.source === 'admin' ? 'Créé par l’administration' : 'Réservation en ligne'}</dd>
                  </div>
                  <div>
                    <dt>
                      <Clock size={16} /> Enregistré le
                    </dt>
                    <dd className="muted">
                      {new Date(a.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' })}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="drawer__section">
                <h3>Notes d’intervention</h3>
                <textarea
                  className="textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex. : ancienne messagerie Orange, 2 comptes à migrer, client disponible après 14h…"
                  maxLength={2000}
                />
                {notes !== (a.notes || '') && (
                  <div className="drawer__notes-actions">
                    <Button size="sm" variant="ghost" onClick={() => setNotes(a.notes || '')}>
                      Annuler
                    </Button>
                    <Button size="sm" loading={busy === 'notes'} onClick={() => patch({ notes }, 'Notes enregistrées.', 'notes')}>
                      Enregistrer
                    </Button>
                  </div>
                )}
              </section>
            </div>

            <footer className="drawer__footer">
              {a.status === 'confirmed' && (
                <Button variant="success" icon={CheckCircle2} loading={busy === 'done'} onClick={() => patch({ status: 'completed' }, 'Rendez-vous marqué comme effectué.', 'done')}>
                  Marquer effectué
                </Button>
              )}
              {a.status !== 'confirmed' && (
                <Button variant="soft" icon={RotateCcw} loading={busy === 'reopen'} onClick={() => patch({ status: 'confirmed' }, 'Rendez-vous replanifié.', 'reopen')}>
                  Remettre en planifié
                </Button>
              )}
              <Button variant="secondary" icon={PencilLine} onClick={() => onEdit(a)}>
                Modifier
              </Button>
              <div className="drawer__footer-danger">
                {a.status === 'confirmed' && (
                  <button className="icon-btn icon-btn--danger" title="Annuler le rendez-vous" aria-label="Annuler le rendez-vous" onClick={() => setConfirm('cancel')}>
                    <Ban size={19} />
                  </button>
                )}
                <button className="icon-btn icon-btn--danger" title="Supprimer" aria-label="Supprimer le rendez-vous" onClick={() => setConfirm('delete')}>
                  <Trash2 size={19} />
                </button>
              </div>
            </footer>
          </motion.aside>

          <ConfirmDialog
            open={confirm === 'cancel'}
            onClose={() => setConfirm(null)}
            title="Annuler ce rendez-vous ?"
            message={`Le créneau du ${fmtDateLong(a.date).toLowerCase()} à ${fmtTime(a.time)} redeviendra disponible pour les autres clients.`}
            confirmLabel="Annuler le rendez-vous"
            danger
            loading={busy === 'cancel'}
            onConfirm={() => patch({ status: 'cancelled' }, 'Rendez-vous annulé, créneau libéré.', 'cancel')}
          />
          <ConfirmDialog
            open={confirm === 'delete'}
            onClose={() => setConfirm(null)}
            title="Supprimer définitivement ?"
            message={`Le rendez-vous de ${a.firstName} ${a.lastName} sera supprimé de la base. Cette action est irréversible.`}
            confirmLabel="Supprimer"
            danger
            loading={busy === 'delete'}
            onConfirm={remove}
          />
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
