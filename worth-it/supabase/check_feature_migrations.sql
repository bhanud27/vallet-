-- Read-only feature checkpoints. This query does not change schema or user data.
-- Object presence helps diagnose manual deployments; it is not migration history.
select migration,
       case when installed then 'Core objects found' else 'Missing or incomplete' end as checkpoint
from (values
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
) as checkpoints(migration,installed)
order by migration;