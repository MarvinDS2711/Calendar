import { useState } from 'react';
import { KeyRound, Link2, Copy, Image as ImageIcon, CheckCircle2, ShieldCheck, Globe2 } from 'lucide-react';
import { Button, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useBrand } from '../lib/brand.jsx';
import { api } from '../lib/api.js';

export default function SettingsPage({ me }) {
  const toast = useToast();
  const { config, reload } = useBrand();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const publicUrl = `${window.location.origin}/`;

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!pw.currentPassword) err.currentPassword = 'Obligatoire';
    if (pw.newPassword.length < 10) err.newPassword = 'Au moins 10 caractères';
    if (pw.confirm !== pw.newPassword) err.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(err);
    if (Object.keys(err).length) return;
    setSaving(true);
    try {
      await api.post('/api/admin/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast('Mot de passe modifié. Les autres sessions ont été déconnectées.');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e2) {
      setErrors(e2.fields);
      toast(e2.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Paramètres</h1>
          <p className="muted">Compte, lien de réservation et identité visuelle.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card">
          <header className="card__head">
            <h2>
              <Link2 size={18} /> Lien de réservation
            </h2>
          </header>
          <p className="muted">C’est l’adresse à transmettre à vos clients (e-mail, SMS, signature…).</p>
          <div className="share-card__url" style={{ marginTop: 14 }}>
            <code>{publicUrl}</code>
            <button className="btn btn--primary btn--sm" onClick={() => navigator.clipboard?.writeText(publicUrl).then(() => toast('Lien copié.'))}>
              <Copy size={15} /> Copier
            </button>
          </div>
          <p className="settings-note">
            <Globe2 size={15} /> Fuseau horaire : <strong>Europe/Paris</strong> (heure d’été/hiver gérée automatiquement)
          </p>
        </section>

        <section className="card">
          <header className="card__head">
            <h2>
              <ImageIcon size={18} /> Logo INOVACOM
            </h2>
          </header>
          {config?.logo ? (
            <div className="logo-status logo-status--ok">
              <img src={config.logo.url} alt="Logo installé" />
              <div>
                <strong>
                  <CheckCircle2 size={16} /> Logo officiel installé
                </strong>
                <p className="muted">Utilisé dans l’en-tête, le favicon et l’animation de confirmation.</p>
              </div>
            </div>
          ) : (
            <div className="logo-status">
              <p>
                Déposez le fichier officiel dans le dossier <code>branding/</code> du serveur, sous le nom <code>logo.png</code> (fond transparent, carré, 512×512
                px conseillé) ou <code>logo.svg</code>.
              </p>
              <p className="muted">Aucun redémarrage n’est nécessaire : actualisez simplement la page.</p>
              <Button variant="secondary" size="sm" onClick={reload}>
                Vérifier à nouveau
              </Button>
            </div>
          )}
        </section>

        <section className="card">
          <header className="card__head">
            <h2>
              <KeyRound size={18} /> Mot de passe
            </h2>
            <span className="muted">{me.email}</span>
          </header>
          <form className="pw-form" onSubmit={submit} noValidate>
            <Field label="Mot de passe actuel" error={errors.currentPassword}>
              {(a) => <input {...a} className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}
            </Field>
            <Field label="Nouveau mot de passe" error={errors.newPassword} hint="10 caractères minimum.">
              {(a) => <input {...a} className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}
            </Field>
            <Field label="Confirmation" error={errors.confirm}>
              {(a) => <input {...a} className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}
            </Field>
            <div>
              <Button type="submit" icon={ShieldCheck} loading={saving}>
                Mettre à jour
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
