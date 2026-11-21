-- READ ONLY: run the whole file in the Worth It project's SQL Editor.
-- No user data is changed or returned. FAIL requires investigation; REVIEW is advisory.
-- Catalog checks do not prove complete migrations, RLS behavior, worker health or performance.
-- Update checkpoints/expected tables when adding migrations. Never run supabase/tests on live data.
begin read only;
with legacy(version,migration,ready) as (values

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

), features(migration,ready) as (values

 ('20261120215850_fashion_posts_and_interactions.sql',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='polls' and column_name='content_type')
  and exists(select 1 from pg_constraint where conrelid=to_regclass('public.polls') and conname='polls_content_details')
  and exists(select 1 from pg_trigger where tgrelid=to_regclass('public.votes') and tgname='worthit_poll_votes' and not tgisinternal)
  and exists(select 1 from pg_trigger where tgrelid=to_regclass('public.purchase_updates') and tgname='worthit_poll_updates' and not tgisinternal)
  and to_regprocedure('public.worthit_set_check_star(uuid,boolean)') is not null
  and to_regprocedure('public.worthit_connections(uuid,text,uuid)') is not null),
 ('20261121061446_product_link_details.sql',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='polls' and column_name='product_details')
  and to_regprocedure('public.worthit_product_details_valid(jsonb)') is not null),
 ('20261121070932_settings_privacy_and_activity.sql',
  to_regclass('public.account_preferences') is not null
  and to_regclass('public.account_mutes') is not null
  and to_regclass('public.saved_reels') is not null
  and to_regprocedure('public.worthit_settings(jsonb)') is not null
  and to_regprocedure('public.worthit_muted(uuid,boolean)') is not null
  and to_regprocedure('public.worthit_activity(text,timestamptz,text)') is not null),
 ('20261121072448_account_lifecycle_and_support.sql',
  to_regclass('public.account_deactivations') is not null
  and to_regprocedure('public.worthit_deactivate(boolean)') is not null
  and to_regprocedure('public.worthit_account_state()') is not null
  and to_regprocedure('public.worthit_require_session()') is not null
  and to_regprocedure('public.worthit_report_problem(uuid,text,text)') is not null
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_feedback' and column_name='screenshot_path')),
 ('20261121083604_creation_flow_and_comparison.sql',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='polls' and column_name='creation_spec')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='votes' and column_name='option_id')
  and to_regprocedure('public.worthit_creation_valid(jsonb)') is not null
  and to_regprocedure('public.worthit_creation_ready()') is not null
  and to_regprocedure('public.worthit_cast_option_vote(uuid,text,text,boolean)') is not null
  and to_regprocedure('public.worthit_option_results(uuid)') is not null)

), expected(name) as (values
('public.account_blocks'),
 ('public.account_deactivations'),
 ('public.account_deletion_requests'),
 ('public.account_mutes'),
 ('public.account_preferences'),
 ('public.app_announcements'),
 ('public.content_mentions'),
 ('public.content_reports'),
 ('public.daily_usage'),
 ('public.media_jobs'),
 ('public.media_pipeline_settings'),
 ('public.moderators'),
 ('public.notification_reads'),
 ('public.poll_stars'),
 ('public.polls'),
 ('public.post_media_cleanup'),
 ('public.post_retired_media'),
 ('public.post_tombstones'),
 ('public.product_feedback'),
 ('public.purchase_updates'),
 ('public.saved_polls'),
 ('public.saved_reels'),
 ('public.social_comments'),
 ('public.social_follows'),
 ('public.social_profiles'),
 ('public.social_reel_likes'),
 ('public.social_reels'),
 ('public.votes')
), app_tables as (
 select e.name,c.oid,c.relrowsecurity from expected e
 left join pg_class c on c.oid=to_regclass(e.name)
), protected_tables as (
 select * from app_tables union all
 select e.name,c.oid,c.relrowsecurity from (values ('storage.objects')) e(name)
 left join pg_class c on c.oid=to_regclass(e.name)
), definer_functions as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), worker_functions(signature) as (values
 ('public.worthit_claim_media()'),
 ('public.worthit_finish_media(uuid,boolean,text,text)'),
 ('public.worthit_object_referenced(text,text)'),
 ('public.worthit_claim_post_cleanup()'),
 ('public.worthit_finish_post_cleanup(text,text,uuid,boolean)')
), issues(check_name,object_name) as (
 select 'Required tables',name from app_tables where oid is null
 union all
 select 'Row level security',name from protected_tables where oid is null or not relrowsecurity
 union all
 select 'Restrictive session policies',t.name from protected_tables t where not exists(
  select 1 from pg_policy p where p.polrelid=t.oid and p.polname='worthit_session_gate'
  and not p.polpermissive and p.polcmd='*'
  and (select oid from pg_roles where rolname='authenticated')=any(p.polroles)
  and pg_get_expr(p.polqual,p.polrelid) like '%worthit_session_allowed()%'
  and pg_get_expr(p.polwithcheck,p.polrelid) like '%worthit_session_allowed()%')
 union all
 select 'Validated constraints',t.name||'.'||c.conname from app_tables t join pg_constraint c on c.conrelid=t.oid
 where c.contype in ('f','c') and not c.convalidated
 union all
 select 'Usable indexes',t.name||'.'||i.indexrelid::regclass::text from app_tables t join pg_index i on i.indrelid=t.oid
 where not i.indisvalid or not i.indisready
 union all
 select 'Protected writes',t.name||' ('||v.privilege||')'
 from app_tables t cross join (values ('INSERT'),('UPDATE'),('DELETE')) v(privilege)
 where (t.name='public.votes' or (t.name in ('public.polls','public.social_reels') and v.privilege<>'INSERT'))
 and has_table_privilege('authenticated',t.oid,v.privilege)
 union all
 select 'Protected profile flags','social_profiles.is_suspended' from pg_attribute a
 where a.attrelid=to_regclass('public.social_profiles') and a.attname='is_suspended' and not a.attisdropped
 and has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE')
 union all
 select 'RPC search paths',p.oid::regprocedure::text from definer_functions p
 where not exists(select 1 from unnest(p.proconfig) setting where setting like 'search_path=%')
 union all
 select 'RPC session guards',p.oid::regprocedure::text from definer_functions p
 where has_function_privilege('authenticated',p.oid,'EXECUTE')
 and p.proname not in ('worthit_session_allowed','worthit_account_state','worthit_deactivate')
 and p.prosrc not like '%worthit_require_session()%'
 union all
 select 'Worker RPC permissions',f.signature from worker_functions f
 where to_regprocedure(f.signature) is null
 or has_function_privilege('anon',to_regprocedure(f.signature),'EXECUTE')
 or has_function_privilege('authenticated',to_regprocedure(f.signature),'EXECUTE')
 or not has_function_privilege('service_role',to_regprocedure(f.signature),'EXECUTE')
 union all
 select 'Private media buckets',b.name from (values ('poll-photos'),('social-media')) b(name)
 where not exists(select 1 from storage.buckets s where s.id=b.name and not s.public)
 union all
 select 'Media upload limits',b.name from (values ('poll-photos',15728640),('social-media',20971520)) b(name,minimum)
 where not exists(select 1 from storage.buckets s where s.id=b.name and (s.file_size_limit is null or s.file_size_limit>=b.minimum))
 union all
 select 'Public schema creation',r.name from (values ('anon'),('authenticated')) r(name)
 where has_schema_privilege(r.name,'public','CREATE')
), checks(check_name,area,severity) as (values
 ('Required tables','Schema','FAIL'),
 ('Row level security','Security','FAIL'),
 ('Restrictive session policies','Security','FAIL'),
 ('Validated constraints','Integrity','REVIEW'),
 ('Usable indexes','Integrity','REVIEW'),
 ('Protected writes','Security','FAIL'),
 ('Protected profile flags','Security','FAIL'),
 ('RPC search paths','Security','FAIL'),
 ('RPC session guards','Security','FAIL'),
 ('Worker RPC permissions','Security','FAIL'),
 ('Private media buckets','Storage','FAIL'),
 ('Media upload limits','Storage','REVIEW'),
 ('Public schema creation','Security','REVIEW')
), results as (
 select 'Migrations' as area,migration as check_name,
 case when ready then 'PASS' else 'FAIL' end as status,
 case when ready then 'Selected schema markers exist; this is not migration history.' else 'Missing schema markers. Inspect the migration; do not blindly replay it.' end as details
 from (select migration,ready from legacy union all select migration,ready from features) m
 union all
 select c.area,c.check_name,case when count(i.object_name)=0 then 'PASS' else c.severity end,
 coalesce(string_agg(i.object_name,', ' order by i.object_name),'No issue detected by this catalog check.')
 from checks c left join issues i using(check_name) group by c.area,c.check_name,c.severity
 union all
 select 'Coverage','Live application and workers','INFO',
 'Test real authenticated users, private access, votes/stars/comments, uploads and background workers. Catalog checks do not verify these flows or query speed.'
)
select area,check_name,status,details from results
order by case status when 'FAIL' then 0 when 'REVIEW' then 1 when 'PASS' then 2 else 3 end,area,check_name;
commit;
