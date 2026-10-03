import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail, ShieldCheck, Sprout, Sun } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { authApi } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Brand } from '../components/Brand.jsx';
import { Button } from '../components/ui/Button.jsx';

export function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = isRegister ? await authApi.register(form) : await authApi.login({ email: form.email, password: form.password });
      signIn(result);
      const destination = location.state?.from?.startsWith('/app') ? location.state.from : '/app/dashboard';
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="AgriSense agricultural intelligence">
        <div className="auth-visual__top"><Brand inverse /></div>
        <div className="field-art" aria-hidden="true">
          <div className="field-art__sun"><Sun size={21} /></div>
          <div className="field-art__ridge field-art__ridge--back" />
          <div className="field-art__ridge field-art__ridge--mid" />
          <div className="field-art__ridge field-art__ridge--front" />
          <div className="field-art__rows" />
          <div className="field-art__plant field-art__plant--one"><Sprout size={46} /></div>
          <div className="field-art__plant field-art__plant--two"><Sprout size={67} /></div>
          <div className="field-art__plant field-art__plant--three"><Sprout size={40} /></div>
        </div>
        <div className="auth-visual__copy">
          <span className="auth-kicker"><span /> FIELD NOTES, MADE CLEAR</span>
          <h1>Good decisions<br />start <em>in the field.</em></h1>
          <p>Bring your farm conditions and practical AI guidance into one calm, clear workspace.</p>
          <div className="auth-trust"><span><ShieldCheck size={17} /> Your farms stay yours</span><i /><span><Leaf size={16} /> Advice grounded in your data</span></div>
        </div>
        <span className="auth-visual__foot">AGRISENSE · FARM INTELLIGENCE</span>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__mobile-brand"><Brand /></div>
        <div className="auth-form-wrap">
          <div className="auth-heading"><span className="auth-heading__icon"><Leaf size={19} /></span><span>{isRegister ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span></div>
          <h2>{isRegister ? 'Start with your farm.' : 'Good to see you.'}</h2>
          <p className="auth-intro">{isRegister ? 'Create a secure account to bring your farm data together.' : 'Sign in to see what’s happening across your farm.'}</p>
          {location.state?.expired && <div className="notice notice--info">Your session ended. Please sign in again.</div>}
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={submit}>
            {isRegister && <label className="form-field"><span>Your name</span><div className="input-wrap"><input name="name" autoComplete="name" value={form.name} onChange={change} placeholder="e.g. Kavitha R." maxLength="100" required /><span className="input-affix"><Sprout size={17} /></span></div></label>}
            <label className="form-field"><span>Email address</span><div className="input-wrap"><input name="email" type="email" autoComplete="email" value={form.email} onChange={change} placeholder="you@example.com" required /><span className="input-affix"><Mail size={17} /></span></div></label>
            <label className="form-field"><span>Password</span><div className="input-wrap"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={change} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} minLength={isRegister ? 8 : undefined} maxLength="128" required /><button className="input-affix input-affix--button" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((show) => !show)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <Button type="submit" className="auth-submit" disabled={submitting}>{submitting ? 'Please wait…' : (isRegister ? 'Create account' : 'Sign in')} {!submitting && <ArrowRight size={17} />}</Button>
          </form>
          <div className="auth-secure"><LockKeyhole size={14} /><span>Your connection is protected. Farm data is private to your account.</span></div>
          <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to AgriSense?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
        </div>
        <footer className="auth-panel__footer">© 2026 AgriSense <span>Built for the people who grow our food.</span></footer>
      </section>
    </main>
  );
}
