import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Download, CheckCircle2, PencilLine, Ban, Trash2, CalendarX2, X, ChevronLeft, ChevronRight, PhoneCall, Mail, ArrowDownUp } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, Spinner, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api, qs } from '../lib/api.js';
import { fmtDateShort, fmtPhone, fmtTime, initials, isPast, mailHref, telHref, weekdayShort, fmtDateLong } from '../lib/format.js';
import AppointmentDrawer from './AppointmentDrawer.jsx';
import AppointmentForm from './AppointmentForm.jsx';

const FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'upcoming', label: 'À venir' },
  { value: 'to_process', label: 'À clôturer' },
  { value: 'completed', label: 'Effectués' },
  { value: 'cancelled', label: 'Annulés' },
];

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Appointments() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const sort = params.get('sort') || (status === 'completed' || status === 'cancelled' ? 'desc' : 'asc');
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(params.get('q') || '');
  const q = useDebounced(search, 250);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') || '') !== q) update({ q });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = { q, status, from, to, sort, page, pageSize: 20 };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/api/admin/appointments' + qs(query)));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, from, to, sort, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const quickPatch = async (a, body, msg) => {
    try {
      await api.patch(`/api/admin/appointments/${a.id}`, body);
      toast(msg);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const runConfirm = async () => {
    setBusy(true);
    const { type, a } = confirm;
    try {
      if (type === 'delete') {
        await api.del(`/api/admin/appointments/${a.id}`);
        toast('Rendez-vous supprimé.');
      } else {
        await api.patch(`/api/admin/appointments/${a.id}`, { status: 'cancelled' });
        toast('Rendez-vous annulé, créneau libéré.');
      }
      setConfirm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const hasFilters = q || status || from || to;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Rendez-vous</h1>
          <p className="muted">{data ? `${data.total} résultat${data.total > 1 ? 's' : ''}` : ' '}</p>
        </div>
        <div className="page__actions">
          <a className="btn btn--secondary" href={'/api/admin/appointments.csv' + qs({ q, status, from, to })} download>
            <Download size={18} />
            <span>Exporter</span>
          </a>
          <Button icon={Plus} onClick={() => setEditing({})}>
            Nouveau
          </Button>
        </div>
      </div>

      <div className="toolbar card">
        <div className="toolbar__search input-icon">
          <Search size={18} />
          <input className="input" placeholder="Rechercher un client : nom, e-mail, téléphone, référence…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un client" />
          {search && (
            <button className="icon-btn toolbar__clear" onClick={() => setSearch('')} aria-label="Effacer la recherche">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="segmented" role="tablist" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <button key={f.value} role="tab" aria-selected={status === f.value} className={status === f.value ? 'is-active' : ''} onClick={() => update({ status: f.value, sort: '' })}>
              {status === f.value && <motion.span layoutId="seg" className="segmented__bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <span>{f.label}</span>
            </button>
          ))}
        </div>
        <div className="toolbar__dates">
          <label>
            <span>Du</span>
            <input type="date" className="input input--sm" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label>
            <span>au</span>
            <input type="date" className="input input--sm" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </label>
          <button className="icon-btn" title={sort === 'asc' ? 'Ordre chronologique' : 'Plus récents d’abord'} aria-label="Inverser l’ordre" onClick={() => update({ sort: sort === 'asc' ? 'desc' : 'asc' })}>
            <ArrowDownUp size={18} />
          </button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
            >
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      <div className="card table-card">
        {loading && !data ? (
          <div className="page-loader" style={{ minHeight: 300 }}>
            <Spinner />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={CalendarX2} title={hasFilters ? 'Aucun résultat' : 'Aucun rendez-vous pour le moment'}>
            {hasFilters ? 'Essayez de modifier la recherche ou les filtres.' : 'Les réservations de vos clients apparaîtront ici.'}
          </EmptyState>
        ) : (
          <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Date</th>
                  <th>Heure</th>
                  <th>Statut</th>
                  <th className="t-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} onClick={() => setOpen(a)} className={a.status === 'cancelled' ? 'is-cancelled' : ''}>
                    <td data-label="Client">
                      <div className="cell-client">
                        <span className="avatar">{initials(a)}</span>
                        <div>
                          <strong>
                            {a.lastName.toUpperCase()} {a.firstName}
                          </strong>
                          <small>{a.reference}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Contact" onClick={(e) => e.stopPropagation()}>
                      <div className="cell-contact">
                        <a href={telHref(a.phone)} className="contact-link contact-link--phone" title="Appeler">
                          <PhoneCall size={14} /> {fmtPhone(a.phone)}
                        </a>
                        <a href={mailHref(a.email)} className="contact-link" title="Envoyer un e-mail">
                          <Mail size={14} /> {a.email}
                        </a>
                      </div>
                    </td>
                    <td data-label="Date" className="cell-date">
                      <small>{weekdayShort(a.date)}</small> {fmtDateShort(a.date)}
                    </td>
                    <td data-label="Heure" className="cell-time">
                      {fmtTime(a.time)}
                    </td>
                    <td data-label="Statut">
                      <StatusBadge status={a.status} past={isPast(a)} />
                    </td>
                    <td className="t-right cell-actions" onClick={(e) => e.stopPropagation()}>
                      {a.status === 'confirmed' && (
                        <button className="icon-btn icon-btn--success" title="Marquer comme effectué" aria-label="Marquer comme effectué" onClick={() => quickPatch(a, { status: 'completed' }, 'Rendez-vous marqué comme effectué.')}>
                          <CheckCircle2 size={18} />
                        </button>
                      )}
                      <button className="icon-btn" title="Modifier" aria-label="Modifier" onClick={() => setEditing(a)}>
                        <PencilLine size={18} />
                      </button>
                      {a.status === 'confirmed' && (
                        <button className="icon-btn icon-btn--danger" title="Annuler" aria-label="Annuler" onClick={() => setConfirm({ type: 'cancel', a })}>
                          <Ban size={18} />
                        </button>
                      )}
                      <button className="icon-btn icon-btn--danger" title="Supprimer" aria-label="Supprimer" onClick={() => setConfirm({ type: 'delete', a })}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="pagination">
            <span className="muted">
              Page {page} sur {totalPages}
            </span>
            <div>
              <button className="icon-btn" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Page précédente">
                <ChevronLeft size={18} />
              </button>
              <button className="icon-btn" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Page suivante">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <AppointmentDrawer
        appointment={open}
        onClose={() => setOpen(null)}
        onChanged={(u) => {
          setOpen(u);
          load();
        }}
        onEdit={(a) => setEditing(a)}
      />
      <AppointmentForm
        open={!!editing}
        appointment={editing?.id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          setEditing(null);
          if (open) setOpen(s);
          load();
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger
        loading={busy}
        onConfirm={runConfirm}
        title={confirm?.type === 'delete' ? 'Supprimer définitivement ?' : 'Annuler ce rendez-vous ?'}
        confirmLabel={confirm?.type === 'delete' ? 'Supprimer' : 'Annuler le rendez-vous'}
        message={
          confirm &&
          (confirm.type === 'delete'
            ? `Le rendez-vous de ${confirm.a.firstName} ${confirm.a.lastName} sera supprimé. Cette action est irréversible.`
            : `Le créneau du ${fmtDateLong(confirm.a.date).toLowerCase()} à ${fmtTime(confirm.a.time)} redeviendra disponible.`)
        }
      />
    </div>
  );
}
