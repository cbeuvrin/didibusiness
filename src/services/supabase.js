import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
export const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const isEmailCallback = /(?:^#|&)access_token=|(?:^#|&)error=/.test(window.location.hash);
export const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true } })
  : null;

export async function sendSignInLink(email, area = 'pase') {
  if (!supabase) throw new Error('El acceso por correo todavía no está disponible.');
  const callback = new URL(window.location.pathname, window.location.origin);
  callback.searchParams.set('area', area === 'personal' ? 'personal' : 'pase');
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });
  if (error) {
    if (error.status === 429) throw new Error('Espera un minuto antes de solicitar otro enlace.');
    throw new Error('No pudimos enviar el enlace. Inténtalo más tarde.');
  }
}

export async function authenticatedRpc(name, parameters) {
  if (!supabase) throw new Error('El servicio todavía no está disponible.');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) {
    const messages = {
      STAFF_REQUIRED: 'Tu cuenta no tiene acceso al control de entradas.',
      ACCESS_CLOSED: 'El control de entradas aún no está abierto.',
      EMAIL_VERIFICATION_REQUIRED: 'Abre el enlace enviado a tu correo para iniciar sesión.',
      PASS_NOT_FOUND: 'No encontramos un gafete activo para tu correo. Completa tu registro para obtenerlo.',
      INVALID_SCAN: 'No pudimos validar esta lectura. Vuelve a escanear el QR.',
    };
    throw new Error(messages[error.message] || 'No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.');
  }
  return data;
}
