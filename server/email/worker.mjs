import QRCode from 'qrcode';
import { createBadgePdf } from './badge.mjs';
import { registrationEmail } from './template.mjs';

export async function buildPayload(job) {
  const qr = await QRCode.toBuffer(`los-didis:v1:${job.slug}:${job.qrToken}`, {type:'png',width:464,margin:4,errorCorrectionLevel:'M',color:{dark:'#24160f',light:'#ffffff'}});
  const pdf = await createBadgePdf(job, qr);
  return {
    from:'Los DiDis <registro@losdidis2026.com>', to:[job.email],
    ...registrationEmail(job),
    attachments:[{filename:'qr-los-didis.png',content:qr.toString('base64'),content_type:'image/png',content_id:'entry-qr'},
      {filename:'gafete-los-didis.pdf',content:pdf.toString('base64'),content_type:'application/pdf'}],
  };
}

export function databaseRpc(env, fetcher = fetch) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  return async (name, body = {}) => {
    const response = await fetcher(`${url.replace(/\/$/,'')}/rest/v1/rpc/${name}`, {
      method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`DATABASE_${response.status}`);
    return response.json();
  };
}

export async function deliverOne({rpc,apiKey,fetcher=fetch}) {
  const job = await rpc('claim_registration_email');
  if (!job) return 'empty';
  // A crash after claim is recovered by the database lease, not by the browser.
  const payload = job.payload || await rpc('prepare_registration_email', {
    p_id:job.id,p_lease:job.lease,p_payload:await buildPayload(job),
  });
  let providerId=null, retry=true, error=null;
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`registration/${job.id}`},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(()=>null);
    if (response.ok && typeof result?.id === 'string') providerId=result.id;
    else {
      error=`RESEND_${response.status}`;
      // 409 can represent an in-flight identical request; bounded retries are safe.
      retry=response.ok || [408,409,429].includes(response.status) || response.status>=500;
    }
  } catch { error='RESEND_CONNECTION'; }
  const recorded = await rpc('finish_registration_email', {
    p_id:job.id,p_lease:job.lease,p_provider_id:providerId,p_retry:retry,p_error:error,
  });
  if (!recorded) throw new Error('LEASE_LOST');
  return providerId ? 'sent' : retry ? 'retry' : 'failed';
}
