import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowLeft, CalendarBlank, MapPin, ArrowUpRight, DownloadSimple, Check, EnvelopeSimple, User, SignOut } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import '@fontsource-variable/manrope';
import { event, registrationForm } from './config';
import { normalizeEmail, registerAttendee, getRegistration, getMyRegistration, getEventSettings, savedAccess, clearAccess } from './services/registrations';
import { supabase, isEmailCallback } from './services/supabase';
import EmailSignIn from './components/EmailSignIn';
import StaffAccess from './components/StaffAccess';
import './styles.css';

function getRoute() {
  const path = window.location.hash.slice(1);
  if (['registro', 'acceso', 'confirmacion', 'personal'].includes(path)) return path;
  const area = new URLSearchParams(window.location.search).get('area');
  return area === 'personal' ? 'personal' : area === 'pase' ? 'confirmacion' : 'inicio';
}
function navigate(path) { window.location.hash = path === 'inicio' ? '' : path; }

function Brand({ compact = false }) {
  return <a className={`brand ${compact ? 'brand-compact' : ''}`} href="#" aria-label="Los DiDis, inicio">
    <img src="/brand/los-didis-logo.png" width="1746" height="422" alt="Los DiDis 2026" />
  </a>;
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
      <h1 className="hero-title"><span className="sr-only">Los DiDis 2026</span><img src="/brand/los-didis-logo.png" width="1746" height="422" alt="" fetchPriority="high" /></h1>
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
function Field({ label, name, type = 'text', autoComplete, placeholder, error, onChange, value, icon: Icon = User, required = true, maxLength }) {
  return <div className="field"><label htmlFor={name}>{label}{!required && <span className="optional"> (opcional)</span>}</label><div className={`input-wrap ${error ? 'invalid' : ''}`}><Icon size={19} aria-hidden="true" /><input id={name} name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} required={required} maxLength={maxLength ?? (type === 'email' ? 254 : 80)} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} /></div>{error && <span className="field-error" id={`${name}-error`}>{error}</span>}</div>;
}
function FormAside() {
  return <aside className="form-aside"><span className="aside-mark" aria-hidden="true" /><p className="section-label">Los DiDis</p><h2>Las ideas conectan.<br />Las personas<br /><span>las hacen posibles.</span></h2><p>Nos alegra que seas parte<br />de este encuentro.</p><EventDetails compact /></aside>;
}
function RegistrationForm({ onAuthenticated }) {
  const [values, setValues] = useState({ firstName: '', lastName: '', secondLastName: '', email: '', confirmEmail: '', phone: '', state: '', extra1: '', extra2: '', privacyAccepted: false });
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  useEffect(() => {
    let active = true;
    getEventSettings().then(value => { if (active) setSettings(value); }).catch(error => { if (active) setSettingsError(error.message); });
    return () => { active = false; };
  }, []);
  const privacyReady = Boolean(settings?.privacyUrl && settings?.privacyVersion);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const change = e => { setValues(v => ({ ...v, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setErrors(v => ({ ...v, [e.target.name]: '' })); setMessage(''); };
  async function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!values.firstName.trim()) nextErrors.firstName = 'Escribe tu nombre.';
    if (!privacyReady) { setMessage('El registro estará disponible cuando se publique el aviso de privacidad.'); return; }
    if (!values.privacyAccepted) nextErrors.privacyAccepted = 'Lee y acepta el aviso de privacidad para continuar.';
    if (normalizeEmail(values.email) !== normalizeEmail(values.confirmEmail)) nextErrors.confirmEmail = 'Los correos no coinciden. Revisa e inténtalo de nuevo.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { document.getElementById(Object.keys(nextErrors)[0])?.focus(); return; }
    setBusy(true);
    try {
      const record = await registerAttendee(values, settings.privacyVersion);
      onAuthenticated(record);
      navigate('confirmacion');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <div className="form-layout enter"><section className="form-panel" aria-labelledby="register-title"><p className="section-label">Sé parte del encuentro</p><h1 id="register-title">Tu lugar empieza aquí<span>.</span></h1><p className="form-intro">Completa tus datos para obtener tu pase de acceso.</p><p className="switch-form">¿Ya estás registrado? <a href="#acceso">Iniciar sesión<ArrowUpRight size={14} /></a></p><form onSubmit={submit}>
    <Field label="Nombre(s)" name="firstName" autoComplete="given-name" placeholder="Tu nombre" value={values.firstName} onChange={change} error={errors.firstName} />
    <div className="field-row"><Field label="Apellido paterno" name="lastName" required={false} autoComplete="family-name" placeholder="Tu primer apellido" value={values.lastName} onChange={change} error={errors.lastName} /><Field label="Apellido materno" name="secondLastName" autoComplete="additional-name" placeholder="Tu segundo apellido" value={values.secondLastName} onChange={change} required={false} /></div>
    <Field label="Correo electrónico" name="email" type="email" autoComplete="email" placeholder="nombre@ejemplo.com" value={values.email} onChange={change} icon={EnvelopeSimple} />
    <Field label="Confirmar correo electrónico" name="confirmEmail" type="email" autoComplete="off" placeholder="Escribe nuevamente tu correo" value={values.confirmEmail} onChange={change} error={errors.confirmEmail} icon={EnvelopeSimple} />
    <div className="field-row"><Field label="Teléfono" name="phone" type="tel" autoComplete="tel" placeholder="Tu teléfono" maxLength={30} value={values.phone} onChange={change} required={false} /><Field label="Estado" name="state" autoComplete="address-level1" placeholder="Tu estado" value={values.state} onChange={change} required={false} /></div>
    {registrationForm.showAdditionalFields && <>
    <Field label={settings?.extra1Label || 'Información adicional 1'} name="extra1" placeholder="Escribe tu respuesta" maxLength={500} value={values.extra1} onChange={change} required={false} />
    <Field label={settings?.extra2Label || 'Información adicional 2'} name="extra2" placeholder="Escribe tu respuesta" maxLength={500} value={values.extra2} onChange={change} required={false} />
    </>}
    <div className="privacy-field"><label htmlFor="privacyAccepted"><input id="privacyAccepted" name="privacyAccepted" type="checkbox" checked={values.privacyAccepted} onChange={change} required disabled={!privacyReady} aria-describedby="privacy-note" aria-invalid={Boolean(errors.privacyAccepted)} /><span>He leído y acepto {privacyReady ? <a href={settings.privacyUrl} target="_blank" rel="noopener noreferrer">el aviso de privacidad</a> : 'el aviso de privacidad'}.</span></label><p id="privacy-note">{settingsError || (!settings ? 'Consultando disponibilidad del registro…' : !privacyReady ? 'Aviso de privacidad pendiente de publicación. El registro se habilitará cuando esté disponible.' : 'Nombre, correo y confirmación de correo son obligatorios.')}</p>{errors.privacyAccepted && <p className="field-error">{errors.privacyAccepted}</p>}</div>
    {message && <p role="alert" className="form-message">{message}</p>}
    <button className="button button-primary form-submit" type="submit" disabled={busy || !privacyReady || !settings?.registrationOpen}>{busy ? 'Creando tu pase…' : 'Registrarme'}<ArrowRight size={19} /></button>
    <p className="demo-notice">Al terminar, podrás descargar tu gafete virtual.</p>
  </form></section><FormAside /></div>;
}
function LoginForm() {
  return <div className="form-layout login-layout enter"><EmailSignIn /><FormAside /></div>;
}
function Confirmation({ attendee }) {
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(`los-didis:v1:${event.slug}:${attendee.qrToken}`, { width: 420, margin: 4, color: { dark: '#24160f', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(url => { if (active) setQr(url); }).catch(() => { if (active) setError('No pudimos generar el QR. Recarga la página para intentarlo de nuevo.'); });
    return () => { active = false; };
  }, [attendee.passId, attendee.qrToken]);
  async function download() {
    try {
      await document.fonts.ready;
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 1400);
      const background = new Image(); background.src = '/brand/los-didis-background.jpg'; await background.decode();
      ctx.drawImage(background, 0, 760, 2000, 480, 0, 0, 1000, 240);
      const logo = new Image(); logo.src = '/brand/los-didis-logo.png'; await logo.decode();
      ctx.drawImage(logo, 200, 28, 600, 145);
      ctx.fillStyle = '#24160f'; ctx.textAlign = 'center';
      ctx.font = '500 26px Manrope Variable'; ctx.fillText(attendee.isTest ? 'GAFETE DE PRUEBA' : 'GAFETE VIRTUAL', 500, 212);
      const img = new Image(); img.src = qr; await img.decode(); ctx.drawImage(img, 225, 230, 550, 550);
      ctx.font = '700 38px Manrope Variable'; ctx.fillText(attendee.firstName, 500, 850, 860);
      ctx.font = '500 30px Manrope Variable'; ctx.fillText(`${attendee.lastName} ${attendee.secondLastName}`, 500, 900, 860);
      ctx.font = '500 25px Manrope Variable'; ctx.fillText(event.date, 500, 1010); ctx.fillText(event.venue, 500, 1060);
      ctx.font = '400 20px Manrope Variable'; ctx.fillText(`Folio: ${attendee.passId}`, 500, 1140);
      ctx.fillText(event.time, 500, 1100);
      ctx.fillText('Conserva este gafete para el día del evento.', 500, 1240);
      ctx.font = '400 20px Manrope Variable'; ctx.fillText(attendee.isTest ? 'Pase de prueba, sin validez para acceso a un evento.' : 'Presenta este QR al personal de acceso.', 500, 1340);
      const link = document.createElement('a'); link.download = `pase-los-didis-${attendee.passId.slice(0, 8)}.png`; link.href = canvas.toDataURL('image/png'); document.body.appendChild(link); link.click(); link.remove(); setDownloaded(true);
    } catch { setError('No pudimos descargar tu pase. Inténtalo de nuevo.'); }
  }
  return <div className="confirmation enter"><section><div className="success-icon"><Check size={24} weight="bold" /></div><p className="section-label">Registro guardado</p><h1>¡Nos vemos ahí,<br /><span>{attendee.firstName}!</span></h1><p className="confirmation-intro">Tu registro está guardado. Descarga tu gafete y presenta su QR al personal de acceso el día del evento.</p><EventDetails />{attendee.isTest && <p className="demo-notice">Este es un pase de prueba, sin validez para acceso a un evento.</p>}

    </section><section className="ticket" aria-label="Tu pase de acceso"><div className="ticket-heading"><Brand compact /><span>GAFETE VIRTUAL</span></div><div className="qr-wrap">{qr ? <img src={qr} width="210" height="210" alt="Código QR de tu pase personal" /> : <p role="status">Generando tu QR…</p>}</div><h2>{[attendee.firstName, attendee.lastName, attendee.secondLastName].filter(Boolean).join(' ')}</h2><div className="badge-event"><p>{event.date} · {event.time}</p><p>{event.venue}</p></div><div className="ticket-divider" /><div className="ticket-folio"><span>FOLIO DE REGISTRO</span><strong>{attendee.passId.slice(0, 8).toUpperCase()}</strong></div><button className="button button-primary" disabled={!qr} onClick={download}>Descargar mi gafete<DownloadSimple size={19} /></button>{downloaded && <p role="status" className="download-status">Tu gafete se ha descargado.</p>}{error && <p role="alert" className="form-message">{error}</p>}</section></div>;
}
function App() {
  const [route, setRoute] = useState(getRoute);
  const [attendee, setAttendee] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const mainRef = useRef(null);
  const initial = useRef(true);
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setRestoreError('');
    async function restore() {
      const { data, error } = supabase ? await supabase.auth.getSession() : { data: { session: null }, error: null };
      if (getRoute() === 'personal') return null;
      if (isEmailCallback) {
        clearAccess();
        if (error || !data.session) throw new Error('El enlace ya no es válido. Solicita uno nuevo con tu correo.');
        return getMyRegistration();
      }
      const access = savedAccess();
      if (access) return getRegistration(access.email, access.accessCode, { remember: false });
      return data.session ? getMyRegistration() : null;
    }
    restore().then(record => { if (active) setAttendee(record); })
      .catch(error => { if (active) setRestoreError(error.message); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [restoreAttempt]);
  useEffect(() => {
    const change = () => { setRoute(getRoute()); window.scrollTo({ top: 0, behavior: 'instant' }); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (route === 'confirmacion' && !attendee && !restoring && !restoreError) { navigate('acceso'); return; }
    document.title = `${{ inicio: 'Bienvenido', registro: 'Registro', acceso: 'Iniciar sesión', confirmacion: 'Tu gafete', personal: 'Control de acceso' }[route]} | ${event.name}`;
    if (!initial.current) mainRef.current?.focus({ preventScroll: true });
    initial.current = false;
  }, [route, attendee, restoring, restoreError]);
  const home = route === 'inicio';
  const authenticate = record => { setRestoreError(''); setAttendee(record); };
  const logout = async () => { clearAccess(); await supabase?.auth.signOut({ scope: 'local' }); setRestoreError(''); setRoute('inicio'); setAttendee(null); window.history.replaceState(null, '', window.location.pathname); navigate('inicio'); };
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); mainRef.current?.focus(); }}>Ir al contenido</a><div className={`stage ${home ? 'landing-stage' : 'inner-stage'} ${route === 'confirmacion' ? 'confirmation-stage' : ''}`}><header className="header"><Brand /><nav aria-label="Navegación principal">{home ? <a className="header-link" href="#evento" onClick={e => { e.preventDefault(); document.getElementById('evento')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>Acerca del evento<ArrowDownIcon /></a> : route === 'confirmacion' && attendee ? <button className="header-link" onClick={logout}>Cerrar sesión<SignOut size={17} /></button> : <a className="header-link" href="#"><ArrowLeft size={17} />Volver al inicio</a>}</nav></header><main id="main-content" tabIndex={-1} ref={mainRef} key={route}>{restoring ? <div className="session-status" role="status">Recuperando tu pase…</div> : route === 'confirmacion' && restoreError ? <section className="session-status"><h1>No pudimos recuperar tu pase</h1><p role="alert">{restoreError}</p><button className="button button-primary" onClick={() => setRestoreAttempt(value => value + 1)}>Reintentar</button><a href="#acceso">Solicitar enlace por correo</a></section> : home ? <Landing /> : route === 'personal' ? <StaffAccess /> : route === 'registro' ? <RegistrationForm onAuthenticated={authenticate} /> : route === 'acceso' ? <LoginForm /> : attendee ? <Confirmation attendee={attendee} /> : null}</main></div>{home && <Information />}<footer className="footer"><span>Los DiDis</span><p>Ideas. Personas. Nuevas posibilidades.</p><a className="footer-demo" href="#personal">Acceso del personal</a></footer></>;
}
function ArrowDownIcon() { return <ArrowRight size={15} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />; }

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
