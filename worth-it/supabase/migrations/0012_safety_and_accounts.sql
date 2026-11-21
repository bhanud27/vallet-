begin;
alter table public.social_profiles add column is_suspended boolean not null default false;
create table public.account_blocks (
 blocker uuid references auth.users(id) on delete cascade, blocked uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(blocker,blocked), check(blocker <> blocked)
);
create index blocks_target on public.account_blocks(blocked,blocker);
create table public.moderators (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.content_reports (
 id uuid primary key default gen_random_uuid(), reporter uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('poll','reel','account')), target uuid not null,
 reason text not null check(char_length(btrim(reason)) between 5 and 500),
 status text not null default 'open' check(status in ('open','dismissed','removed')),
 created_at timestamptz not null default now(), unique(reporter,kind,target)
);
create index reports_open on public.content_reports(created_at) where status='open';
create table public.account_deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
create table public.daily_usage (
 user_id uuid references auth.users(id) on delete cascade, day date not null, action text not null,
 amount bigint not null, primary key(user_id,day,action)
);
alter table public.account_blocks enable row level security;
alter table public.moderators enable row level security;
alter table public.content_reports enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.daily_usage enable row level security;
revoke all on public.account_blocks,public.moderators,public.content_reports,public.account_deletion_requests,public.daily_usage from public,anon,authenticated;

create function public.worthit_use_quota(p_action text,p_amount bigint,p_limit bigint)
returns void language plpgsql security definer set search_path='' as $$
declare accepted bigint;
begin
 if auth.uid() is null then return; end if;
 if exists(select 1 from public.account_deletion_requests where user_id=auth.uid())
 or exists(select 1 from public.social_profiles where id=auth.uid() and is_suspended)
 then raise exception 'Account unavailable.' using errcode='42501'; end if;
 insert into public.daily_usage(user_id,day,action,amount) values(auth.uid(),current_date,p_action,p_amount)
 on conflict(user_id,day,action) do update set amount=public.daily_usage.amount+excluded.amount
 where public.daily_usage.amount+excluded.amount<=p_limit returning amount into accepted;
 if accepted is null or accepted>p_limit then raise exception 'Daily limit reached. Try again tomorrow.' using errcode='P0001'; end if;
end $$;
create function public.worthit_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new; end if;
 if tg_table_name='objects' then
   if tg_op='INSERT' then perform public.worthit_use_quota('uploads',1,200); end if;
   perform public.worthit_use_quota('upload_bytes',greatest(0,coalesce((new.metadata->>'size')::bigint,0)-
     case when tg_op='UPDATE' then coalesce((old.metadata->>'size')::bigint,0) else 0 end),104857600);
 elsif tg_table_name='polls' then perform public.worthit_use_quota('polls',1,30);
 elsif tg_table_name='social_reels' then perform public.worthit_use_quota('reels',1,15);
 elsif tg_table_name='votes' then perform public.worthit_use_quota('votes',1,300);
 elsif tg_table_name='social_comments' then perform public.worthit_use_quota('comments',1,100);
 end if;
 return new;
end $$;
create trigger worthit_poll_quota before insert on public.polls for each row execute function public.worthit_write_guard();
create trigger worthit_reel_quota before insert on public.social_reels for each row execute function public.worthit_write_guard();
create trigger worthit_vote_quota before insert on public.votes for each row execute function public.worthit_write_guard();
create trigger worthit_comment_quota before insert on public.social_comments for each row execute function public.worthit_write_guard();
create trigger worthit_upload_quota before insert or update on storage.objects for each row execute function public.worthit_write_guard();

