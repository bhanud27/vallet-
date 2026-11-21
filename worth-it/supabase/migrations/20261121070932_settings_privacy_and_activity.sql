begin;
alter table public.poll_stars add column created_at timestamptz;
alter table public.poll_stars alter column created_at set default now();
alter table public.social_reel_likes add column created_at timestamptz;
alter table public.social_reel_likes alter column created_at set default now();
create table public.account_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 comments_audience text not null default 'everyone' check(comments_audience in ('everyone','followers','nobody')),
 mentions_audience text not null default 'everyone' check(mentions_audience in ('everyone','followers','nobody')),
 hidden_words text[] not null default '{}', notification_types jsonb not null default '{}',
 preferred_categories text[] not null default '{}', preferred_brands text[] not null default '{}', preferred_styles text[] not null default '{}',
 autoplay boolean not null default true, data_saver boolean not null default false, language text not null default 'en' check(language='en')
);
create table public.account_mutes(user_id uuid references auth.users(id) on delete cascade,target_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,target_id),check(user_id<>target_id));
create table public.saved_reels(user_id uuid references auth.users(id) on delete cascade,reel_id uuid references public.social_reels(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,reel_id));
create table public.content_mentions(source_kind text check(source_kind in ('comment','poll','reel')),source_id uuid,target_id uuid references auth.users(id) on delete cascade,author_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(source_kind,source_id,target_id));
create index mentions_recipient_recent on public.content_mentions(target_id,created_at desc);
create index settings_comments_author on public.social_comments(author_id,created_at desc,id desc);
create index settings_votes_voter on public.votes(voter_id,created_at desc,id desc);
create index settings_stars_viewer on public.poll_stars(viewer_id,created_at desc,poll_id);
create index settings_check_stars_viewer on public.social_reel_likes(viewer_id,created_at desc,reel_id);
create index settings_saves_user on public.saved_polls(user_id,created_at desc,poll_id);
create index settings_check_saves_user on public.saved_reels(user_id,created_at desc,reel_id);
create table public.app_announcements(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('feature_announcements','important_updates')),title text not null check(length(title) between 1 and 120),body text not null check(length(body) between 1 and 1000),created_at timestamptz not null default now());
alter table public.account_preferences enable row level security;alter table public.account_mutes enable row level security;alter table public.saved_reels enable row level security;alter table public.content_mentions enable row level security;alter table public.app_announcements enable row level security;
revoke all on public.account_preferences,public.account_mutes,public.saved_reels,public.content_mentions,public.app_announcements from public,anon,authenticated;
grant all on public.account_preferences,public.account_mutes,public.saved_reels,public.content_mentions,public.app_announcements to service_role;

