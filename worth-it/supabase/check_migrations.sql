-- READ ONLY: run in the connected project's Supabase SQL Editor.
-- These are schema checkpoints, not a migration-history ledger. Present means
-- the listed markers exist; apply complete migration files, not fragments.
select migration,case when ready then 'Present' else 'Missing' end as checkpoint
from (values
 (10,'0010_shopping_decisions.sql',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='polls' and column_name='category')
  and to_regprocedure('public.discover_shopping_polls(text,integer,integer,text,boolean)') is not null),
 (11,'0011_full_size_photos.sql',
  exists(select 1 from storage.buckets where id='poll-photos' and (file_size_limit is null or file_size_limit>=15728640))),
 (12,'0012_safety_and_accounts.sql',
  to_regclass('public.content_reports') is not null and to_regclass('public.daily_usage') is not null
  and to_regprocedure('public.worthit_use_quota(text,bigint,bigint)') is not null),
 (13,'0013_media_and_pagination.sql',
  to_regprocedure('public.worthit_discovery_unfiltered(text,integer,integer,text,boolean)') is not null
  and to_regprocedure('public.worthit_feed(timestamptz,uuid,integer)') is not null),
 (14,'0014_results_and_engagement.sql',
  to_regclass('public.product_feedback') is not null and to_regclass('public.saved_polls') is not null
  and to_regprocedure('public.worthit_poll_page(uuid,timestamptz,uuid)') is not null),
 (15,'0015_media_jobs.sql',
  to_regclass('public.media_jobs') is not null and to_regprocedure('public.worthit_claim_media()') is not null),
 (16,'0016_operations.sql',
  to_regprocedure('public.worthit_product_key(text)') is not null
  and to_regprocedure('public.worthit_operations()') is not null),
 (17,'0017_post_management.sql',
  to_regprocedure('public.worthit_manage_post(text,uuid,text,jsonb)') is not null
  and to_regclass('public.post_media_cleanup') is not null
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='polls' and column_name='archived_at'))
) required(version,migration,ready)
order by version;
