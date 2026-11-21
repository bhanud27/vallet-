begin;
create table public.account_deactivations(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
alter table public.account_deactivations enable row level security;
revoke all on public.account_deactivations from public,anon,authenticated;
grant all on public.account_deactivations to service_role;
create function public.worthit_session_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is null or (not exists(select 1 from public.account_deactivations where user_id=auth.uid()) and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')));
$$;
create function public.worthit_require_session() returns void language plpgsql stable security definer set search_path='' as $$begin
 if not public.worthit_session_allowed() then raise exception 'Verify your authenticator or reactivate your account.' using errcode='42501';end if;
end $$;
create function public.worthit_recent_auth() returns void language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'Authenticator verification required.' using errcode='42501';end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return;end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method where method->>'method' in ('password','otp','totp','oauth') and (method->>'timestamp')::numeric between extract(epoch from now())-300 and extract(epoch from now())+30) then raise exception 'Please verify your password again.' using errcode='42501';end if;
end $$;
create function public.worthit_account_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('available',true,'deactivated',exists(select 1 from public.account_deactivations where user_id=auth.uid()),'deletion_pending',exists(select 1 from public.account_deletion_requests where user_id=auth.uid()),'mfa_enforced',true) where auth.uid() is not null;
$$;
create function public.worthit_deactivate(p_deactivate boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.worthit_recent_auth();
 if p_deactivate is null then raise exception 'Choose an account action.' using errcode='22023';end if;
 if exists(select 1 from public.account_deletion_requests where user_id=auth.uid()) or exists(select 1 from public.social_profiles where id=auth.uid() and is_suspended) then raise exception 'Account unavailable.' using errcode='42501';end if;
 if p_deactivate then insert into public.account_deactivations(user_id) values(auth.uid()) on conflict do nothing;else delete from public.account_deactivations where user_id=auth.uid();end if;
end $$;
create or replace function public.request_account_deletion() returns void language plpgsql security definer set search_path='' as $$begin
 perform public.worthit_recent_auth();
 insert into public.account_deletion_requests(user_id) values(auth.uid()) on conflict do nothing;
end $$;
create or replace function public.can_view_social_content(p_author uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_author is not null and (
 p_author=auth.uid() or (
 not exists(select 1 from public.account_deactivations where user_id=p_author) and 
 not exists(select 1 from public.account_blocks where (blocker=auth.uid() and blocked=p_author) or (blocked=auth.uid() and blocker=p_author))
 and not exists(select 1 from public.account_deletion_requests where user_id=p_author)
 and not exists(select 1 from public.social_profiles where id=p_author and is_suspended)
 and (not exists(select 1 from public.social_profiles where id=p_author and is_private)
 or exists(select 1 from public.social_follows where following_id=p_author and follower_id=auth.uid() and accepted))
 ));
$$;
create or replace function public.search_social_profiles(p_query text)
returns table (id uuid, username text, avatar_path text, is_private boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar_path, p.is_private
  from public.social_profiles p
  where auth.uid() is not null and length(p_query) between 1 and 40
    and starts_with(p.username, lower(p_query))
  and not exists(select 1 from public.account_deactivations where user_id=p.id)
  order by (p.username = lower(p_query)) desc, p.username limit 30;
$$;
create or replace function public.social_profile_card(p_id uuid)
returns table (id uuid, username text, bio text, avatar_path text, is_private boolean, can_view boolean,
  followers bigint, following bigint, relationship text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, case when public.can_view_social_content(p.id) then p.bio else '' end,
    p.avatar_path, p.is_private, public.can_view_social_content(p.id),
    (select count(*) from public.social_follows f where f.following_id = p.id and f.accepted),
    (select count(*) from public.social_follows f where f.follower_id = p.id and f.accepted),
    case when f.accepted then 'following' when f.accepted = false then 'requested' else 'none' end
  from public.social_profiles p
  left join public.social_follows f on f.following_id = p.id and f.follower_id = auth.uid()
  where not exists(select 1 from public.account_deactivations where user_id=p.id) and auth.uid() is not null and p.id = p_id and (p.username is not null or p.id = auth.uid());
$$;
create or replace function public.worthit_connections(p_id uuid,p_kind text,p_after uuid default null)
returns table(id uuid,username text,avatar_path text,is_private boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_kind not in ('followers','following') or p_kind is null then raise exception 'Invalid connection list.' using errcode='22023';end if;
 if not public.can_view_social_content(p_id) then raise exception 'This profile is private or unavailable.' using errcode='42501';end if;
 return query select a.id,a.username,a.avatar_path,a.is_private from public.social_follows f join public.social_profiles a
 on a.id=case when p_kind='followers' then f.follower_id else f.following_id end
 where f.accepted and (case when p_kind='followers' then f.following_id else f.follower_id end)=p_id
 and (p_after is null or a.id>p_after) and not a.is_suspended and not exists(select 1 from public.account_deactivations where user_id=a.id)
 and not exists(select 1 from public.account_deletion_requests where user_id=a.id)
 and not exists(select 1 from public.account_blocks where (blocker=auth.uid() and blocked=a.id) or (blocked=auth.uid() and blocker=a.id))
 order by a.id limit 50;
end $$;
alter table public.product_feedback add column screenshot_path text check(screenshot_path is null or length(screenshot_path)<=300);
create function public.worthit_report_problem(p_id uuid,p_message text,p_screenshot text default null) returns uuid language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_id is null or p_message is null or length(btrim(p_message)) not between 5 and 900 then raise exception 'Describe the issue in 5 to 900 characters.' using errcode='22023';end if;
 if p_screenshot is not null and (p_screenshot<>auth.uid()::text||'/support/'||p_id::text||'.jpg' or not exists(select 1 from storage.objects where bucket_id='poll-photos' and name=p_screenshot)) then raise exception 'Invalid support screenshot.' using errcode='22023';end if;
 if exists(select 1 from public.product_feedback where id=p_id and user_id=auth.uid() and message='Problem report: '||btrim(p_message) and screenshot_path is not distinct from p_screenshot) then return p_id;end if;
 perform public.worthit_use_quota('feedback',1,5);
 insert into public.product_feedback(id,user_id,rating,message,screenshot_path) values(p_id,auth.uid(),3,'Problem report: '||btrim(p_message),p_screenshot);
 return p_id;
end $$;
create or replace function public.can_read_social_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select (p_bucket='poll-photos' and exists(select 1 from public.product_feedback where screenshot_path=p_name and (user_id=auth.uid() or public.is_worthit_moderator()))) or (
 public.worthit_original_object_access(p_bucket,p_name)
 and not exists(select 1 from public.polls p where p.media_state<>'ready' and (p.image_path=p_name or exists(select 1 from jsonb_array_elements(p.media_gallery) m where m->>'value'=p_name or m->>'thumbnail'=p_name)))
 and not exists(select 1 from public.media_jobs j left join public.polls p on p.id=j.poll_id left join public.social_reels r on r.id=j.reel_id
 where j.bucket=p_bucket and j.source_path=p_name and coalesce(p.media_state,r.media_state,'failed')<>'ready')
 ) or exists(select 1 from public.media_jobs j left join public.polls p on p.id=j.poll_id left join public.social_reels r on r.id=j.reel_id
 where j.bucket=p_bucket and j.state='ready' and (j.preview_path=p_name or j.playback_path=p_name)
 and coalesce(p.media_state,r.media_state,'failed')='ready' and public.worthit_post_access(j.owner_id,coalesce(p.archived_at,r.archived_at)));
$$;
create or replace function public.worthit_object_referenced(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.product_feedback where p_bucket='poll-photos' and screenshot_path=p_path) or exists(select 1 from public.polls p where (p_bucket='poll-photos' and p.image_path=p_path) or exists(select 1 from jsonb_array_elements(p.media_gallery) m where m->>'value'=p_path or m->>'thumbnail'=p_path))
 or exists(select 1 from public.social_reels where p_bucket='social-media' and video_path=p_path)
 or exists(select 1 from public.social_profiles where p_bucket='social-media' and avatar_path=p_path)
 or exists(select 1 from public.media_jobs where bucket=p_bucket and (source_path=p_path or preview_path=p_path or playback_path=p_path));
$$;
revoke all on function public.worthit_session_allowed(),public.worthit_require_session(),public.worthit_recent_auth(),public.worthit_account_state(),public.worthit_deactivate(boolean),public.worthit_report_problem(uuid,text,text) from public,anon,authenticated;
grant execute on function public.worthit_session_allowed(),public.worthit_account_state(),public.worthit_deactivate(boolean),public.worthit_report_problem(uuid,text,text) to authenticated;
create or replace function public.worthit_operations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_worthit_moderator() then raise exception 'Moderator access required.' using errcode='42501';end if;
 return jsonb_build_object(
 'usage',coalesce((select jsonb_agg(to_jsonb(d)) from (select day,action,sum(amount) as amount from public.daily_usage where day>=current_date-30 group by day,action order by day desc,action limit 400) d),'[]'::jsonb),
 'media',coalesce((select jsonb_object_agg(state,total) from (select state,count(*) as total from public.media_jobs group by state) d),'{}'::jsonb),
 'deletionRequests',(select count(*) from public.account_deletion_requests),
 'feedback',coalesce((select jsonb_agg(to_jsonb(f)) from (select id,rating,message,created_at,screenshot_path from public.product_feedback order by created_at desc limit 100) f),'[]'::jsonb));
end $$;
create or replace function public.list_social_notifications()
returns table(id text,kind text,target_id uuid,username text,detail text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 with activity as (
 select 'comment:'||c.id id,case when p.content_type='poll' then 'poll_comment' else 'post_comment' end kind,p.id target_id,c.author_id actor,p.item_name detail,c.created_at,case when p.content_type='poll' then 'poll_comments' else 'content_comments' end preference from public.social_comments c join public.polls p on p.id=c.poll_id where p.author_id=auth.uid() and c.author_id<>auth.uid() and p.archived_at is null and not public.worthit_filtered(p.author_id,c.body)
 union all select 'comment:'||c.id,'reel_comment',r.id,c.author_id,r.caption,c.created_at,'content_comments' from public.social_comments c join public.social_reels r on r.id=c.reel_id where r.author_id=auth.uid() and c.author_id<>auth.uid() and r.archived_at is null and not public.worthit_filtered(r.author_id,c.body)
 union all select 'follow:'||f.follower_id,case when f.accepted then 'follow' else 'follow_request' end,f.follower_id,f.follower_id,'',f.created_at,case when f.accepted then 'new_followers' else 'follow_requests' end from public.social_follows f where f.following_id=auth.uid()
 union all select 'vote:'||v.id,'poll_vote',p.id,v.voter_id,p.item_name,v.created_at,'new_votes' from public.votes v join public.polls p on p.id=v.poll_id where p.author_id=auth.uid() and v.voter_id<>auth.uid() and p.archived_at is null
 union all select 'star-poll:'||s.poll_id||':'||s.viewer_id,case when p.content_type='poll' then 'poll_star' else 'post_star' end,p.id,s.viewer_id,p.item_name,s.created_at,case when p.content_type='poll' then 'poll_stars' else 'content_stars' end from public.poll_stars s join public.polls p on p.id=s.poll_id where p.author_id=auth.uid() and s.viewer_id<>auth.uid() and p.archived_at is null
 union all select 'star-reel:'||s.reel_id||':'||s.viewer_id,'reel_star',r.id,s.viewer_id,r.caption,s.created_at,'content_stars' from public.social_reel_likes s join public.social_reels r on r.id=s.reel_id where r.author_id=auth.uid() and s.viewer_id<>auth.uid() and r.archived_at is null
 union all select 'decision:'||p.id,'purchase_update',p.id,p.author_id,p.item_name||' - '||case when u.status='returned' then 'Returned' when u.status='passed' then 'Passed' when u.would_buy_again is not null then 'After-buy verdict' else 'Bought' end,u.updated_at,'poll_results' from public.votes v join public.purchase_updates u on u.poll_id=v.poll_id join public.polls p on p.id=u.poll_id where v.voter_id=auth.uid() and public.worthit_post_access(p.author_id,p.archived_at) and not p.is_demo and u.updated_at>=v.created_at
 union all select 'reminder:'||p.id,'after_buy_reminder',p.id,null,p.item_name,u.purchased_at+interval '7 days','relevant_activity' from public.purchase_updates u join public.polls p on p.id=u.poll_id where p.author_id=auth.uid() and p.archived_at is null and u.status='bought' and u.would_buy_again is null and u.purchased_at<=now()-interval '7 days'
 union all select 'mention:'||m.source_kind||':'||m.source_id,case when coalesce(c.reel_id,r.id) is not null then 'reel_mention' else 'poll_mention' end,coalesce(c.poll_id,c.reel_id,p.id,r.id),m.author_id,coalesce(c.body,p.item_name,r.caption),m.created_at,'mentions' from public.content_mentions m left join public.social_comments c on m.source_kind='comment' and c.id=m.source_id left join public.polls p on m.source_kind='poll' and p.id=m.source_id left join public.social_reels r on m.source_kind='reel' and r.id=m.source_id where m.target_id=auth.uid() and case when m.source_kind='comment' then public.can_access_comment_thread(case when c.poll_id is not null then 'poll' else 'reel' end,coalesce(c.poll_id,c.reel_id)) when m.source_kind='poll' then public.worthit_post_access(p.author_id,p.archived_at) else public.worthit_post_access(r.author_id,r.archived_at) end
 union all select 'announcement:'||a.id,case when a.kind='feature_announcements' then 'feature_announcement' else 'important_update' end,a.id,null,a.title||': '||a.body,a.created_at,a.kind from public.app_announcements a where auth.uid() is not null and a.created_at>now()-interval '90 days'
 )select a.id,a.kind,a.target_id,coalesce(p.username,p.display_name,'Worth It'),a.detail,a.created_at from activity a left join public.social_profiles p on p.id=a.actor where auth.uid() is not null and public.worthit_notification_enabled(a.preference) and (a.actor is null or (not public.worthit_is_muted(a.actor) and not coalesce(p.is_suspended,false) and not exists(select 1 from public.account_deactivations where user_id=a.actor) and not exists(select 1 from public.account_blocks b where (b.blocker=auth.uid() and b.blocked=a.actor)or(b.blocked=auth.uid() and b.blocker=a.actor)))) order by a.created_at desc,a.id desc limit 50;
$$;
-- Add a restrictive gate alongside existing ownership/privacy policies; never replace them.
do $gate$ declare t record;begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
 execute format('create policy worthit_session_gate on %I.%I as restrictive for all to authenticated using(public.worthit_session_allowed()) with check(public.worthit_session_allowed())',t.nspname,t.relname);
 end loop;
end $gate$;
-- Existing SECURITY DEFINER RPCs bypass RLS: add the same gate at every callable entry.
-- Grants, signatures, search paths and all existing ownership checks remain unchanged.
do $guard$ declare f record;definition text;body text;begin
 for f in select p.oid,p.proname,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')
 and p.proname not in ('worthit_session_allowed','worthit_account_state','worthit_deactivate') loop
 definition=pg_get_functiondef(f.oid);
 if f.lanname='sql' then body='select public.worthit_require_session(); '||f.prosrc;
 elsif f.lanname='plpgsql' then body=regexp_replace(f.prosrc,'\mbegin\M','begin perform public.worthit_require_session();','i');
 else raise exception 'Review unsupported RPC language: %',f.proname;end if;
 execute replace(definition,f.prosrc,body);
 end loop;
end $guard$;
notify pgrst,'reload schema';
commit;
