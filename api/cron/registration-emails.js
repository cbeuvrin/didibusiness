import { timingSafeEqual } from 'node:crypto';
import { databaseRpc, deliverOne } from '../../server/email/worker.mjs';

export function authorized(header, secret) {
  if (!secret || secret.length < 32 || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected,actual);
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!authorized(req.headers.authorization,process.env.CRON_SECRET)) return res.status(401).json({error:'Unauthorized'});
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const env=process.env;
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !(env.SUPABASE_URL || env.VITE_SUPABASE_URL)) {
    return res.status(503).json({error:'Email service not configured'});
  }
  const rpc=databaseRpc(env), results={sent:0,retry:0,failed:0};
  const start=Date.now();
  try {
    // Sequential sends avoid bursts; small batches keep each invocation bounded.
    for(let n=0;n<5 && Date.now()-start<20000;n++) {
      const result=await deliverOne({rpc,apiKey:env.RESEND_API_KEY});
      if(result==='empty') break;
      results[result]++;
      if(result==='retry') break;
      await new Promise(resolve=>setTimeout(resolve,600));
    }
    return res.status(200).json(results);
  } catch {
    // Do not log recipients, QR tokens, credentials or provider response bodies.
    return res.status(503).json({error:'Email worker unavailable'});
  }
}