create function public.worthit_list_valid(value jsonb,max_count int,max_length int) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(value) is distinct from 'array' then false else jsonb_array_length(value)<=max_count and not exists(select 1 from jsonb_array_elements(value) item where jsonb_typeof(item)<>'string' or length(btrim(item#>>'{}')) not between 1 and max_length) end;
$$;
create function public.worthit_settings(p_patch jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;k text;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_patch is not null then
 if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>16000 or p_patch-array['comments_audience','mentions_audience','hidden_words','notification_types','preferred_categories','preferred_brands','preferred_styles','autoplay','data_saver','language']::text[]<>'{}'::jsonb then raise exception 'Invalid settings.' using errcode='22023';end if;
 foreach k in array array['comments_audience','mentions_audience'] loop if p_patch?k and (jsonb_typeof(p_patch->k)<>'string' or p_patch->>k not in ('everyone','followers','nobody')) then raise exception 'Invalid audience.' using errcode='22023';end if;end loop;
 foreach k in array array['autoplay','data_saver'] loop if p_patch?k and jsonb_typeof(p_patch->k)<>'boolean' then raise exception 'Invalid preference.' using errcode='22023';end if;end loop;
 foreach k in array array['hidden_words','preferred_categories','preferred_brands','preferred_styles'] loop if p_patch?k and not public.worthit_list_valid(p_patch->k,case when k='hidden_words' then 50 else 25 end,case when k='hidden_words' then 40 else 60 end) then raise exception 'Invalid preference list.' using errcode='22023';end if;end loop;
 if p_patch?'language' and (p_patch->>'language') is distinct from 'en' then raise exception 'Only English is available.' using errcode='22023';end if;
 if p_patch?'notification_types' and (jsonb_typeof(p_patch->'notification_types')<>'object' or (p_patch->'notification_types')-array['new_votes','poll_results','poll_comments','poll_stars','new_followers','follow_requests','mentions','content_stars','content_comments','relevant_activity','feature_announcements','important_updates']::text[]<>'{}'::jsonb or exists(select 1 from jsonb_each(p_patch->'notification_types') item where jsonb_typeof(item.value)<>'boolean')) then raise exception 'Invalid notifications.' using errcode='22023';end if;
 perform public.worthit_use_quota('settings',1,300);
 insert into public.account_preferences(user_id) values(auth.uid()) on conflict do nothing;
 update public.account_preferences set
 comments_audience=coalesce(p_patch->>'comments_audience',comments_audience),mentions_audience=coalesce(p_patch->>'mentions_audience',mentions_audience),
 hidden_words=case when p_patch?'hidden_words' then array(select distinct lower(btrim(value)) from jsonb_array_elements_text(p_patch->'hidden_words')) else hidden_words end,
 preferred_categories=case when p_patch?'preferred_categories' then array(select distinct btrim(value) from jsonb_array_elements_text(p_patch->'preferred_categories')) else preferred_categories end,
 preferred_brands=case when p_patch?'preferred_brands' then array(select distinct btrim(value) from jsonb_array_elements_text(p_patch->'preferred_brands')) else preferred_brands end,
 preferred_styles=case when p_patch?'preferred_styles' then array(select distinct btrim(value) from jsonb_array_elements_text(p_patch->'preferred_styles')) else preferred_styles end,
 notification_types=notification_types||coalesce(p_patch->'notification_types','{}'::jsonb),autoplay=coalesce((p_patch->>'autoplay')::boolean,autoplay),data_saver=coalesce((p_patch->>'data_saver')::boolean,data_saver),language=coalesce(p_patch->>'language',language)
 where user_id=auth.uid();end if;
 select to_jsonb(s)-'user_id' into result from public.account_preferences s where s.user_id=auth.uid();
 return coalesce(result,'{}'::jsonb);
end $$;
create function public.worthit_muted(p_id uuid default null,p_muted boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_id is not null then
 if p_id=auth.uid() or p_muted is null or not exists(select 1 from public.social_profiles where id=p_id and not is_suspended) then raise exception 'Invalid account.' using errcode='22023';end if;
 perform public.worthit_use_quota('mutes',1,100);
 if p_muted then insert into public.account_mutes(user_id,target_id) values(auth.uid(),p_id) on conflict do nothing;else delete from public.account_mutes where user_id=auth.uid() and target_id=p_id;end if;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'username',coalesce(a.username,a.display_name)) order by m.created_at desc) from public.account_mutes m join public.social_profiles a on a.id=m.target_id where m.user_id=auth.uid()),'[]'::jsonb);
end $$;
create function public.worthit_is_muted(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.account_mutes where user_id=auth.uid() and target_id=p_id);$$;
create function public.worthit_filtered(p_owner uuid,p_body text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.account_preferences p,unnest(p.hidden_words) word where p.user_id=p_owner and strpos(lower(p_body),lower(word))>0);$$;
create function public.worthit_interaction_allowed(p_owner uuid,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_owner=auth.uid() or (public.can_view_social_content(p_owner) and case coalesce((select case when p_kind='comments' then comments_audience else mentions_audience end from public.account_preferences where user_id=p_owner),'everyone') when 'everyone' then true when 'followers' then exists(select 1 from public.social_follows where following_id=p_owner and follower_id=auth.uid() and accepted) else false end));
$$;
create function public.worthit_comment_controls() returns trigger language plpgsql security definer set search_path='' as $$declare owner uuid;begin
 if new.poll_id is not null then select author_id into owner from public.polls where id=new.poll_id;else select author_id into owner from public.social_reels where id=new.reel_id;end if;
 if owner is not null and not public.worthit_interaction_allowed(owner,'comments') then raise exception 'This account does not allow your comment.' using errcode='42501';end if;
 if public.worthit_filtered(owner,new.body) then raise exception 'This comment contains a word filtered by the account owner.' using errcode='22023';end if;return new;end $$;
create trigger worthit_comment_controls before insert or update on public.social_comments for each row execute function public.worthit_comment_controls();
create function public.worthit_sync_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;body text;source uuid;target record;
begin
 kind=case tg_table_name when 'social_comments' then 'comment' when 'social_reels' then 'reel' else 'poll' end;
 if tg_op='DELETE' then delete from public.content_mentions where source_kind=kind and source_id=old.id;return old;end if;
 source=new.id;body=case kind when 'comment' then to_jsonb(new)->>'body' when 'reel' then to_jsonb(new)->>'caption' else to_jsonb(new)->>'question' end;
 delete from public.content_mentions where source_kind=kind and source_id=source and target_id not in (select p.id from regexp_matches(lower(body),'(^|[^a-z0-9_.])@([a-z0-9_]{3,40})','g') m join public.social_profiles p on p.username=m[2]);
 for target in select distinct p.id from regexp_matches(lower(body),'(^|[^a-z0-9_.])@([a-z0-9_]{3,40})','g') m join public.social_profiles p on p.username=m[2] where p.id<>new.author_id loop
 if not public.worthit_interaction_allowed(target.id,'mentions') then raise exception 'A mentioned account does not allow this mention.' using errcode='42501';end if;
 insert into public.content_mentions(source_kind,source_id,target_id,author_id) values(kind,source,target.id,new.author_id) on conflict do nothing;
 end loop;return new;end $$;
create trigger worthit_mentions after insert or update of body or delete on public.social_comments for each row execute function public.worthit_sync_mentions();
create trigger worthit_mentions after insert or update of caption or delete on public.social_reels for each row execute function public.worthit_sync_mentions();
create trigger worthit_mentions after insert or update of question or delete on public.polls for each row execute function public.worthit_sync_mentions();
create function public.worthit_delete_comment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not exists(select 1 from public.social_comments where id=p_id and author_id=auth.uid()) then raise exception 'Only the author can delete this comment.' using errcode='42501';end if;
 delete from public.social_comments where id=p_id and author_id=auth.uid();end $$;
create function public.worthit_save_content(p_kind text,p_id uuid,p_save boolean default null) returns boolean language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_kind='poll' then
 if p_save is not null then perform public.worthit_saved(p_id,p_save);end if;
 return exists(select 1 from public.saved_polls where user_id=auth.uid() and poll_id=p_id);
 elsif p_kind='reel' then
 if p_save then if not exists(select 1 from public.social_reels where id=p_id and public.worthit_post_access(author_id,archived_at)) then raise exception 'This check is unavailable.' using errcode='42501';end if;perform public.worthit_use_quota('saves',1,200);insert into public.saved_reels(user_id,reel_id) values(auth.uid(),p_id) on conflict do nothing;
 elsif p_save=false then delete from public.saved_reels where user_id=auth.uid() and reel_id=p_id;end if;
 return exists(select 1 from public.saved_reels where user_id=auth.uid() and reel_id=p_id);
 else raise exception 'Invalid content type.' using errcode='22023';end if;end $$;
create function public.worthit_recommendation_score(p_category text,p_brand text,p_body text) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select count(*)::integer from public.account_preferences s cross join lateral unnest(s.preferred_categories||s.preferred_brands||s.preferred_styles) word where s.user_id=auth.uid() and strpos(regexp_replace(lower(coalesce(p_category,'')||' '||coalesce(p_brand,'')||' '||coalesce(p_body,'')),'[^a-z0-9]+','','g'),regexp_replace(lower(word),'[^a-z0-9]+','','g'))>0),0);
$$;
create or replace function public.list_social_comments(p_kind text, p_id uuid)
returns table (id uuid, username text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_comment_thread(p_kind, p_id) then
    raise exception 'This comment thread is unavailable.' using errcode = 'P0002';
  end if;
  return query
    select c.id, coalesce(p.username, p.display_name, 'Worth It? member'), c.body, c.created_at
    from public.social_comments c left join public.social_profiles p on p.id = c.author_id
    where ((p_kind = 'poll' and c.poll_id = p_id) or (p_kind = 'reel' and c.reel_id = p_id)) and not public.worthit_filtered(coalesce((select op.author_id from public.polls op where op.id=c.poll_id),(select op.author_id from public.social_reels op where op.id=c.reel_id)),c.body)
    order by c.created_at desc, c.id desc limit 50;
end;
$$;
create or replace function public.worthit_feed(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 with authors as materialized(
 select id from (select auth.uid() as id union select following_id from public.social_follows where follower_id=auth.uid() and accepted) a
 where public.can_view_social_content(id) and not public.worthit_is_muted(id)
 ), candidates as (
 select p.id,p.created_at,'poll'::text as kind from authors a join public.polls p on p.author_id=a.id where not p.is_demo and p.archived_at is null
 union all
 select r.id,r.created_at,'reel'::text from authors a join public.social_reels r on r.author_id=a.id where r.archived_at is null
 ), page as materialized(
 select * from candidates where p_before is null or (created_at,id)<(p_before,p_before_id)
 order by created_at desc,id desc limit greatest(1,least(p_limit,30))
 )
 select coalesce(jsonb_agg(jsonb_build_object('kind',page.kind,'post',
 case when page.kind='poll' then to_jsonb(p)||jsonb_build_object(
 'username',a.username,'vote_count',(select count(*) from public.votes where poll_id=p.id),
 'update_status',(select status from public.purchase_updates where poll_id=p.id))
 else to_jsonb(r)||jsonb_build_object('username',a.username,'avatar_path',a.avatar_path,
 'liked',exists(select 1 from public.social_reel_likes where reel_id=r.id and viewer_id=auth.uid()),
 'likes',(select count(*) from public.social_reel_likes where reel_id=r.id)) end
 ) order by page.created_at desc,page.id desc),'[]'::jsonb) into result
 from page left join public.polls p on page.kind='poll' and p.id=page.id
 left join public.social_reels r on page.kind='reel' and r.id=page.id
 left join public.social_profiles a on a.id=coalesce(p.author_id,r.author_id);
 return result;
end $$;
create or replace function public.list_visible_reels(p_author uuid, p_following boolean)
returns table (id uuid, author_id uuid, caption text, created_at timestamptz, video_path text,
  display_name text, bio text, avatar_path text, liked boolean, likes bigint)
language sql stable security definer set search_path = '' as $$
  select r.id, r.author_id, r.caption, r.created_at, r.video_path,
    coalesce(p.username, p.display_name, ''), ''::text, p.avatar_path,
    exists (select 1 from public.social_reel_likes l where l.reel_id = r.id and l.viewer_id = auth.uid()),
    (select count(*) from public.social_reel_likes l where l.reel_id = r.id)
  from public.social_reels r
  left join public.social_profiles p on p.id = r.author_id
  where r.archived_at is null and auth.uid() is not null and public.worthit_post_access(r.author_id,r.archived_at)
    and (p_author is null or r.author_id = p_author) and (p_author is not null or not public.worthit_is_muted(r.author_id))
    and (not p_following or exists (select 1 from public.social_follows f
      where f.follower_id = auth.uid() and f.following_id = r.author_id and f.accepted))
  order by case when p_author is null then public.worthit_recommendation_score(null,null,r.caption) else 0 end desc,r.created_at desc,r.id desc
  limit 60;
$$;
create or replace function public.worthit_discovery_unfiltered(p_category text, p_min integer, p_max integer, p_query text, p_needs_answer boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.post order by d.helpful, d.replies,d.preference desc,d.created_at desc, d.id desc), '[]'::jsonb)
  from (
    select p.id, p.created_at,
      case when p_needs_answer then v.helpful else 0 end as helpful,
      case when p_needs_answer then v.replies else 0 end as replies,public.worthit_recommendation_score(coalesce(p.product_details->>'category',p.category),p.product_details->>'brand',p.item_name||' '||p.question) as preference,
      jsonb_build_object('product_details',p.product_details,'content_type',p.content_type,'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
        'image_path', p.image_path, 'is_demo', false, 'created_at', p.created_at, 'author_id', p.author_id,
        'username', a.username, 'category', p.category, 'use_case', p.use_case, 'priority', p.priority,
        'budget_inr', p.budget_inr, 'vote_count', v.total, 'update_status', u.status) as post
    from public.polls p
    left join public.social_profiles a on a.id = p.author_id
    left join public.purchase_updates u on u.poll_id = p.id
    cross join lateral (
      select count(*) as total, count(*) filter (where nullif(btrim(v.reason), '') is not null) as replies,
        count(*) filter (where v.helpful_at is not null) as helpful
      from public.votes v where v.poll_id = p.id
    ) v
    where not p.is_demo and p.archived_at is null and public.can_view_social_content(p.author_id) and not coalesce(a.is_private, false) and not public.worthit_is_muted(p.author_id)
      and (p_category is null or p.category = p_category)
      and (p_min is null or p.price_inr >= p_min) and (p_max is null or p.price_inr <= p_max)
      and (p_query is null or (char_length(p_query) <= 2048 and
        (strpos(lower(p.item_name), lower(p_query)) > 0 or (p.content_type='post' and strpos(lower(p.question),lower(p_query))>0) or p.product_url = p_query)))
      and (not p_needs_answer or (p.content_type='poll' and u.poll_id is null and v.helpful = 0))
    order by helpful,replies,public.worthit_recommendation_score(coalesce(p.product_details->>'category',p.category),p.product_details->>'brand',p.item_name||' '||p.question) desc,p.created_at desc,p.id desc limit 50
  ) d;
$$;

create function public.worthit_activity(p_section text,p_before timestamptz default null,p_before_id text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_section not in ('saved','stars','polls','comments') then raise exception 'Invalid activity.' using errcode='22023';end if;
 with entries as (
 select 'created:'||p.id as entry_id,'poll'::text kind,p.id content_id,p.item_name title,p.created_at, null::uuid comment_id,null::text body from public.polls p where p_section='polls' and p.author_id=auth.uid() and p.content_type='poll' and p.archived_at is null
 union all select 'vote:'||v.id,'poll',p.id,p.item_name,v.created_at,null,null from public.votes v join public.polls p on p.id=v.poll_id where p_section='polls' and v.voter_id=auth.uid() and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at))
 union all select 'star-poll:'||p.id,'poll',p.id,p.item_name,coalesce(s.created_at,p.created_at),null,null from public.poll_stars s join public.polls p on p.id=s.poll_id where p_section='stars' and s.viewer_id=auth.uid() and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at))
 union all select 'star-reel:'||r.id,'reel',r.id,r.caption,coalesce(s.created_at,r.created_at),null,null from public.social_reel_likes s join public.social_reels r on r.id=s.reel_id where p_section='stars' and s.viewer_id=auth.uid() and public.worthit_post_access(r.author_id,r.archived_at)
 union all select 'save-poll:'||p.id,'poll',p.id,p.item_name,s.created_at,null,null from public.saved_polls s join public.polls p on p.id=s.poll_id where p_section='saved' and s.user_id=auth.uid() and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at))
 union all select 'save-reel:'||r.id,'reel',r.id,r.caption,s.created_at,null,null from public.saved_reels s join public.social_reels r on r.id=s.reel_id where p_section='saved' and s.user_id=auth.uid() and public.worthit_post_access(r.author_id,r.archived_at)
 union all select 'comment:'||c.id,case when c.poll_id is not null then 'poll' else 'reel' end,coalesce(c.poll_id,c.reel_id),coalesce(p.item_name,r.caption,'Content'),c.created_at,c.id,c.body from public.social_comments c left join public.polls p on p.id=c.poll_id left join public.social_reels r on r.id=c.reel_id where p_section='comments' and c.author_id=auth.uid() and public.can_access_comment_thread(case when c.poll_id is not null then 'poll' else 'reel' end,coalesce(c.poll_id,c.reel_id))
 ),page as(select * from entries where p_before is null or (created_at,entry_id)<(p_before,p_before_id) order by created_at desc,entry_id desc limit 30)
 select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,entry_id desc),'[]'::jsonb) into result from page;return result;end $$;
