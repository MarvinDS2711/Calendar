import { PhoneCall, User, Mail, Sparkles } from 'lucide-react';
import { Field } from '../components/ui.jsx';
import { formatPhoneInput, suggestEmail } from '../lib/format.js';

export default function ContactStep({ values, errors, onChange, onBlur }) {
  const suggestion = values.email && !errors.email ? suggestEmail(values.email) : null;
  const input = (name, extra = {}) => ({
    name,
    value: values[name],
    onChange: (e) => onChange(name, extra.format ? extra.format(e.target.value) : e.target.value),
    onBlur: () => onBlur(name),
    className: 'input',
  });

  return (
    <div className="contact">
      <div className="contact__row">
        <Field label="Nom" required error={errors.lastName}>
          {(a) => (
            <div className="input-icon">
              <User size={18} aria-hidden />
              <input {...a} {...input('lastName')} autoComplete="family-name" placeholder="Dupont" />
            </div>
          )}
        </Field>
        <Field label="Prénom" required error={errors.firstName}>
          {(a) => (
            <div className="input-icon">
              <User size={18} aria-hidden />
              <input {...a} {...input('firstName')} autoComplete="given-name" placeholder="Marie" />
            </div>
          )}
        </Field>
      </div>

      <Field label="Adresse e-mail" required error={errors.email}>
        {(a) => (
          <div className="input-icon">
            <Mail size={18} aria-hidden />
            <input {...a} {...input('email')} type="email" inputMode="email" autoComplete="email" placeholder="marie.dupont@exemple.fr" />
          </div>
        )}
      </Field>
      {suggestion && (
        <button type="button" className="email-suggestion" onClick={() => onChange('email', suggestion)}>
          <Sparkles size={14} /> Vouliez-vous dire <strong>{suggestion}</strong> ?
        </button>
      )}

      <div className={`phone-callout ${errors.phone ? 'has-error' : ''}`}>
        <div className="phone-callout__head">
          <span className="phone-callout__icon">
            <PhoneCall size={20} />
          </span>
          <div>
            <strong>Important : merci de renseigner un numéro de téléphone valide.</strong>
            <p>Notre technicien vous contactera directement à l'heure du rendez-vous afin de réaliser l'intervention.</p>
          </div>
        </div>
        <Field label="Numéro de téléphone" required error={errors.phone}>
          {(a) => (
            <div className="input-icon input-icon--lg">
              <PhoneCall size={20} aria-hidden />
              <input
                {...a}
                {...input('phone', { format: formatPhoneInput })}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="06 12 34 56 78"
              />
            </div>
          )}
        </Field>
      </div>
    </div>
  );
}
