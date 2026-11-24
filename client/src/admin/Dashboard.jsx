import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, CalendarClock, CheckCircle2, XCircle, PhoneCall, ArrowRight, Copy, Link2, AlertTriangle, ImageOff, Coffee } from 'lucide-react';
import { EmptyState, Spinner, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { addMinutes, fmtDateLong, fmtDayShort, fmtPhone, fmtTime, initials, isPast, telHref, todayParis } from '../lib/format.js';
import AppointmentDrawer from './AppointmentDrawer.jsx';
import AppointmentForm from './AppointmentForm.jsx';

function Kpi({ icon: Icon, label, value, tone, to, delay }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Link to={to} className={`kpi kpi--${tone}`}>
        <span className="kpi__icon">
          <Icon size={20} />
        </span>
        <span className="kpi__label">{label}</span>
        <strong className="kpi__value">{value}</strong>
      </Link>
    </motion.div>
  );
}

function AppointmentRow({ a, onOpen, showDate }) {
  return (
    <li className="agenda-row" onClick={() => onOpen(a)}>
      <div className="agenda-row__time">
        {showDate && <small>{fmtDayShort(a.date)}</small>}
        <strong>{fmtTime(a.time)}</strong>
        <small>{fmtTime(addMinutes(a.time, a.duration))}</small>
      </div>
      <span className="avatar">{initials(a)}</span>
      <div className="agenda-row__main">
        <strong>
          {a.firstName} {a.lastName.toUpperCase()}
        </strong>
        <span>{fmtPhone(a.phone)}</span>
      </div>
      <StatusBadge status={a.status} past={isPast(a)} />
      {a.status === 'confirmed' && (
        <a className="btn btn--soft btn--sm agenda-row__call" href={telHref(a.phone)} onClick={(e) => e.stopPropagation()} title={`Appeler ${fmtPhone(a.phone)}`}>
          <PhoneCall size={16} />
          <span>Appeler</span>
        </a>
      )}
    </li>
  );
}

export default function Dashboard({ me }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api.get('/api/admin/stats').then(setStats, (e) => toast(e.message, 'error')), [toast]);
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const publicUrl = `${window.location.origin}/`;
  const hour = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', timeZone: 'Europe/Paris' }).format(new Date()));
  const hello = hour < 18 ? 'Bonjour' : 'Bonsoir';

  if (!stats) {
    return (
      <div className="page-loader" style={{ minHeight: 400 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>
            {hello}
            {me.name && me.name !== 'Administrateur' ? `, ${me.name}` : ''} 👋
          </h1>
          <p className="muted">{fmtDateLong(todayParis())} · {stats.todayCount ? `${stats.todayCount} intervention${stats.todayCount > 1 ? 's' : ''} aujourd’hui` : 'aucune intervention aujourd’hui'}</p>
        </div>
      </div>

      {stats.toProcess > 0 && (
        <Link to="/admin/rendez-vous?status=to_process" className="alert alert--warning alert--link">
          <AlertTriangle size={18} />
          <span>
            <strong>{stats.toProcess}</strong> rendez-vous passé{stats.toProcess > 1 ? 's' : ''} à clôturer (effectué ou annulé).
          </span>
          <ArrowRight size={16} />
        </Link>
      )}

      <div className="kpis">
        <Kpi icon={CalendarDays} label="Total des rendez-vous" value={stats.total} tone="neutral" to="/admin/rendez-vous" delay={0} />
        <Kpi icon={CalendarClock} label="À venir" value={stats.upcoming} tone="info" to="/admin/rendez-vous?status=upcoming" delay={0.05} />
        <Kpi icon={CheckCircle2} label="Effectués" value={stats.completed} tone="success" to="/admin/rendez-vous?status=completed" delay={0.1} />
        <Kpi icon={XCircle} label="Annulés" value={stats.cancelled} tone="muted" to="/admin/rendez-vous?status=cancelled" delay={0.15} />
      </div>

      <div className="dash-grid">
        <section className="card">
          <header className="card__head">
            <h2>Aujourd’hui</h2>
            <span className="muted">{stats.today.length} rendez-vous</span>
          </header>
          {stats.today.length ? (
            <ul className="agenda">
              {stats.today.map((a) => (
                <AppointmentRow key={a.id} a={a} onOpen={setOpen} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Coffee} title="Aucune intervention aujourd’hui">
              Les rendez-vous du jour apparaîtront ici avec un bouton d’appel direct.
            </EmptyState>
          )}
        </section>

        <section className="card">
          <header className="card__head">
            <h2>Prochains rendez-vous</h2>
            <Link to="/admin/rendez-vous?status=upcoming" className="link-btn">
              Tout voir <ArrowRight size={15} />
            </Link>
          </header>
          {stats.next.length ? (
            <ul className="agenda">
              {stats.next.map((a) => (
                <AppointmentRow key={a.id} a={a} onOpen={setOpen} showDate />
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarClock} title="Aucun rendez-vous à venir">
              Partagez le lien de réservation à vos clients pour qu’ils choisissent leur créneau.
            </EmptyState>
          )}
        </section>
      </div>

      <div className="dash-grid dash-grid--secondary">
        <section className="card share-card">
          <span className="share-card__icon">
            <Link2 size={20} />
          </span>
          <div className="share-card__main">
            <h2>Lien de réservation client</h2>
            <p className="muted">Envoyez ce lien à vos clients par e-mail ou SMS.</p>
            <div className="share-card__url">
              <code>{publicUrl}</code>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => navigator.clipboard?.writeText(publicUrl).then(() => toast('Lien copié dans le presse-papiers.'))}
              >
                <Copy size={15} /> Copier
              </button>
            </div>
          </div>
        </section>
        {!stats.logo && (
          <section className="card share-card share-card--warning">
            <span className="share-card__icon">
              <ImageOff size={20} />
            </span>
            <div className="share-card__main">
              <h2>Logo officiel non installé</h2>
              <p className="muted">
                Déposez le fichier <code>logo.png</code> ou <code>logo.svg</code> dans le dossier <code>branding/</code> du serveur pour activer l’animation de
                confirmation définitive.
              </p>
            </div>
          </section>
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
        appointment={editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          setEditing(null);
          setOpen(s);
          load();
        }}
      />
    </div>
  );
}
