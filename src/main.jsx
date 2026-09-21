import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowLeft, CalendarBlank, MapPin, ArrowUpRight, DownloadSimple, Check, EnvelopeSimple, User, SignOut } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import '@fontsource-variable/manrope';
import { event } from './config';
import './styles.css';

const RECORDS_KEY = 'conference-demo-records-v1';
const SESSION_KEY = 'conference-demo-active-v1';
const normalizeEmail = value => value.trim().toLowerCase();
const readRecords = () => {
  const records = JSON.parse(sessionStorage.getItem(RECORDS_KEY) || '[]');
  if (!Array.isArray(records)) throw new Error('Invalid records');
  return records.filter(item => typeof item.id === 'string' && typeof item.email === 'string' && typeof item.firstName === 'string');
};
function readSession() {
  try { return readRecords().find(item => item.id === sessionStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}
function getRoute() {
  const path = window.location.hash.slice(1);
  return ['registro', 'acceso', 'confirmacion'].includes(path) ? path : 'inicio';
}
function navigate(path) { window.location.hash = path === 'inicio' ? '' : path; }

function Brand({ compact = false }) {
  return <a className={`brand ${compact ? 'brand-compact' : ''}`} href="#" aria-label="Business Conference, inicio">
    <img src="/favicon.svg" width="38" height="38" alt="" />
    <span>BUSINESS <span>CONFERENCE</span></span>
  </a>;
}
function Geometry() {
  return <div className="geometry" aria-hidden="true"><img className="geometry-top" src="/geometry.svg" alt="" /><img className="geometry-bottom" src="/geometry.svg" alt="" /></div>;
}
function EventDetails({ compact = false }) {
  return <div className={`event-details ${compact ? 'compact' : ''}`}>
    <div><CalendarBlank size={21} weight="regular" /><span>{event.date}<small>{event.time}</small></span></div>
    <div><MapPin size={21} weight="regular" /><span>{event.venue}<small>Nos vemos en persona</small></span></div>
  </div>;
}
function Landing() {
  return <>
    <div className="hero-content enter">
      <p className="eyebrow">El próximo encuentro empieza contigo</p>
      <h1 className="hero-title"><span>BUSINESS</span><strong>CONFERENCE<span className="title-period">.</span></strong><span className="hero-year">2026</span></h1>
      <p className="hero-description">{event.description}</p>
      <div className="hero-actions"><a className="button button-outline" href="#acceso">Ya estoy registrado</a><a className="button button-primary" href="#registro">Registrarme<ArrowUpRight size={20} /></a></div>
      <p className="hero-date">28 de octubre <span>/</span> 8:00 p. m.</p>
    </div>
    <div className="hero-bottom"><span>Ideas que nos acercan.</span><span>Conexiones que nos impulsan.</span></div>
  </>;
}
function Information() {
  return <section className="information" id="evento" aria-labelledby="about-title">
    <div className="information-inner">
      <div><p className="section-label">Acerca del encuentro</p><h2 id="about-title">Las grandes ideas<br />empiezan con una<br /><span>conversación.</span></h2></div>
      <div className="information-copy"><p>Conecta con nuevas perspectivas y forma parte de un encuentro pensado para compartir, aprender y construir lo que sigue.</p><p>Completa tu registro y guarda tu código QR. Será tu pase de acceso el día del evento.</p><EventDetails /></div>
    </div>
  </section>;
}
function Field({ label, name, type = 'text', autoComplete, placeholder, error, onChange, value, icon: Icon = User, required = true }) {
  return <div className="field"><label htmlFor={name}>{label}{!required && <span className="optional"> (opcional)</span>}</label><div className={`input-wrap ${error ? 'invalid' : ''}`}><Icon size={19} aria-hidden="true" /><input id={name} name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} required={required} maxLength={type === 'email' ? 254 : 80} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} /></div>{error && <span className="field-error" id={`${name}-error`}>{error}</span>}</div>;
}
function FormAside() {
  return <aside className="form-aside"><span className="aside-mark" aria-hidden="true" /><p className="section-label">Business Conference</p><h2>Las ideas conectan.<br />Las personas<br /><span>las hacen posibles.</span></h2><p>Nos alegra que seas parte<br />de este encuentro.</p><EventDetails compact /></aside>;
}
function RegistrationForm({ onAuthenticated }) {
  const [values, setValues] = useState({ firstName: '', lastName: '', secondLastName: '', email: '', confirmEmail: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const change = e => { setValues(v => ({ ...v, [e.target.name]: e.target.value })); setErrors(v => ({ ...v, [e.target.name]: '' })); setMessage(''); };
  async function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!values.firstName.trim()) nextErrors.firstName = 'Escribe tu nombre.';
    if (!values.lastName.trim()) nextErrors.lastName = 'Escribe tu apellido paterno.';
    if (normalizeEmail(values.email) !== normalizeEmail(values.confirmEmail)) nextErrors.confirmEmail = 'Los correos no coinciden. Revisa e inténtalo de nuevo.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { document.getElementById(Object.keys(nextErrors)[0])?.focus(); return; }
    setBusy(true);
    try {
      const records = readRecords();
      const email = normalizeEmail(values.email);
      if (records.some(record => record.email === email)) { setMessage('Este correo ya está registrado en esta demostración. Entra desde “Iniciar sesión” para consultar tu pase.'); return; }
      const record = { id: crypto.randomUUID(), firstName: values.firstName.trim(), lastName: values.lastName.trim(), secondLastName: values.secondLastName.trim(), email };
      sessionStorage.setItem(RECORDS_KEY, JSON.stringify([...records, record]));
      sessionStorage.setItem(SESSION_KEY, record.id);
      onAuthenticated(record);
      navigate('confirmacion');
    } catch { setMessage('No pudimos guardar tu registro. Permite el almacenamiento del navegador e inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <div className="form-layout enter"><section className="form-panel" aria-labelledby="register-title"><p className="section-label">Sé parte del encuentro</p><h1 id="register-title">Tu lugar empieza aquí<span>.</span></h1><p className="form-intro">Completa tus datos para obtener tu pase de acceso.</p><p className="switch-form">¿Ya estás registrado? <a href="#acceso">Iniciar sesión<ArrowUpRight size={14} /></a></p><form onSubmit={submit}>
    <Field label="Nombre(s)" name="firstName" autoComplete="given-name" placeholder="Tu nombre" value={values.firstName} onChange={change} error={errors.firstName} />
    <div className="field-row"><Field label="Apellido paterno" name="lastName" autoComplete="family-name" placeholder="Tu primer apellido" value={values.lastName} onChange={change} error={errors.lastName} /><Field label="Apellido materno" name="secondLastName" autoComplete="additional-name" placeholder="Tu segundo apellido" value={values.secondLastName} onChange={change} required={false} /></div>
    <Field label="Correo electrónico" name="email" type="email" autoComplete="email" placeholder="nombre@ejemplo.com" value={values.email} onChange={change} icon={EnvelopeSimple} />
    <Field label="Confirmar correo electrónico" name="confirmEmail" type="email" autoComplete="off" placeholder="Escribe nuevamente tu correo" value={values.confirmEmail} onChange={change} error={errors.confirmEmail} icon={EnvelopeSimple} />
    {message && <p role="alert" className="form-message">{message}</p>}
    <button className="button button-primary form-submit" type="submit" disabled={busy}>{busy ? 'Creando tu pase…' : 'Registrarme'}<ArrowRight size={19} /></button>
    <p className="demo-notice">Demostración: tus datos se guardan solo durante esta sesión del navegador.</p>
  </form></section><FormAside /></div>;
}
function LoginForm({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  function submit(e) {
    e.preventDefault();
    try {
      const record = readRecords().find(item => item.email === normalizeEmail(email));
      if (!record) { setMessage('No encontramos este correo en la sesión actual. Regístrate para crear tu pase de demostración.'); return; }
      sessionStorage.setItem(SESSION_KEY, record.id);
      onAuthenticated(record);
      navigate('confirmacion');
    } catch { setMessage('No pudimos consultar tu pase. Permite el almacenamiento del navegador e inténtalo de nuevo.'); }
  }
  return <div className="form-layout login-layout enter"><section className="form-panel" aria-labelledby="login-title"><p className="section-label">Continúa tu experiencia</p><h1 id="login-title">Qué gusto verte<br />de nuevo<span>.</span></h1><p className="form-intro">Ingresa el correo con el que te registraste para consultar tu pase.</p><p className="switch-form">¿Aún no estás registrado? <a href="#registro">Registrarme<ArrowUpRight size={14} /></a></p><form onSubmit={submit}><Field label="Correo electrónico" name="loginEmail" type="email" autoComplete="email" placeholder="nombre@ejemplo.com" icon={EnvelopeSimple} value={email} onChange={e => { setEmail(e.target.value); setMessage(''); }} />{message && <p className="form-message" role="alert">{message}</p>}<button className="button button-primary form-submit" type="submit">Iniciar sesión<ArrowRight size={19} /></button><p className="demo-notice">Puedes consultar los registros creados en esta misma sesión. Esta demostración no envía correos.</p></form></section><FormAside /></div>;
}
function Confirmation({ attendee }) {
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(`conference-demo:${attendee.id}`, { width: 420, margin: 4, color: { dark: '#14132f', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(url => { if (active) setQr(url); }).catch(() => { if (active) setError('No pudimos generar el QR. Recarga la página para intentarlo de nuevo.'); });
    return () => { active = false; };
  }, [attendee.id]);
  async function download() {
    try {
      await document.fonts.ready;
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 1400);
      ctx.fillStyle = '#21afd4'; ctx.fillRect(0, 0, 1000, 18);
      ctx.fillStyle = '#14132f'; ctx.textAlign = 'center'; ctx.font = '800 52px Manrope Variable'; ctx.fillText('BUSINESS CONFERENCE', 500, 120);
      ctx.font = '500 26px Manrope Variable'; ctx.fillText('PASE DE DEMOSTRACIÓN', 500, 184);
      const img = new Image(); img.src = qr; await img.decode(); ctx.drawImage(img, 225, 230, 550, 550);
      ctx.font = '700 38px Manrope Variable'; ctx.fillText(attendee.firstName, 500, 850, 860);
      ctx.font = '500 30px Manrope Variable'; ctx.fillText(`${attendee.lastName} ${attendee.secondLastName}`, 500, 900, 860);
      ctx.font = '500 25px Manrope Variable'; ctx.fillText(event.date, 500, 1010); ctx.fillText(event.venue, 500, 1060);
      ctx.font = '400 20px Manrope Variable'; ctx.fillText(`Folio: ${attendee.id}`, 500, 1170); ctx.fillText('Pase de prueba, sin validez para acceso a un evento.', 500, 1280);
      const link = document.createElement('a'); link.download = `pase-business-conference-${attendee.id.slice(0, 8)}.png`; link.href = canvas.toDataURL('image/png'); document.body.appendChild(link); link.click(); link.remove(); setDownloaded(true);
    } catch { setError('No pudimos descargar tu pase. Inténtalo de nuevo.'); }
  }
  return <div className="confirmation enter"><section><div className="success-icon"><Check size={24} weight="bold" /></div><p className="section-label">Registro de demostración completo</p><h1>¡Nos vemos ahí,<br /><span>{attendee.firstName}!</span></h1><p className="confirmation-intro">Tu pase está listo. Descárgalo y tenlo a la mano para el día del encuentro.</p><EventDetails /><p className="demo-notice">Este es un pase de prueba, sin validez para acceso a un evento.</p></section><section className="ticket" aria-label="Tu pase de acceso"><div className="ticket-heading"><Brand compact /><span>PASE PERSONAL</span></div><div className="qr-wrap">{qr ? <img src={qr} width="210" height="210" alt="Código QR de tu pase de demostración" /> : <p role="status">Generando tu QR…</p>}</div><h2>{attendee.firstName} {attendee.lastName}</h2><p className="ticket-email">{attendee.email}</p><div className="ticket-divider" /><div className="ticket-folio"><span>FOLIO DE REGISTRO</span><strong>{attendee.id.slice(0, 8).toUpperCase()}</strong></div><button className="button button-primary" disabled={!qr} onClick={download}>Descargar mi pase<DownloadSimple size={19} /></button>{downloaded && <p role="status" className="download-status">Tu pase se ha descargado.</p>}{error && <p role="alert" className="form-message">{error}</p>}</section></div>;
}
function App() {
  const [route, setRoute] = useState(getRoute);
  const [attendee, setAttendee] = useState(readSession);
  const mainRef = useRef(null);
  const initial = useRef(true);
  useEffect(() => {
    const change = () => { setRoute(getRoute()); window.scrollTo({ top: 0, behavior: 'instant' }); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (route === 'confirmacion' && !attendee) { navigate('acceso'); return; }
    document.title = `${{ inicio: 'Bienvenido', registro: 'Registro', acceso: 'Iniciar sesión', confirmacion: 'Tu pase' }[route]} | ${event.name}`;
    if (!initial.current) mainRef.current?.focus({ preventScroll: true });
    initial.current = false;
  }, [route, attendee]);
  const home = route === 'inicio';
  const logout = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* In-memory session is still cleared. */ } setRoute('inicio'); setAttendee(null); navigate('inicio'); };
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); mainRef.current?.focus(); }}>Ir al contenido</a><div className={`stage ${home ? 'landing-stage' : 'inner-stage'} ${route === 'confirmacion' ? 'confirmation-stage' : ''}`}><Geometry /><header className="header"><Brand /><nav aria-label="Navegación principal">{home ? <a className="header-link" href="#evento" onClick={e => { e.preventDefault(); document.getElementById('evento')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>Acerca del evento<ArrowDownIcon /></a> : route === 'confirmacion' && attendee ? <button className="header-link" onClick={logout}>Cerrar sesión<SignOut size={17} /></button> : <a className="header-link" href="#"><ArrowLeft size={17} />Volver al inicio</a>}</nav></header><main id="main-content" tabIndex={-1} ref={mainRef} key={route}>{home ? <Landing /> : route === 'registro' ? <RegistrationForm onAuthenticated={setAttendee} /> : route === 'acceso' ? <LoginForm onAuthenticated={setAttendee} /> : attendee ? <Confirmation attendee={attendee} /> : null}</main></div>{home && <Information />}<footer className="footer"><span>Business Conference</span><p>Ideas. Personas. Nuevas posibilidades.</p><span className="footer-demo">Vista de demostración</span></footer></>;
}
function ArrowDownIcon() { return <ArrowRight size={15} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />; }

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
