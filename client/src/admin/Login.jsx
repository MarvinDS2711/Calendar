import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Mail, LogIn, ShieldCheck } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';
import { Button, Field } from '../components/ui.jsx';
import { api } from '../lib/api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      onLogin(await api.post('/api/admin/login', { email, password }));
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login__aside">
        <div className="login__aside-inner">
          <BrandMark size={44} inverted />
          <h1>Espace administrateur</h1>
          <p>Pilotez les interventions de migration de messagerie : rendez-vous, disponibilités et suivi des clients.</p>
        </div>
        <span className="login__shape login__shape--1" />
        <span className="login__shape login__shape--2" />
      </div>
      <div className="login__panel">
        <motion.form className="login__form" onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} noValidate>
          <div className="login__mobile-brand">
            <BrandMark size={36} />
          </div>
          <h2>Connexion</h2>
          <p className="muted">Accès réservé à l’équipe INOVACOM.</p>
          {error && (
            <motion.div className="alert alert--error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert">
              {error}
            </motion.div>
          )}
          <Field label="Adresse e-mail">
            {(a) => (
              <div className="input-icon">
                <Mail size={18} />
                <input {...a} className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
            )}
          </Field>
          <Field label="Mot de passe">
            {(a) => (
              <div className="input-icon">
                <Lock size={18} />
                <input {...a} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}
          </Field>
          <Button type="submit" size="lg" icon={LogIn} loading={loading} disabled={!email || !password}>
            Se connecter
          </Button>
          <p className="login__secure">
            <ShieldCheck size={15} /> Connexion sécurisée · accès réservé
          </p>
        </motion.form>
      </div>
    </div>
  );
}
