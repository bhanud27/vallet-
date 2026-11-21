begin;
-- Check prerequisites before changing report tables.
do $$
declare missing text;
begin
 select string_agg(required.file_name, ', ' order by required.version) into missing
 from (values
  (12, to_regclass('public.content_reports') is not null and to_regclass('public.daily_usage') is not null
    and to_regprocedure('public.worthit_use_quota(text,bigint,bigint)') is not null, '0012_safety_and_accounts.sql'),
  (14, to_regclass('public.product_feedback') is not null and to_regprocedure('public.worthit_poll_page(uuid,timestamptz,uuid)') is not null, '0014_results_and_engagement.sql'),
  (15, to_regclass('public.media_jobs') is not null and to_regprocedure('public.worthit_claim_media()') is not null, '0015_media_jobs.sql')
 ) required(version,ready,file_name)
 where not required.ready;
 if missing is not null then
  raise exception 'Cannot apply 0016_operations.sql. Missing prerequisites: %',missing
   using errcode='55000',
   hint='Run supabase/check_migrations.sql, apply missing earlier migrations in numeric order, then rerun the entire 0016 file.';
 end if;
end $$;

alter table public.content_reports add column resolved_by uuid references auth.users(id) on delete set null;
alter table public.content_reports add column resolved_at timestamptz;
create function public.worthit_audit_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
 if new.status in ('removed','dismissed') then new.resolved_by=auth.uid();new.resolved_at=now();else new.resolved_by=null;new.resolved_at=null;end if;end if;return new;
end $$;
create trigger worthit_report_audit before update on public.content_reports for each row execute function public.worthit_audit_report();
create function public.worthit_operations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_worthit_moderator() then raise exception 'Moderator access required.' using errcode='42501';end if;
 return jsonb_build_object(
 'usage',coalesce((select jsonb_agg(to_jsonb(d)) from (select day,action,sum(amount) as amount from public.daily_usage where day>=current_date-30 group by day,action order by day desc,action limit 400) d),'[]'::jsonb),
 'media',coalesce((select jsonb_object_agg(state,total) from (select state,count(*) as total from public.media_jobs group by state) d),'{}'::jsonb),
 'deletionRequests',(select count(*) from public.account_deletion_requests),
 'feedback',coalesce((select jsonb_agg(to_jsonb(f)) from (select id,rating,message,created_at from public.product_feedback order by created_at desc limit 100) f),'[]'::jsonb));
end $$;
revoke all on function public.worthit_operations(),public.worthit_audit_report() from public,anon,authenticated;
grant execute on function public.worthit_operations() to authenticated;
create function public.worthit_product_key(p_url text) returns text language sql immutable set search_path='' as $$
 select split_part(split_part(p_url,'#',1),'?',1)||coalesce((select '?'||string_agg(param,'&' order by ord)
 from unnest(string_to_array(nullif(split_part(split_part(p_url,'#',1),'?',2),''),'&')) with ordinality v(param,ord)
 where lower(split_part(param,'=',1)) !~ '^(utm_.*|gclid|fbclid|msclkid)$'),'');
$$;
create or replace function public.list_product_history(p_url text, p_current uuid)
returns table (id uuid, item_name text, price_inr integer, created_at timestamptz,
  price_paid_inr integer, purchased_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.item_name, p.price_inr, p.created_at, u.price_paid_inr, u.purchased_at, u.status
  from public.polls p left join public.purchase_updates u on u.poll_id = p.id
  where (public.worthit_product_key(p.product_url) = public.worthit_product_key(p_url) or (p.product_url is null and public.worthit_product_key(u.store_url) = public.worthit_product_key(p_url)))
    and not p.is_demo and p.id is distinct from p_current
    and public.can_view_social_content(p.author_id)
  order by p.created_at desc, p.id desc limit 12;
$$;


create function public.worthit_reaction_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then perform public.worthit_use_quota('reactions',1,500);end if;return new;
end $$;
create trigger worthit_reel_reaction_quota before insert on public.social_reel_likes for each row execute function public.worthit_reaction_guard();
create trigger worthit_poll_reaction_quota before insert on public.poll_stars for each row execute function public.worthit_reaction_guard();
revoke all on function public.worthit_reaction_guard(),public.worthit_product_key(text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
