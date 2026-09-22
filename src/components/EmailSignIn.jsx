import { useState } from 'react';
import { ArrowRight, EnvelopeSimple } from '@phosphor-icons/react';
import { sendSignInLink } from '../services/supabase';

export default function EmailSignIn({ staff = false }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try { await sendSignInLink(email, staff ? 'personal' : 'pase'); setSent(true); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="form-panel" aria-labelledby={staff ? 'staff-login-title' : 'login-title'}>
    <p className="section-label">{staff ? 'Control de acceso' : 'Continúa tu experiencia'}</p>
    <h1 id={staff ? 'staff-login-title' : 'login-title'}>{staff ? 'Acceso del personal' : 'Qué gusto verte de nuevo'}<span>.</span></h1>
    <p className="form-intro">{staff ? 'Ingresa el correo autorizado para escanear gafetes y consultar ingresos.' : 'Ingresa tu correo y te enviaremos un enlace para consultar tu gafete.'}</p>
    {!staff && <p className="switch-form">¿Aún no estás registrado? <a href="#registro">Registrarme</a></p>}
    {sent ? <div className="email-sent" role="status"><h2>Revisa tu correo</h2><p>Solicitamos tu enlace de acceso. Revisa también la carpeta de correo no deseado. El enlace tiene una vigencia limitada.</p><button className="access-copy" type="button" onClick={() => { setSent(false); setMessage(''); }}>Usar otro correo o reenviar</button></div> : <form onSubmit={submit}>
      <div className="field"><label htmlFor="loginEmail">Correo electrónico</label><div className="input-wrap"><EnvelopeSimple size={19} aria-hidden="true" /><input id="loginEmail" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setMessage(''); }} placeholder="nombre@ejemplo.com" /></div></div>
      {message && <p className="form-message" role="alert">{message}</p>}
      <button className="button button-primary form-submit" disabled={busy} type="submit">{busy ? 'Enviando enlace…' : 'Enviar enlace de acceso'}<ArrowRight size={19} /></button>
    </form>}
  </section>;
}
