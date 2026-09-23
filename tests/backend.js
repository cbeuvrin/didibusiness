import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, rpcStatement } from './database/helpers.mjs';

export const test = base.extend({
  backend: [async ({ context }, use) => {
    const db = await createTestDatabase();
    let queue = Promise.resolve();
    const serial = action => { const next = queue.then(action); queue = next.catch(() => {}); return next; };
    const users = new Map();
    const tokens = new Map();
    const backend = {
      requests: [], sentEmails: [], lastPass: null,
      dropNextRegistrationResponse:false,dropNextScanResponse:false,failRecovery:false,missingMigration:false,smtpError:false,
      async setPrivacy(ready) { await serial(() => db.query('update public.events set privacy_notice_url=$1',[ready ? 'https://example.com/privacidad' : null])); },
      async magicLink(email, {staff=false,staffEvents=['los-didis-2026-guadalajara']}={}) {
        email=email.toLowerCase();
        let user=users.get(email);
        if(!user){
          user={id:randomUUID(),aud:'authenticated',role:'authenticated',email,email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]};
          await serial(() => db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[user.id,email,user.email_confirmed_at]));
          users.set(email,user);
        }
        if(staff) for (const slug of staffEvents) await serial(() => db.query("insert into public.event_staff(event_id,user_id,role) select id,$1,'scanner' from public.events where slug=$2 on conflict do nothing",[user.id,slug]));
        const exp=Math.floor(Date.now()/1000)+3600;
        const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,email,role:'authenticated',aud:'authenticated',exp})).toString('base64url')+'.testsignature';
        tokens.set(token,user);
        return `http://127.0.0.1:5174/?area=${staff?'personal':'pase'}#access_token=${token}&refresh_token=test-refresh&expires_in=3600&expires_at=${exp}&token_type=bearer&type=magiclink`;
      },
      async attachContext(target) {
        await target.route('https://*.supabase.co/**', async route => {
          const request=route.request(); const url=new URL(request.url());
          if(url.hostname !== 'registration-test.supabase.co') throw new Error('Test attempted to contact real Supabase');
          if(request.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type,authorization,x-client-info','access-control-allow-methods':'POST,GET'}});
          expect(request.headers().apikey).toBe('sb_publishable_test');
          const token=request.headers().authorization?.replace('Bearer ','');
          const user=tokens.get(token);
          if(url.pathname==='/auth/v1/otp'){
            if(backend.smtpError) return route.fulfill({status:400,json:{msg:'Email delivery unavailable'}});
            backend.sentEmails.push({email:request.postDataJSON().email,redirect:url.searchParams.get('redirect_to')});
            return route.fulfill({status:200,json:{}});
          }
          if(url.pathname==='/auth/v1/user') return route.fulfill({status:user?200:401,json:user || {msg:'Invalid token'}});
          if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204});
          if(!url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({status:404,json:{message:'Unexpected request'}});
          const name=url.pathname.split('/').at(-1); const body=request.postDataJSON();
          backend.requests.push({name,body});
          if(backend.missingMigration) return route.fulfill({status:404,json:{code:'PGRST202',message:'Function not found'}});
          if(['get_registration','get_my_registration','get_my_registrations'].includes(name) && backend.failRecovery) return route.abort('failed');
          try {
            const data=await serial(async()=>{
              await db.exec('begin');
              try{
                await db.exec(`set local role ${user?'authenticated':'anon'}`);
                await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user?.id || '']);
                const result=await db.query(...rpcStatement(name,body));
                await db.exec('commit'); return result.rows[0].value;
              }catch(error){await db.exec('rollback');throw error;}
            });
            if(name==='register_attendee_v2') {
              backend.lastPass=data;
              if(backend.dropNextRegistrationResponse){backend.dropNextRegistrationResponse=false;return route.abort('failed');}
            }
            if(name==='record_check_in' && backend.dropNextScanResponse){backend.dropNextScanResponse=false;return route.abort('failed');}
            await route.fulfill({status:200,json:data});
          }catch(error){await route.fulfill({status:400,json:{code:error.code,message:error.message}});}
        });
      },
    };
    await backend.attachContext(context);
    await use(backend);
    await queue;
    await db.close();
  },{auto:true}],
});
export {expect};
