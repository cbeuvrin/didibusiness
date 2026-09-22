import { loadEnv } from 'vite';

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.');
  process.exit(1);
}
try {
  const options = { headers: { apikey:key, 'Content-Type':'application/json' }, signal:AbortSignal.timeout(15000) };
  const health = await fetch(`${url}/auth/v1/settings`, options);
  if (!health.ok) throw new Error(`El proyecto no aceptó la conexión (HTTP ${health.status}).`);
  console.log('Conexión con Supabase: correcta.');
  // Public event configuration only: no registrations, email requests or personal data.
  const response = await fetch(`${url}/rest/v1/rpc/get_event_settings`, {
    ...options, method:'POST', signal:AbortSignal.timeout(15000),
    body:JSON.stringify({p_event_slug:'los-didis-2026'}),
  });
  const result = await response.json();
  if (response.ok && result?.name) {
    console.log('API de configuración del evento: instalada (migración 002).');
    console.log(`Aviso de privacidad: ${result.privacyUrl && result.privacyVersion ? 'configurado' : 'pendiente; registro bloqueado hasta configurarlo'}.`);
    console.log(`Modo: ${result.isTest ? 'prueba' : 'evento real'}.`);
    console.log('El SMTP y los permisos del personal requieren comprobación administrativa.');
  } else if (result?.code === 'PGRST202') {
    console.log('Pendiente: ejecutar supabase/migrations/202609220002_event_requirements.sql después de la migración 001 en el SQL Editor.');
    process.exitCode = 2;
  } else {
    throw new Error(`No se pudo verificar la API (HTTP ${response.status}, código ${result?.code || 'desconocido'}).`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