create function public.worthit_notification_enabled(p_type text) returns boolean language sql stable security definer set search_path='' as $$select coalesce((select (notification_types->>p_type)::boolean from public.account_preferences where user_id=auth.uid()),true);$$;
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
 )select a.id,a.kind,a.target_id,coalesce(p.username,p.display_name,'Worth It'),a.detail,a.created_at from activity a left join public.social_profiles p on p.id=a.actor where auth.uid() is not null and public.worthit_notification_enabled(a.preference) and (a.actor is null or (not public.worthit_is_muted(a.actor) and not coalesce(p.is_suspended,false) and not exists(select 1 from public.account_blocks b where (b.blocker=auth.uid() and b.blocked=a.actor)or(b.blocked=auth.uid() and b.blocker=a.actor)))) order by a.created_at desc,a.id desc limit 50;
$$;
revoke all on function public.worthit_list_valid(jsonb,int,int),public.worthit_settings(jsonb),public.worthit_muted(uuid,boolean),public.worthit_is_muted(uuid),public.worthit_filtered(uuid,text),public.worthit_interaction_allowed(uuid,text),public.worthit_comment_controls(),public.worthit_sync_mentions(),public.worthit_delete_comment(uuid),public.worthit_save_content(text,uuid,boolean),public.worthit_recommendation_score(text,text,text),public.worthit_activity(text,timestamptz,text),public.worthit_notification_enabled(text) from public,anon,authenticated;
grant execute on function public.worthit_settings(jsonb),public.worthit_muted(uuid,boolean),public.worthit_delete_comment(uuid),public.worthit_save_content(text,uuid,boolean),public.worthit_activity(text,timestamptz,text) to authenticated;
notify pgrst,'reload schema';commit;