create or replace function public.can_view_social_content(p_author uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_author is not null and (
 p_author=auth.uid() or (
 not exists(select 1 from public.account_blocks where (blocker=auth.uid() and blocked=p_author) or (blocked=auth.uid() and blocker=p_author))
 and not exists(select 1 from public.account_deletion_requests where user_id=p_author)
 and not exists(select 1 from public.social_profiles where id=p_author and is_suspended)
 and (not exists(select 1 from public.social_profiles where id=p_author and is_private)
 or exists(select 1 from public.social_follows where following_id=p_author and follower_id=auth.uid() and accepted))
 ));
$$;

create function public.set_account_block(p_id uuid,p_blocked boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_id=auth.uid() then raise exception 'Invalid account.' using errcode='42501'; end if;
 perform public.worthit_use_quota('blocks',1,100);
 if p_blocked then
 insert into public.account_blocks(blocker,blocked) values(auth.uid(),p_id) on conflict do nothing;
 delete from public.social_follows where (follower_id=auth.uid() and following_id=p_id) or (following_id=auth.uid() and follower_id=p_id);
 else delete from public.account_blocks where blocker=auth.uid() and blocked=p_id; end if;
end $$;
create function public.list_account_blocks() returns table(id uuid,username text)
language sql stable security definer set search_path='' as $$
 select b.blocked,coalesce(p.username,'Member') from public.account_blocks b left join public.social_profiles p on p.id=b.blocked
 where b.blocker=auth.uid() order by b.created_at desc limit 100;
$$;
create function public.report_content(p_kind text,p_target uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report.' using errcode='42501'; end if;
 perform public.worthit_use_quota('reports',1,20);
 if not (
 (p_kind='poll' and exists(select 1 from public.polls where id=p_target and public.can_view_social_content(author_id)))
 or (p_kind='reel' and exists(select 1 from public.social_reels where id=p_target and public.can_view_social_content(author_id)))
 or (p_kind='account' and exists(select 1 from public.social_profiles where id=p_target))
 ) then raise exception 'Content unavailable.' using errcode='P0002'; end if;
 insert into public.content_reports(reporter,kind,target,reason) values(auth.uid(),p_kind,p_target,btrim(p_reason))
 on conflict(reporter,kind,target) do update set reason=excluded.reason,status='open';
end $$;
create function public.is_worthit_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moderators where user_id=auth.uid());
$$;
create function public.list_content_reports() returns setof public.content_reports language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_worthit_moderator() then raise exception 'Moderator access required.' using errcode='42501'; end if;
 return query select * from public.content_reports where status='open' order by created_at limit 100;
end $$;
create function public.resolve_content_report(p_id uuid,p_remove boolean) returns void language plpgsql security definer set search_path='' as $$
declare report public.content_reports;
begin
 if not public.is_worthit_moderator() then raise exception 'Moderator access required.' using errcode='42501'; end if;
 select * into report from public.content_reports where id=p_id for update;
 if report.id is null then raise exception 'Report not found.'; end if;
 if p_remove then
 if report.kind='poll' then delete from public.polls where id=report.target;
 elsif report.kind='reel' then delete from public.social_reels where id=report.target;
 else update public.social_profiles set is_suspended=true where id=report.target; end if;
 end if;
 update public.content_reports set status=case when p_remove then 'removed' else 'dismissed' end where id=p_id;
end $$;
create function public.request_account_deletion() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 insert into public.account_deletion_requests(user_id) values(auth.uid()) on conflict do nothing;
 update public.social_profiles set is_private=true where id=auth.uid();
end $$;
revoke all on function public.worthit_use_quota(text,bigint,bigint),public.worthit_write_guard(),
 public.set_account_block(uuid,boolean),public.list_account_blocks(),public.report_content(text,uuid,text),
 public.is_worthit_moderator(),public.list_content_reports(),public.resolve_content_report(uuid,boolean),
 public.request_account_deletion() from public,anon,authenticated;
grant execute on function public.set_account_block(uuid,boolean),public.list_account_blocks(),public.report_content(text,uuid,text),
 public.is_worthit_moderator(),public.list_content_reports(),public.resolve_content_report(uuid,boolean),
 public.request_account_deletion() to authenticated;
-- Table-wide UPDATE grants would let a suspended member clear this flag.
revoke update on public.social_profiles from authenticated;
grant update(display_name,bio,avatar_path,username,is_private) on public.social_profiles to authenticated;
notify pgrst,'reload schema';
commit;
