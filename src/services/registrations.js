import { event } from '../config';
import { authenticatedRpc } from './supabase';

const API_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SESSION_KEY = 'los-didis-access-v1';
const PENDING_KEY = 'los-didis-pending-v1';
const CODE_PATTERN = /^[a-f0-9]{32}$/;
const memory = new Map();
export const normalizeEmail = value => value.trim().toLowerCase();
export const normalizeAccessCode = value => value.replace(/\s/g, '').toLowerCase();

function read(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') || memory.get(key) || null; }
  catch { return memory.get(key) || null; }
}
function write(key, value) {
  memory.set(key, value);
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* The pass remains available in memory. */ }
}
function remove(key) {
  memory.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* In-memory access is still cleared. */ }
}
function createAccessCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function savedAccess() {
  const saved = read(SESSION_KEY);
  return saved?.eventSlug === event.slug && typeof saved.email === 'string' && CODE_PATTERN.test(saved.accessCode) ? saved : null;
}
export function clearAccess() { remove(SESSION_KEY); remove(PENDING_KEY); }

function apiError(data, status) {
  if (data?.message === 'REGISTRATION_EXISTS') return 'No pudimos crear otro registro con ese correo. Si ya tienes un pase, inicia sesión con tu correo para consultarlo.';
  if (data?.message === 'INVALID_ACCESS' || data?.message === 'PASS_UNAVAILABLE') return 'Tu sesión ya no está disponible. Inicia sesión con tu correo para consultar tu gafete.';
  if (data?.message === 'PRIVACY_NOT_CONFIGURED') return 'El registro estará disponible cuando se publique el aviso de privacidad.';
  if (data?.message === 'PRIVACY_REQUIRED') return 'Lee y acepta la versión vigente del aviso de privacidad antes de registrarte.';
  if (data?.message === 'INVALID_REGISTRATION') return 'Revisa tu nombre, apellidos y correo e inténtalo de nuevo.';
  if (data?.message === 'REGISTRATION_CLOSED') return 'El registro para este evento está cerrado.';
  if (data?.code === 'PGRST202' || data?.message === 'REGISTRATION_UNAVAILABLE') return 'El registro aún no está disponible. Inténtalo más tarde.';
  if (status === 429) return 'Has hecho varios intentos. Espera un momento antes de volver a intentarlo.';
  return 'No pudimos conectar con el registro. Inténtalo de nuevo en unos momentos.';
}
async function rpc(name, parameters, { attendee = true } = {}) {
  if (!API_URL || !API_KEY) throw new Error('El registro aún no está disponible. Inténtalo más tarde.');
  let response;
  try {
    response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('No pudimos conectar con el registro. Revisa tu conexión e inténtalo de nuevo.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiError(data, response.status));
  if (!attendee) return data;
  if (!data || typeof data.id !== 'string' || typeof data.passId !== 'string'
    || !['firstName', 'lastName', 'secondLastName', 'email'].every(key => typeof data[key] === 'string')
    || !/^[a-f0-9]{64}$/.test(data.qrToken) || typeof data.isTest !== 'boolean') {
    throw new Error('No pudimos recuperar tu pase. Inténtalo de nuevo.');
  }
  return data;
}

export async function getEventSettings() {
  const settings = await rpc('get_event_settings', { p_event_slug: event.slug }, { attendee: false });
  if (!settings) throw new Error('El registro aún no está disponible.');
  return settings;
}

export async function getMyRegistration() {
  return authenticatedRpc('get_my_registration', { p_event_slug: event.slug });
}

export async function registerAttendee(values, privacyVersion) {
  const email = normalizeEmail(values.email);
  let pending = read(PENDING_KEY);
  if (pending?.email !== email || pending?.eventSlug !== event.slug || !CODE_PATTERN.test(pending?.accessCode)) {
    pending = { email, eventSlug: event.slug, accessCode: createAccessCode() };
    write(PENDING_KEY, pending);
  }
  const attendee = await rpc('register_attendee_v2', {
    p_event_slug: event.slug,
    p_first_name: values.firstName.trim(),
    p_last_name: values.lastName.trim(),
    p_second_last_name: values.secondLastName.trim(),
    p_email: email,
    p_confirm_email: normalizeEmail(values.confirmEmail),
    p_phone: values.phone.trim(),
    p_state: values.state.trim(),
    p_extra_1: values.extra1.trim(),
    p_extra_2: values.extra2.trim(),
    p_privacy_accepted: values.privacyAccepted,
    p_privacy_version: privacyVersion,
    p_access_code: pending.accessCode,
  });
  write(SESSION_KEY, pending);
  remove(PENDING_KEY);
  return { ...attendee, accessCode: pending.accessCode };
}

export async function getRegistration(email, code, { remember = true } = {}) {
  const accessCode = normalizeAccessCode(code);
  if (!CODE_PATTERN.test(accessCode)) throw new Error('Escribe el código de consulta de 32 caracteres que guardaste con tu pase.');
  const normalizedEmail = normalizeEmail(email);
  const attendee = await rpc('get_registration', {
    p_event_slug: event.slug, p_email: normalizedEmail, p_access_code: accessCode,
  });
  if (remember) write(SESSION_KEY, { email: normalizedEmail, eventSlug: event.slug, accessCode });
  return { ...attendee, accessCode };
}
