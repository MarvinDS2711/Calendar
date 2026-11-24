import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Clock, PhoneCall, Mail, Hash, CalendarPlus, Monitor, Smartphone, KeyRound } from 'lucide-react';
import { useBrand } from '../lib/brand.jsx';
import { Button } from '../components/ui.jsx';
import { fmtDateLong, fmtTime, addMinutes, fmtPhone, buildIcs } from '../lib/format.js';

const EASE = [0.22, 1, 0.36, 1];
const PALETTE = ['#00a9b5', '#0b8793', '#7fa9cf', '#1f6d8f', '#9fd8de'];

/* ------------------------------------------------------------------------ */
/*  Révélation du logo : la coche INOVACOM se "trace" — la branche gauche     */
/*  descend, puis la branche droite remonte, avant un reflet de lumière.     */
/* ------------------------------------------------------------------------ */
function LogoReveal({ logo, name }) {
  if (!logo) {
    // Emplacement temporaire : aucun faux logo n'est dessiné.
    return (
      <motion.div
        className="logo-placeholder"
        initial={{ opacity: 0, scale: 0.85, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, delay: 0.3, ease: EASE }}
        title="Déposez le logo officiel dans le dossier /branding"
      >
        <span>{name}</span>
      </motion.div>
    );
  }
  const url = logo.url;
  return (
    <motion.div
      className="logo-reveal"
      style={{ '--logo-url': `url("${url}")` }}
      initial={{ scale: 0.9, filter: 'blur(6px)' }}
      animate={{ scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.2, delay: 0.25, ease: EASE }}
    >
      {/* Branche gauche : révélée de haut en bas */}
      <motion.img
        src={url}
        alt=""
        className="logo-reveal__part"
        initial={{ clipPath: 'inset(0% 50% 100% 0%)' }}
        animate={{ clipPath: 'inset(0% 50% 0% 0%)' }}
        transition={{ duration: 0.55, delay: 0.35, ease: [0.55, 0, 0.45, 1] }}
      />
      {/* Branche droite : révélée de bas en haut, comme le geste d'une coche */}
      <motion.img
        src={url}
        alt={name}
        className="logo-reveal__part"
        initial={{ clipPath: 'inset(100% 0% 0% 42%)' }}
        animate={{ clipPath: 'inset(0% 0% 0% 42%)' }}
        transition={{ duration: 0.7, delay: 0.82, ease: EASE }}
      />
      {/* Reflet lumineux masqué par la forme exacte du logo */}
      <span className="logo-reveal__shine" aria-hidden />
    </motion.div>
  );
}

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + (i % 2 ? 0.18 : -0.1);
        const dist = 120 + ((i * 37) % 80);
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          size: 4 + ((i * 7) % 6),
          color: PALETTE[i % PALETTE.length],
          delay: 1.25 + (i % 5) * 0.03,
        };
      }),
    [],
  );
  return (
    <div className="particles" aria-hidden>
      {dots.map((d, i) => (
        <motion.span
          key={i}
          style={{ width: d.size, height: d.size, background: d.color }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{ x: d.x, y: d.y, scale: [0, 1, 0.6], opacity: [0, 1, 0] }}
          transition={{ duration: 1.3, delay: d.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function SuccessBadge() {
  return (
    <motion.span
      className="success-badge"
      initial={{ scale: 0, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 1.35 }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width="26" height="26">
        <motion.path
          d="M5 12.5l4.2 4.2L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 1.55, ease: 'easeOut' }}
        />
      </svg>
    </motion.span>
  );
}

export default function Confirmation({ booking, onClose }) {
  const { config } = useBrand();
  const name = config?.companyName || 'INOVACOM';
  const [revealed, setRevealed] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1700);
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus();
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, []);

  const downloadIcs = () => {
    const blob = new Blob([buildIcs({ ...booking, company: name })], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rendez-vous-${name.toLowerCase()}-${booking.date}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const title = 'Votre rendez-vous est confirmé\u00a0!';
  // Le logo démarre au centre de l'écran puis remonte au-dessus du message
  const startY = useMemo(() => Math.max(0, Math.round(window.innerHeight / 2 - 48 - 84)), []);
  const rows = [
    { icon: CalendarDays, label: 'Date', value: fmtDateLong(booking.date) },
    { icon: Clock, label: 'Heure', value: `${fmtTime(booking.time)} – ${fmtTime(addMinutes(booking.time, booking.duration))}` },
    { icon: PhoneCall, label: 'Nous vous appellerons au', value: fmtPhone(booking.phone), strong: true },
    { icon: Mail, label: 'E-mail', value: booking.email },
    { icon: Hash, label: 'Référence', value: booking.reference, mono: true },
  ];
  const tips = [
    { icon: Monitor, text: 'Soyez installé devant votre ordinateur allumé' },
    { icon: Smartphone, text: 'Gardez votre téléphone à portée de main' },
    { icon: KeyRound, text: 'Ayez vos identifiants de messagerie si vous les connaissez' },
  ];

  return (
    <motion.div
      ref={rootRef}
      tabIndex={-1}
      className="confirm-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.45 }}
    >
      <div className="confirm-screen__bg" aria-hidden>
        <motion.span className="glow glow--a" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.6, ease: EASE }} />
        <motion.span className="glow glow--b" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.8, delay: 0.2, ease: EASE }} />
      </div>

      <div className="confirm-screen__scroll">
        <div className="confirm-stage">
          <motion.div
            className="logo-stage"
            initial={{ y: startY, scale: 1.25 }}
            animate={revealed ? { y: 0, scale: 1 } : { y: startY, scale: 1.25 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            <motion.span className="logo-stage__halo" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, delay: 0.1, ease: EASE }} />
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="ring"
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: [0.55, 0.6, 2.1], opacity: [0, 0.55, 0] }}
                transition={{ duration: 1.6, delay: 1.15 + i * 0.22, ease: 'easeOut', times: [0, 0.08, 1] }}
              />
            ))}
            <Particles />
            <LogoReveal logo={config?.logo} name={name} />
            <SuccessBadge />
          </motion.div>

          <h1 id="confirm-title" className="confirm-title" aria-label={title}>
            {title.split(' ').map((w, i, arr) => (
              <motion.span
                key={i}
                aria-hidden
                initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                animate={revealed ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
                transition={{ duration: 0.55, delay: 0.55 + i * 0.07, ease: EASE }}
              >
                {w}{i < arr.length - 1 ? '\u00a0' : ''}
              </motion.span>
            ))}
          </h1>

          <motion.p className="confirm-lead" initial={{ opacity: 0, y: 10 }} animate={revealed ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.75, duration: 0.5 }}>
            Merci {booking.firstName}, votre intervention de migration de messagerie est planifiée. Un technicien {name} vous appellera à l’heure prévue.
          </motion.p>

          <motion.div
            className="recap"
            initial={{ opacity: 0, y: 24 }}
            animate={revealed ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.9, duration: 0.6, ease: EASE }}
          >
            <ul className="recap__rows">
              {rows.map(({ icon: Icon, label, value, strong, mono }, i) => (
                <motion.li key={label} initial={{ opacity: 0, x: -10 }} animate={revealed ? { opacity: 1, x: 0 } : {}} transition={{ delay: 1.05 + i * 0.07 }}>
                  <span className="recap__icon">
                    <Icon size={18} />
                  </span>
                  <span className="recap__label">{label}</span>
                  <span className={`recap__value ${strong ? 'is-strong' : ''} ${mono ? 'is-mono' : ''}`}>{value}</span>
                </motion.li>
              ))}
            </ul>
            <div className="recap__tips">
              <span className="recap__tips-title">Pour bien préparer l’intervention</span>
              <ul>
                {tips.map(({ icon: Icon, text }) => (
                  <li key={text}>
                    <Icon size={16} /> {text}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <motion.div className="confirm-actions" initial={{ opacity: 0, y: 10 }} animate={revealed ? { opacity: 1, y: 0 } : {}} transition={{ delay: 1.45 }}>
            <Button variant="secondary" icon={CalendarPlus} onClick={downloadIcs}>
              Ajouter à mon agenda
            </Button>
            <Button onClick={onClose}>Terminer</Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
