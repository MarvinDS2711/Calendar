import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Clock4, Settings, LogOut, Menu, X, ExternalLink } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';
import { Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import Appointments from './Appointments.jsx';
import Availability from './Availability.jsx';
import SettingsPage from './Settings.jsx';

const NAV = [
  { to: '/admin', end: true, label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/admin/rendez-vous', label: 'Rendez-vous', icon: CalendarDays },
  { to: '/admin/disponibilites', label: 'Disponibilités', icon: Clock4 },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
];

export default function AdminApp() {
  const [me, setMe] = useState(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const toast = useToast();
  const location = useLocation();

  useEffect(() => {
    document.title = 'Administration — INOVACOM';
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    api.get('/api/admin/me').then(setMe, () => setMe(null));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setMe((cur) => {
        if (cur) toast('Votre session a expiré. Merci de vous reconnecter.', 'info');
        return null;
      });
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [toast]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const logout = useCallback(async () => {
    await api.post('/api/admin/logout').catch(() => {});
    setMe(null);
  }, []);

  if (me === undefined) {
    return (
      <div className="page-loader">
        <Spinner />
      </div>
    );
  }
  if (!me) return <Login onLogin={setMe} />;

  return (
    <div className="admin">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <BrandMark size={30} />
          <span className="sidebar__badge">Admin</span>
          <button className="icon-btn sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar__nav">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `navlink ${isActive ? 'is-active' : ''}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" className="navlink__bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <Icon size={19} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <a className="sidebar__public" href="/" target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Voir la page de réservation
        </a>
        <div className="sidebar__user">
          <span className="avatar avatar--sm">{(me.name || me.email)[0].toUpperCase()}</span>
          <div className="sidebar__user-info">
            <strong>{me.name || 'Administrateur'}</strong>
            <span>{me.email}</span>
          </div>
          <button className="icon-btn" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <AnimatePresence>
        {menuOpen && <motion.div className="sidebar-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />}
      </AnimatePresence>

      <div className="admin__main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={22} />
          </button>
          <BrandMark size={26} />
          <span style={{ width: 36 }} />
        </header>
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className="admin__content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Routes location={location}>
              <Route index element={<Dashboard me={me} />} />
              <Route path="rendez-vous" element={<Appointments />} />
              <Route path="disponibilites" element={<Availability />} />
              <Route path="parametres" element={<SettingsPage me={me} />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
