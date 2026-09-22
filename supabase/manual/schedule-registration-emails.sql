-- Run after migration 003, server secrets, deployment and Vault setup.
-- Enable pg_cron and pg_net in Supabase Integrations first.
-- In Supabase Vault, create a secret named didis_email_cron_secret with the
-- exact same random value as CRON_SECRET in Vercel (at least 32 characters).
-- This avoids placing the secret in SQL source or cron.job.
begin;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='didis_email_cron_secret' and length(decrypted_secret)>=32) then
    raise exception 'Configure didis_email_cron_secret in Vault first';
  end if;
end;
$$;
select cron.schedule('didis-registration-emails','* * * * *', $job$
  select net.http_get(
    url := 'https://losdidis2026.com/api/cron/registration-emails',
    headers := jsonb_build_object('Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='didis_email_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
commit;
-- To stop: select cron.unschedule('didis-registration-emails');
