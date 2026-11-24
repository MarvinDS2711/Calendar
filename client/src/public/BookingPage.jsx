import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, CalendarCheck2, Clock, Headset, MonitorSmartphone, PhoneCall, RefreshCw } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';
import { Button, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useBrand } from '../lib/brand.jsx';
import { api, qs } from '../lib/api.js';
import { EMAIL_RE, addDays, fmtDateMedium, fmtTime, normalizePhone, todayParis } from '../lib/format.js';
import Calendar from './Calendar.jsx';
import TimeSlots from './TimeSlots.jsx';
import ContactStep from './ContactStep.jsx';
import ReviewStep from './ReviewStep.jsx';
import Confirmation from './Confirmation.jsx';

const STEPS = ['Créneau', 'Coordonnées', 'Validation'];
const EMPTY = { lastName: '', firstName: '', email: '', phone: '' };

function validateContact(v) {
  const e = {};
  if (!v.lastName.trim()) e.lastName = 'Merci d’indiquer votre nom.';
  if (!v.firstName.trim()) e.firstName = 'Merci d’indiquer votre prénom.';
  if (!v.email.trim()) e.email = 'Merci d’indiquer votre adresse e-mail.';
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Cette adresse e-mail semble incorrecte (ex. : nom@exemple.fr).';
  if (!v.phone.trim()) e.phone = 'Le numéro de téléphone est indispensable pour que le technicien vous appelle.';
  else if (!normalizePhone(v.phone)) e.phone = 'Numéro invalide. Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.';
  return e;
}

