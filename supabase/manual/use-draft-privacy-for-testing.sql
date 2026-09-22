-- Optional: use the clearly identified provisional notice for event testing.
-- Run only after /privacidad.html is published. Does not open a real event.
update public.events
set privacy_notice_url='https://losdidis2026.com/privacidad.html',
    privacy_notice_version='borrador-2026-09-22'
where slug='los-didis-2026' and is_test=true
  and privacy_notice_url is null;
-- Replace URL/version with the client's approved document before production.
-- Existing consent records retain their original version; do not overwrite them.
