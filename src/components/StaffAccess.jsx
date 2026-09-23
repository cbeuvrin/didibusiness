import { useEffect, useRef, useState } from 'react';
import { Camera, Check, WarningCircle, SignOut } from '@phosphor-icons/react';
import { supabase, authenticatedRpc } from '../services/supabase';
import EmailSignIn from './EmailSignIn';

const resultLabels = { accepted: 'Entrada registrada', duplicate: 'Este gafete ya ingresó', invalid: 'QR no válido para este evento', revoked: 'Gafete cancelado' };
const formatTime = value => value ? new Intl.DateTimeFormat('es-MX', {dateStyle:'medium',timeStyle:'medium',timeZone:'America/Mexico_City'}).format(new Date(value)) : '—';

export default function StaffAccess() {
  const [events, setEvents] = useState([]);
  const [eventSlug, setEventSlug] = useState('');
  const [session, setSession] = useState(undefined);
  const [access, setAccess] = useState(null);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [camera, setCamera] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const [manual, setManual] = useState('');
  const [folio, setFolio] = useState('');
  const [foundPass, setFoundPass] = useState(null);
  const [log, setLog] = useState(null);
  const [logError, setLogError] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const video = useRef(null);
  const controls = useRef(null);
  const active = useRef(true);
  const scanLock = useRef(false);
  const cameraGeneration = useRef(0);

  function stopCamera() {
    cameraGeneration.current += 1;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    stream?.getTracks?.().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
    setCamera(false);
    setStarting(false);
  }
  useEffect(() => {
    active.current = true;
    const update = () => { setOnline(navigator.onLine); if (!navigator.onLine) stopCamera(); };
    const hidden = () => { if (document.hidden) stopCamera(); };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    document.addEventListener('visibilitychange', hidden);
    return () => { active.current = false; stopCamera(); window.removeEventListener('online', update); window.removeEventListener('offline', update); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    let live = true;
    async function load() {
      const {data, error} = supabase ? await supabase.auth.getSession() : {data:{session:null},error:null};
      if (!live) return;
      setSession(data.session);
      if (error) throw new Error('El enlace ya no es válido. Solicita uno nuevo.');
      if (data.session) {
        const choices = await authenticatedRpc('get_staff_events', {});
        if (live) {
          setEvents(choices);
          if (choices.length) setEventSlug(choices[0].slug);
          else setMessage('Tu cuenta no tiene acceso al control de entradas.');
        }
      }
    }
    load().catch(error => { if (live) setMessage(error.message); });
    const subscription = supabase?.auth.onAuthStateChange((type) => {
      if (type === 'SIGNED_OUT' && live) { stopCamera(); setAccess(null); setSession(null); }
    }).data.subscription;
    return () => { live = false; subscription?.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!eventSlug || !session) return;
    let live = true;
    authenticatedRpc('get_staff_access', {p_event_slug:eventSlug})
      .then(value => { if (live) setAccess(value); })
      .catch(error => { if (live) setMessage(error.message); });
    return () => { live = false; };
  }, [eventSlug, session]);
  function chooseEvent(slug) {
    stopCamera(); setAccess(null); setLog(null); setOffset(0); setMessage('');
    setResult(null); setFoundPass(null); setManual(''); setFolio(''); setEventSlug(slug);
  }
  useEffect(() => {
    if (!access || !online) return;
    let live = true;
    setLogError('');
    authenticatedRpc('get_attendance_log', {p_event_slug:eventSlug,p_offset:offset})
      .then(value => { if (live) setLog(value); })
      .catch(error => { if (live) setLogError(error.message); });
    return () => { live = false; };
  }, [access, eventSlug, offset, refresh, online]);

  async function submitScan(raw, retry = null) {
    if (scanLock.current) return;
    if (!navigator.onLine) { setMessage('Sin conexión. No se ha confirmado ninguna entrada.'); return; }
    scanLock.current = true;
    stopCamera();
    setBusy(true);
    setMessage('');
    setResult(null);
    let request = retry;
    if (!request) {
      const prefix = `los-didis:v1:${eventSlug}:`;
      const content = raw.trim();
      if (!content.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(content.slice(prefix.length))) {
        setMessage('Este QR no corresponde al evento seleccionado. Revisa la ciudad del gafete.');
        setBusy(false); scanLock.current = false; return;
      }
      request = {token:content.slice(prefix.length),id:crypto.randomUUID()};
    }
    setPending(request);
    try {
      const value = await authenticatedRpc('record_check_in', {p_event_slug:eventSlug,p_qr_token:request.token,p_request_id:request.id});
      if (!active.current) return;
      setResult(value);
      setPending(null);
      setManual(''); setFoundPass(null); setFolio('');
      setOffset(0);
      setRefresh(value => value + 1);
    } catch (error) {
      if (active.current) setMessage(`${error.message} La entrada no está confirmada en esta pantalla; reintenta la misma lectura para comprobar su resultado.`);
    } finally { scanLock.current = false; if (active.current) setBusy(false); }
  }
  async function findFolio() {
    if (scanLock.current || pending || !navigator.onLine) return;
    stopCamera(); scanLock.current = true; setBusy(true); setMessage(''); setResult(null); setFoundPass(null);
    try {
      const value = await authenticatedRpc('lookup_pass_by_folio', {p_event_slug:eventSlug,p_folio:folio.trim()});
      if (active.current) setFoundPass(value);
    } catch (error) { if (active.current) setMessage(error.message); }
    finally { scanLock.current = false; if (active.current) setBusy(false); }
  }
  async function startCamera() {
    if (!navigator.onLine) { setMessage('Necesitas conexión a internet para validar entradas.'); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setMessage('La cámara requiere una conexión HTTPS y un navegador con acceso a cámara.'); return; }
    setMessage(''); setResult(null); setFoundPass(null); setStarting(true);
    const generation = ++cameraGeneration.current;
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (!active.current || generation !== cameraGeneration.current) return;
      const reader = new BrowserQRCodeReader();
      const current = await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false}, video.current, (decoded, error, running) => {
        if (decoded && active.current && generation === cameraGeneration.current && !scanLock.current) {
          running.stop();
          submitScan(decoded.getText());
        }
      });
      if (!active.current || generation !== cameraGeneration.current) { current.stop(); return; }
      controls.current = current;
      setCamera(true);
    } catch { if (active.current && generation === cameraGeneration.current) setMessage('No pudimos abrir la cámara. Revisa el permiso del navegador y que ninguna otra aplicación la esté usando.'); }
    finally { if (active.current && generation === cameraGeneration.current) setStarting(false); }
  }
  async function logout() {
    stopCamera();
    await supabase?.auth.signOut({scope:'local'});
    setSession(null); setAccess(null); setMessage('');
  }

  if (session === undefined) return <div className="session-status" role="status">Comprobando acceso del personal…</div>;
  if (!session) return <div className="staff-signin"><EmailSignIn staff />{message && <p className="form-message" role="alert">{message}</p>}</div>;
  if (!access) return <section className="session-status"><h1>Acceso del personal</h1><p role="status">{message || 'Comprobando permisos…'}</p><button className="button button-primary" onClick={logout}>Usar otra cuenta</button></section>;
  return <section className="staff-layout" aria-labelledby="staff-title">
    <div className="staff-heading"><div><p className="section-label">Los DiDis · Personal autorizado</p><h1 id="staff-title">Control de acceso</h1><p>Horario de Ciudad de México · Requiere internet{access.isTest ? ' · Modo de prueba' : ''}</p></div><button className="button button-outline" onClick={logout}>Cerrar sesión<SignOut size={18} /></button></div>
    <div className="field staff-event"><label htmlFor="staff-event">Evento a controlar</label><select id="staff-event" value={eventSlug} onChange={e => chooseEvent(e.target.value)} disabled={busy || starting || Boolean(pending)}>{events.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div>
    {!online && <p className="form-message" role="alert">Sin conexión. Las entradas no se pueden confirmar hasta recuperar internet.</p>}
    {!access.accessOpen && <p className="form-message" role="status">El control de entradas aún no está abierto para este evento.</p>}
    <div className="staff-grid"><section className="scanner-panel" aria-label="Lector de gafetes">
      <h2>Escanear gafete</h2><p>Apunta la cámara al QR. Comprueba el resultado antes de permitir el ingreso.</p>
      <div className="camera-preview"><video ref={video} muted playsInline aria-label="Vista de la cámara" />{!camera && !starting && <span><Camera size={34} />Cámara detenida</span>}</div>
      <div className="scanner-actions"><button className="button button-primary" disabled={busy || starting || !online || !access.accessOpen || Boolean(pending)} onClick={camera ? stopCamera : startCamera}>{starting ? 'Abriendo cámara…' : camera ? 'Detener cámara' : 'Activar cámara'}</button>{starting && <button className="button button-outline" onClick={stopCamera}>Cancelar</button>}</div>
      <form className="manual-scan" onSubmit={e => { e.preventDefault(); submitScan(manual); }}><label htmlFor="manual-qr">Contenido del QR (lector externo)</label><input id="manual-qr" value={manual} onChange={e => setManual(e.target.value)} autoComplete="off" placeholder="Pega o escanea el contenido del QR" maxLength={160} required disabled={busy || Boolean(pending)} /><button className="button button-outline" disabled={busy || !online || !access.accessOpen || Boolean(pending)} type="submit">Validar QR</button></form>
      <form className="manual-scan" onSubmit={e => {e.preventDefault(); findFolio();}}>
        <label htmlFor="manual-folio">Entrada manual por folio</label>
        <input id="manual-folio" value={folio} onChange={e => {setFolio(e.target.value); setFoundPass(null);}} placeholder="Folio de 8 caracteres o identificador completo" maxLength={36} autoComplete="off" required disabled={busy || Boolean(pending)} />
        <button className="button button-outline" type="submit" disabled={busy || !online || !access.accessOpen || Boolean(pending)}>Buscar folio</button>
      </form>
      {foundPass && <div className="scan-result" role="status"><h3>Verifica el nombre antes de confirmar</h3><p>{foundPass.name}</p><p>Folio: {foundPass.passId.slice(0,8).toUpperCase()}</p>
        {foundPass.status !== 'active' ? <p>Gafete cancelado. No permite el ingreso.</p> : <>
          {foundPass.checkedInAt && <p>Este gafete ya ingresó: {formatTime(foundPass.checkedInAt)}</p>}
          <button className="button button-primary" disabled={busy || !online || Boolean(pending) || !access.accessOpen} onClick={() => submitScan(`los-didis:v1:${eventSlug}:${foundPass.qrToken}`)}>Confirmar ingreso por folio</button>
        </>}
      </div>}
      {busy && <p role="status">Validando con el servidor…</p>}
      {message && <p className="form-message" role="alert">{message}</p>}
      {pending && !busy && <button className="button button-primary" disabled={!online} onClick={() => submitScan('',pending)}>Reintentar esta lectura</button>}
      {result && <div className={`scan-result scan-result-${result.result}`} role="status">{result.result === 'accepted' ? <Check size={30} /> : <WarningCircle size={30} />}<h3>{resultLabels[result.result]}</h3>{result.name && <p>{result.name}</p>}<p>{result.checkedInAt ? `Ingreso: ${formatTime(result.checkedInAt)}` : `Lectura: ${formatTime(result.scannedAt)}`}</p>{result.isTest && <small>Lectura en modo de prueba</small>}</div>}
    </section><section className="attendance-panel" aria-labelledby="attendance-title">
      <div className="attendance-heading"><h2 id="attendance-title">Bitácora de ingresos</h2><button className="access-copy" disabled={!online} onClick={() => setRefresh(value => value + 1)}>Actualizar</button></div>
      {log && <dl className="attendance-totals"><div><dt>Registrados</dt><dd>{log.registered}</dd></div><div><dt>Ingresaron</dt><dd>{log.attended}</dd></div><div><dt>Lecturas</dt><dd>{log.scans}</dd></div></dl>}
      {logError && <p className="form-message" role="alert">{logError}</p>}
      {!log && !logError && <p role="status">Cargando bitácora…</p>}
      {log?.entries.length === 0 && <p className="empty-log">Todavía no hay lecturas en esta página.</p>}
      {Boolean(log?.entries.length) && <div className="attendance-table"><table><thead><tr><th>Persona</th><th>Resultado</th><th>Hora de lectura</th></tr></thead><tbody>{log.entries.map(row => <tr key={row.id}><td>{row.name || 'QR desconocido'}</td><td>{resultLabels[row.result]}</td><td>{formatTime(row.scannedAt)}</td></tr>)}</tbody></table></div>}
      {log && <div className="log-pagination"><button className="access-copy" disabled={offset === 0 || !online} onClick={() => setOffset(value => Math.max(0,value-50))}>Anterior</button><span>Página {offset/50+1}</span><button className="access-copy" disabled={offset+50 >= log.scans || !online} onClick={() => setOffset(value => value+50)}>Siguiente</button></div>}
    </section></div>
  </section>;
}
