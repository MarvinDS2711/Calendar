import { CalendarDays, Clock, PhoneCall, Mail, User, PencilLine, ShieldCheck } from 'lucide-react';
import { fmtDateLong, fmtTime, addMinutes, fmtPhone, normalizePhone } from '../lib/format.js';

export default function ReviewStep({ date, time, duration, contact, onEdit }) {
  const phone = fmtPhone(normalizePhone(contact.phone) || contact.phone);
  return (
    <div className="review">
      <section className="review__slot">
        <div className="review__slot-main">
          <span className="review__icon">
            <CalendarDays size={22} />
          </span>
          <div>
            <span className="review__label">Votre rendez-vous</span>
            <strong className="review__date">{fmtDateLong(date)}</strong>
            <span className="review__time">
              <Clock size={15} /> {fmtTime(time)} – {fmtTime(addMinutes(time, duration))} <em>(≈ {duration} min)</em>
            </span>
          </div>
        </div>
        <button type="button" className="link-btn" onClick={() => onEdit(0)}>
          <PencilLine size={15} /> Modifier
        </button>
      </section>

      <section className="review__contact">
        <div className="review__contact-head">
          <span className="review__label">Vos coordonnées</span>
          <button type="button" className="link-btn" onClick={() => onEdit(1)}>
            <PencilLine size={15} /> Modifier
          </button>
        </div>
        <ul>
          <li>
            <User size={17} /> {contact.firstName.trim()} {contact.lastName.trim().toUpperCase()}
          </li>
          <li>
            <Mail size={17} /> {contact.email.trim().toLowerCase()}
          </li>
          <li className="review__phone">
            <PhoneCall size={17} /> <strong>{phone}</strong>
          </li>
        </ul>
      </section>

      <div className="review__notice">
        <PhoneCall size={18} />
        <p>
          Notre technicien vous appellera au <strong>{phone}</strong> le {fmtDateLong(date).toLowerCase()} à <strong>{fmtTime(time)}</strong>. Merci de
          vérifier que ce numéro est correct et d'être disponible devant votre ordinateur.
        </p>
      </div>

      <p className="review__privacy">
        <ShieldCheck size={15} /> Vos informations sont utilisées uniquement pour l'organisation de votre intervention.
      </p>
    </div>
  );
}