export default function BookingPage() {
  const { config } = useBrand();
  const toast = useToast();
  const today = config?.today || todayParis();
  const horizon = Math.min(config?.horizonDays ?? 45, 90);
  const maxDate = addDays(today, horizon);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [days, setDays] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [monthDir, setMonthDir] = useState(1);
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [contact, setContact] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const cardRef = useRef(null);

  const errors = useMemo(() => validateContact(contact), [contact]);
  const visibleErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => touched[k]));

  const loadAvailability = useCallback(
    async ({ silent } = {}) => {
      try {
        if (!silent) setLoadError(null);
        const r = await api.get('/api/public/availability' + qs({ from: today, to: maxDate }));
        setDays(r.days);
        return r.days;
      } catch (e) {
        if (!silent) setLoadError(e.message);
        return null;
      }
    },
    [today, maxDate],
  );

  // Chargement initial + sélection automatique du premier jour disponible
  useEffect(() => {
    loadAvailability().then((d) => {
      const first = d && Object.keys(d)[0];
      if (first) {
        setDate((cur) => cur || first);
        setMonth(first.slice(0, 7));
      }
    });
  }, [loadAvailability]);

  // Rafraîchissement : les modifications de l'admin sont visibles immédiatement
  useEffect(() => {
    if (booking) return;
    const refresh = () => document.visibilityState === 'visible' && loadAvailability({ silent: true });
    const id = setInterval(refresh, 45_000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [loadAvailability, booking]);

  // Si le créneau choisi disparaît (réservé entre-temps), on prévient le client
  useEffect(() => {
    if (!days || !date) return;
    if (time && !(days[date] || []).includes(time)) {
      setTime(null);
      if (step === 0) toast('Le créneau sélectionné vient d’être réservé. Merci d’en choisir un autre.', 'info');
    }
    if (!days[date]) setDate(null);
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    requestAnimationFrame(() => {
      const top = cardRef.current?.getBoundingClientRect().top;
      if (top !== undefined && top < 0) cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const next = () => {
    if (step === 0 && date && time) return go(1);
    if (step === 1) {
      setTouched({ lastName: true, firstName: true, email: true, phone: true });
      if (Object.keys(errors).length === 0) go(2);
      else {
        const firstKey = ['lastName', 'firstName', 'email', 'phone'].find((k) => errors[k]);
        document.querySelector(`[name="${firstKey}"]`)?.focus();
      }
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/api/public/bookings', { ...contact, date, time, website: '' });
      setBooking(res);
    } catch (e) {
      if (e.status === 409) {
        toast(e.message, 'error', 6000);
        setTime(null);
        await loadAvailability();
        go(0);
      } else if (e.status === 400 && Object.keys(e.fields).length) {
        toast('Merci de vérifier vos coordonnées.', 'error');
        setTouched({ lastName: true, firstName: true, email: true, phone: true });
        go(1);
      } else {
        toast(e.message, 'error', 6000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setBooking(null);
    setStep(0);
    setTime(null);
    setContact(EMPTY);
    setTouched({});
    loadAvailability();
  };

  const duration = config?.slotDuration ?? 30;
  const availableCount = days ? Object.keys(days).length : 0;

  return (
    <div className="public">
      <div className="public__bg" aria-hidden>
        <span className="blob blob--1" />
        <span className="blob blob--2" />
        <span className="grid-pattern" />
        {config?.logo && <img className="logo-watermark" src={config.logo.url} alt="" />}
      </div>

      <header className="public__header">
        <BrandMark size={44} />
        <span className="public__tag">
          <Headset size={15} /> Assistance migration messagerie
        </span>
      </header>

      <main className="public__main">
        <motion.section className="hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <span className="eyebrow">Migration de votre messagerie</span>
          <h1>
            Réservez votre rendez-vous <span className="text-gradient">en moins d’une minute</span>
          </h1>
          <p className="hero__lead">
            Choisissez le moment qui vous convient : un technicien {config?.companyName || 'INOVACOM'} vous appelle et s’occupe à distance de la migration et de
            l’installation de votre nouvelle boîte mail.
          </p>
          <ol className="how">
            {[
              { icon: CalendarCheck2, title: 'Choisissez un créneau', text: 'Une date et un horaire libres.' },
              { icon: PhoneCall, title: 'Le technicien vous appelle', text: 'À l’heure exacte du rendez-vous.' },
              { icon: MonitorSmartphone, title: 'Migration sur votre poste', text: 'Messagerie migrée et configurée.' },
            ].map(({ icon: Icon, title, text }, i) => (
              <motion.li key={title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.1 }}>
                <span className="how__icon">
                  <Icon size={20} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </motion.li>
            ))}
          </ol>
          <div className="hero__meta">
            <span>
              <Clock size={16} /> Durée estimée : {duration} min
            </span>
          </div>
        </motion.section>

        <motion.section
          ref={cardRef}
          className="booking-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Prise de rendez-vous"
        >
          <nav className="stepper" aria-label="Étapes">
            {STEPS.map((label, i) => (
              <div key={label} className={`stepper__item ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`} aria-current={i === step ? 'step' : undefined}>
                <span className="stepper__bullet">{i < step ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                <span className="stepper__label">{label}</span>
              </div>
            ))}
            <div className="stepper__bar">
              <motion.span animate={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
            </div>
          </nav>

          <div className="booking-card__body">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: dir * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -28 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {step === 0 && (
                  <>
                    <div className="step-head">
                      <h2>Quand souhaitez-vous être appelé ?</h2>
                      <p>Sélectionnez une date puis un horaire. Heures de Paris.</p>
                    </div>
                    {loadError ? (
                      <div className="load-error">
                        <p>{loadError}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={() => loadAvailability()}>
                          Réessayer
                        </Button>
                      </div>
                    ) : !days ? (
                      <div className="loading-block">
                        <Spinner /> Chargement des disponibilités…
                      </div>
                    ) : availableCount === 0 ? (
                      <div className="load-error">
                        <p>Aucun créneau n’est disponible pour le moment. Merci de réessayer un peu plus tard.</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={() => loadAvailability()}>
                          Actualiser
                        </Button>
                      </div>
                    ) : (
                      <div className="picker">
                        <Calendar
                          month={month}
                          direction={monthDir}
                          onMonthChange={(m, d) => {
                            setMonthDir(d);
                            setMonth(m);
                          }}
                          days={days}
                          selected={date}
                          today={today}
                          maxDate={maxDate}
                          onSelect={(d) => {
                            setDate(d);
                            setTime(null);
                          }}
                        />
                        <TimeSlots date={date} slots={(date && days[date]) || []} selected={time} onSelect={setTime} />
                      </div>
                    )}
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="step-head">
                      <h2>Vos coordonnées</h2>
                      <p>Tous les champs sont obligatoires.</p>
                    </div>
                    <ContactStep
                      values={contact}
                      errors={visibleErrors}
                      onChange={(k, v) => setContact((c) => ({ ...c, [k]: v }))}
                      onBlur={(k) => setTouched((t) => ({ ...t, [k]: true }))}
                    />
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="step-head">
                      <h2>Vérifiez vos informations</h2>
                      <p>Un dernier coup d’œil avant de confirmer.</p>
                    </div>
                    <ReviewStep date={date} time={time} duration={duration} contact={contact} onEdit={go} />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="booking-card__footer">
            {step > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => go(step - 1)} disabled={submitting}>
                Retour
              </Button>
            ) : (
              <div className="selection-summary" aria-live="polite">
                {date && time ? (
                  <>
                    <CalendarCheck2 size={18} /> {fmtDateMedium(date)} à <strong>{fmtTime(time)}</strong>
                  </>
                ) : (
                  <span className="muted">Aucun horaire sélectionné</span>
                )}
              </div>
            )}
            {step < 2 ? (
              <Button iconRight={ArrowRight} onClick={next} disabled={step === 0 && !(date && time)} size="lg">
                Continuer
              </Button>
            ) : (
              <Button icon={Check} onClick={submit} loading={submitting} size="lg" className="btn--confirm">
                Confirmer mon rendez-vous
              </Button>
            )}
          </footer>
        </motion.section>
      </main>

      <footer className="public__footer">
        {config?.logo && <img className="public__footer-logo" src={config.logo.url} alt="" />}
        © {new Date().getFullYear()} {config?.companyName || 'INOVACOM'} · Les horaires sont indiqués à l’heure de Paris
      </footer>

      <AnimatePresence>{booking && <Confirmation booking={booking} onClose={reset} />}</AnimatePresence>
    </div>
  );
}
