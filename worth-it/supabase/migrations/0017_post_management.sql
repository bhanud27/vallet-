begin;
-- Fail before changing tables when an earlier migration is missing.
do $$
declare missing text;
begin
 select string_agg(required.file_name, ', ' order by required.version) into missing
 from (values
  (12, 'public.worthit_use_quota(text,bigint,bigint)', '0012_safety_and_accounts.sql'),
  (13, 'public.worthit_feed(timestamptz,uuid,integer)', '0013_media_and_pagination.sql'),
  (14, 'public.worthit_poll_page(uuid,timestamptz,uuid)', '0014_results_and_engagement.sql'),
  (15, 'public.worthit_claim_media()', '0015_media_jobs.sql'),
  (16, 'public.worthit_product_key(text)', '0016_operations.sql')
 ) required(version,signature,file_name)
 where to_regprocedure(required.signature) is null;
 if missing is not null then
  raise exception 'Cannot apply 0017_post_management.sql. Missing prerequisites: %',missing
   using errcode='55000',
   hint='Apply the missing earlier migration files in numeric order, then rerun the entire 0017 file.';
 end if;
end $$;

alter table public.polls add column archived_at timestamptz, add column edited_at timestamptz;
alter table public.social_reels add column archived_at timestamptz, add column edited_at timestamptz;
create index polls_active_author on public.polls(author_id,created_at desc,id desc) where archived_at is null;
create index reels_active_author on public.social_reels(author_id,created_at desc,id desc) where archived_at is null;

-- Separate owner management from publishing. Clients cannot replace media or forge timestamps.
revoke update,delete on public.polls,public.social_reels from authenticated;
create function public.worthit_post_access(p_author uuid,p_archived timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select (p_archived is null or p_author=auth.uid()) and public.can_view_social_content(p_author);
$$;
revoke all on function public.worthit_post_access(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.worthit_post_access(uuid,timestamptz) to anon,authenticated;

create table public.post_tombstones(kind text not null check(kind in ('poll','reel')),id uuid not null,primary key(kind,id));
create table public.post_media_cleanup(
 bucket text not null check(bucket in ('poll-photos','social-media')),path text not null,
 owner_id uuid not null,created_at timestamptz not null default now(),
 locked_at timestamptz,lease uuid,attempts integer not null default 0,
 primary key(bucket,path),check(split_part(path,'/',1)=owner_id::text)
);
alter table public.post_tombstones enable row level security;
alter table public.post_media_cleanup enable row level security;
revoke all on public.post_tombstones,public.post_media_cleanup from public,anon,authenticated;
grant all on public.post_tombstones,public.post_media_cleanup to service_role;


-- Prevent a late publish/edit from reusing a path after the cleanup reference check.
-- Existing shared references remain valid and the worker preserves them.
create table public.post_retired_media(bucket text not null,path text not null,primary key(bucket,path));
alter table public.post_retired_media enable row level security;
revoke all on public.post_retired_media from public,anon,authenticated;
grant all on public.post_retired_media to service_role;
create function public.worthit_retire_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.post_retired_media values(new.bucket,new.path) on conflict do nothing;
 return new;
end $$;
create trigger post_retire_media after insert on public.post_media_cleanup for each row execute function public.worthit_retire_media();
create function public.worthit_media_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare blocked boolean;
begin
 if tg_table_name='polls' then
 select exists(select 1 from public.post_retired_media t where
 (t.bucket='poll-photos' and t.path=new.image_path)
 or exists(select 1 from jsonb_array_elements(new.media_gallery) m where t.path=m->>'value'
 and t.bucket=case when m->>'kind'='image' then 'poll-photos' else 'social-media' end)) into blocked;
 elsif tg_table_name='social_reels' then
 select exists(select 1 from public.post_retired_media where bucket='social-media' and path=new.video_path) into blocked;
 else
 select exists(select 1 from public.post_retired_media where bucket='social-media' and path=new.avatar_path) into blocked;
 end if;
 if blocked then raise exception 'This attachment was retired. Upload it again as a new attachment.' using errcode='42501';end if;
 return new;
end $$;
create trigger post_media_reference_guard before insert on public.polls for each row execute function public.worthit_media_reference_guard();
create trigger post_media_reference_guard before insert on public.social_reels for each row execute function public.worthit_media_reference_guard();
create trigger profile_media_reference_guard before insert or update of avatar_path on public.social_profiles for each row execute function public.worthit_media_reference_guard();
revoke all on function public.worthit_retire_media(),public.worthit_media_reference_guard() from public,anon,authenticated;

create function public.worthit_post_insert_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.post_tombstones where kind=case when tg_table_name='polls' then 'poll' else 'reel' end and id=new.id)
 then raise exception 'This post was deleted.' using errcode='42501';end if;
 if auth.uid() is not null and (new.archived_at is not null or new.edited_at is not null) then
 raise exception 'Invalid post state.' using errcode='42501';end if;
 return new;
end $$;
create trigger post_insert_guard before insert on public.polls for each row execute function public.worthit_post_insert_guard();
create trigger post_insert_guard before insert on public.social_reels for each row execute function public.worthit_post_insert_guard();

-- Capture references before cascading deletes remove the media jobs. Ten minutes lets in-flight processing finish.
create function public.worthit_deleted_post() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text:=case when tg_table_name='polls' then 'poll' else 'reel' end;
begin
 insert into public.post_tombstones values(kind,old.id) on conflict do nothing;
 insert into public.post_media_cleanup(bucket,path,owner_id)
 select distinct bucket,path,old.author_id from (
 select j.bucket,unnest(array[j.source_path,j.preview_path,j.playback_path,
 j.owner_id::text||'/processed/'||j.id::text||'.jpg',
 case when j.bucket='social-media' then j.owner_id::text||'/processed/'||j.id::text||'.mp4' end]) path
 from public.media_jobs j where (kind='poll' and j.poll_id=old.id) or (kind='reel' and j.reel_id=old.id)
 union all
 select 'poll-photos',p.image_path from public.polls p where kind='poll' and p.id=old.id
 union all
 select case when m->>'kind'='image' then 'poll-photos' else 'social-media' end,m->>'value'
 from public.polls p cross join lateral jsonb_array_elements(p.media_gallery) m where kind='poll' and p.id=old.id
 union all
 select 'poll-photos',m->>'thumbnail' from public.polls p cross join lateral jsonb_array_elements(p.media_gallery) m
 where kind='poll' and p.id=old.id and m->>'kind'='image'
 union all select 'social-media',r.video_path from public.social_reels r where kind='reel' and r.id=old.id
 ) objects where path is not null and split_part(path,'/',1)=old.author_id::text
 on conflict(bucket,path) do nothing;
 return old;
end $$;
create trigger post_deleted before delete on public.polls for each row execute function public.worthit_deleted_post();
create trigger post_deleted before delete on public.social_reels for each row execute function public.worthit_deleted_post();

create function public.worthit_manage_post(p_kind text,p_id uuid,p_action text,p_values jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid;stamp timestamptz;link text;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_kind='poll' then select author_id,archived_at into owner,stamp from public.polls where id=p_id and not is_demo for update;
 elsif p_kind='reel' then select author_id,archived_at into owner,stamp from public.social_reels where id=p_id for update;
 else raise exception 'Invalid post type.' using errcode='22023';end if;
 if owner is null or owner<>auth.uid() then raise exception 'Only the owner can manage this post.' using errcode='42501';end if;
 if p_action='delete' then
 if p_kind='poll' then delete from public.polls where id=p_id;else delete from public.social_reels where id=p_id;end if;
 elsif p_action in ('archive','restore') then
 stamp=case when p_action='archive' then coalesce(stamp,now()) else null end;
 if p_kind='poll' then update public.polls set archived_at=stamp where id=p_id;
 else update public.social_reels set archived_at=stamp where id=p_id;end if;
 elsif p_action='edit' then
 if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Invalid details.' using errcode='22023';end if;
 perform public.worthit_use_quota('post_edits',1,120);
 link=nullif(btrim(p_values->>'productUrl'),'');
 if link is not null and (length(link)>2048 or link !~ '^https://[^/@[:space:]]+([/?#]|$)') then
 raise exception 'Enter a valid HTTPS product link.' using errcode='22023';end if;
 if p_kind='poll' then
 if p_values->>'itemName' is null or p_values->>'question' is null or p_values->>'priceInr' is null
 then raise exception 'Enter the poll details.' using errcode='22023';end if;
 update public.polls set item_name=btrim(p_values->>'itemName'),question=btrim(p_values->>'question'),
 price_inr=(p_values->>'priceInr')::integer,product_url=link,edited_at=now() where id=p_id;
 else
 if p_values->>'caption' is null then raise exception 'Enter a caption.' using errcode='22023';end if;
 update public.social_reels set caption=btrim(p_values->>'caption'),product_url=link,edited_at=now() where id=p_id;
 end if;
 else raise exception 'Invalid action.' using errcode='22023';end if;
end $$;
create function public.worthit_archived_posts(p_kind text,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(post order by archived_at desc,id desc),'[]'::jsonb) from (
 select p.id,p.archived_at,to_jsonb(p)||jsonb_build_object('vote_count',(select count(*) from public.votes where poll_id=p.id),
 'update_status',(select status from public.purchase_updates where poll_id=p.id)) post
 from public.polls p where p_kind='poll' and p.author_id=auth.uid() and p.archived_at is not null
 and (p_before is null or (p.archived_at,p.id)<(p_before,p_before_id))
 union all
 select r.id,r.archived_at,to_jsonb(r)||jsonb_build_object('display_name',s.display_name,'username',s.username,
 'avatar_path',s.avatar_path,'bio',s.bio,'likes',(select count(*) from public.social_reel_likes where reel_id=r.id),
 'liked',exists(select 1 from public.social_reel_likes where reel_id=r.id and viewer_id=auth.uid()))
 from public.social_reels r left join public.social_profiles s on s.id=r.author_id
 where p_kind='reel' and r.author_id=auth.uid() and r.archived_at is not null
 and (p_before is null or (r.archived_at,r.id)<(p_before,p_before_id))
 order by archived_at desc,id desc limit 60
 ) archived;
$$;
create function public.worthit_claim_post_cleanup() returns setof public.post_media_cleanup
language sql security definer set search_path='' as $$
 update public.post_media_cleanup set locked_at=now(),lease=gen_random_uuid(),attempts=attempts+1
 where (bucket,path)=(select bucket,path from public.post_media_cleanup
 where created_at<now()-interval '10 minutes' and (locked_at is null or locked_at<now()-interval '10 minutes')
 order by created_at for update skip locked limit 1) returning *;
$$;
create function public.worthit_finish_post_cleanup(p_bucket text,p_path text,p_lease uuid,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_success then delete from public.post_media_cleanup where bucket=p_bucket and path=p_path and lease=p_lease;
 -- Keep failed jobs for retry, with a ten-minute backoff.
 end if;
end $$;
revoke all on function public.worthit_post_insert_guard(),public.worthit_deleted_post(),
 public.worthit_manage_post(text,uuid,text,jsonb),public.worthit_archived_posts(text,timestamptz,uuid),
 public.worthit_claim_post_cleanup(),public.worthit_finish_post_cleanup(text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.worthit_manage_post(text,uuid,text,jsonb),public.worthit_archived_posts(text,timestamptz,uuid) to authenticated;
grant execute on function public.worthit_claim_post_cleanup(),public.worthit_finish_post_cleanup(text,text,uuid,boolean) to service_role;

-- Apply archive visibility in base queries BEFORE sorting/pagination.

create or replace function public.list_social_polls(p_author uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(post order by created_at desc, id desc), '[]'::jsonb) from (
    select p.id, p.created_at, jsonb_build_object(
      'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
      'image_path', p.image_path, 'is_demo', false, 'created_at', p.created_at, 'edited_at',p.edited_at,
      'author_id', a.id, 'username', a.username,
      'vote_count', (select count(*) from public.votes v where v.poll_id = p.id),
      'update_status', (select u.status from public.purchase_updates u where u.poll_id = p.id)
    ) as post
    from public.polls p join public.social_profiles a on a.id = p.author_id
    where auth.uid() is not null and not p.is_demo and p.archived_at is null and public.worthit_post_access(p.author_id,p.archived_at)
      and ((p_author is not null and p.author_id = p_author) or (p_author is null and exists (
        select 1 from public.social_follows f
        where f.follower_id = auth.uid() and f.following_id = p.author_id and f.accepted)))
    order by p.created_at desc, p.id desc limit 60
  ) visible;
$$;

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
    and (p_author is null or r.author_id = p_author)
    and (not p_following or exists (select 1 from public.social_follows f
      where f.follower_id = auth.uid() and f.following_id = r.author_id and f.accepted))
  order by r.created_at desc, r.id desc
  limit 60;
$$;

create or replace function public.worthit_feed(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 with authors as materialized(
 select id from (select auth.uid() as id union select following_id from public.social_follows where follower_id=auth.uid() and accepted) a
 where public.can_view_social_content(id)
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

create or replace function public.list_polls(p_demo boolean)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json_poll order by sort_key), '[]'::jsonb) from (
    select jsonb_build_object(
             'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
             'image_path', p.image_path, 'demo_image', p.demo_image, 'is_demo', p.is_demo, 'created_at', p.created_at, 'archived_at',p.archived_at,'edited_at',p.edited_at,
             'vote_count', (select count(*) from public.votes v where v.poll_id = p.id),
             'update_status', (select u.status from public.purchase_updates u where u.poll_id = p.id)
           ) as row_to_json_poll,
           case when p_demo then p.price_inr::double precision else -extract(epoch from p.created_at) end as sort_key
    from public.polls p
    where p.archived_at is null and ((p_demo and p.is_demo) or (not p_demo and auth.uid() is not null and p.author_id = auth.uid()))
  ) s;
$$;

create or replace function public.list_product_history(p_url text, p_current uuid)
returns table (id uuid, item_name text, price_inr integer, created_at timestamptz,
  price_paid_inr integer, purchased_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.item_name, p.price_inr, p.created_at, u.price_paid_inr, u.purchased_at, u.status
  from public.polls p left join public.purchase_updates u on u.poll_id = p.id
  where (public.worthit_product_key(p.product_url) = public.worthit_product_key(p_url) or (p.product_url is null and public.worthit_product_key(u.store_url) = public.worthit_product_key(p_url)))
    and not p.is_demo and p.archived_at is null and p.id is distinct from p_current
    and public.worthit_post_access(p.author_id,p.archived_at)
  order by p.created_at desc, p.id desc limit 12;
$$;

create or replace function public.get_poll_view(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'poll', jsonb_build_object(
      'id', p.id, 'category', p.category, 'use_case', p.use_case, 'priority', p.priority,
      'budget_inr', p.budget_inr, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
      'image_path', p.image_path, 'demo_image', p.demo_image, 'is_demo', p.is_demo, 'created_at', p.created_at, 'archived_at',p.archived_at,'edited_at',p.edited_at),
    'is_author', (p.author_id is not null and p.author_id = auth.uid()),
    'my_choice', (select v.choice from public.votes v where v.poll_id = p.id and v.voter_id = auth.uid()),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'choice', v.choice, 'reason', v.reason,
                                          'owns_item', v.owns_item, 'helpful', v.helpful_at is not null, 'created_at', v.created_at)
                       order by v.created_at desc)
      from public.votes v where v.poll_id = p.id), '[]'::jsonb),
    'update', (select jsonb_build_object('status', u.status, 'price_paid_inr', u.price_paid_inr, 'review', u.review,
                                         'store_url', u.store_url, 'purchased_at', u.purchased_at, 'would_buy_again', u.would_buy_again,
                                         'is_affiliate', u.is_affiliate, 'updated_at', u.updated_at)
               from public.purchase_updates u where u.poll_id = p.id)
  )
  from public.polls p where p.id = p_id and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at));
$$;

create or replace function public.worthit_poll_page(p_id uuid,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'poll',to_jsonb(p)-'author_id'-'media_gallery'||jsonb_build_object('author_id',p.author_id,'username',s.username),
 'is_author',p.author_id=auth.uid(),
 'my_choice',(select choice from public.votes where poll_id=p.id and voter_id=auth.uid()),
 'summary',(select jsonb_build_object('buy',count(*) filter(where choice='buy'),'wait',count(*) filter(where choice='wait'),'skip',count(*) filter(where choice='skip'),
 'ownerBuy',count(*) filter(where owns_item and choice='buy'),'ownerWait',count(*) filter(where owns_item and choice='wait'),'ownerSkip',count(*) filter(where owns_item and choice='skip')) from public.votes where poll_id=p.id),
 'votes',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'choice',v.choice,'reason',v.reason,'owns_item',v.owns_item,'helpful',v.helpful_at is not null,'created_at',v.created_at) order by v.created_at desc,v.id desc)
 from (select * from public.votes where poll_id=p.id and nullif(btrim(reason),'') is not null and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 20) v),'[]'::jsonb),
 'update',(select to_jsonb(u)-'poll_id' from public.purchase_updates u where poll_id=p.id))
 from public.polls p left join public.social_profiles s on s.id=p.author_id
 where p.id=p_id and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at));
$$;

create or replace function public.get_poll_extras(p_ids uuid[])
returns table (id uuid, product_url text, stars bigint, starred boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.product_url,
    (select count(*) from public.poll_stars s where s.poll_id = p.id),
    exists (select 1 from public.poll_stars s where s.poll_id = p.id and s.viewer_id = auth.uid())
  from public.polls p where p.id = any(p_ids) and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at));
$$;

create or replace function public.get_poll_media(p_ids uuid[])
returns table (id uuid, media jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.media_gallery from public.polls p
  where p.id = any(p_ids) and p.media_gallery <> '[]'::jsonb
    and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at));
$$;

create or replace function public.set_poll_star(p_id uuid, p_starred boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.polls where id = p_id and (is_demo or public.worthit_post_access(author_id,archived_at))) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_starred then
    insert into public.poll_stars (poll_id, viewer_id) values (p_id, auth.uid()) on conflict do nothing;
  else
    delete from public.poll_stars where poll_id = p_id and viewer_id = auth.uid();
  end if;
  return (select to_jsonb(result) from public.get_poll_extras(array[p_id]) result);
end;
$$;

create or replace function public.cast_vote(p_id uuid, p_choice text, p_reason text, p_owns boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_poll public.polls;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into v_poll from public.polls where id = p_id and (is_demo or public.worthit_post_access(author_id,archived_at));
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_poll.is_demo then raise exception 'demo_readonly' using errcode = '42501'; end if;
  if v_poll.author_id = auth.uid() then raise exception 'author_cannot_vote' using errcode = '42501'; end if;
  if p_choice not in ('buy', 'wait', 'skip') then raise exception 'invalid_choice' using errcode = '22023'; end if;
  if v_reason is not null and char_length(v_reason) > 280 then raise exception 'reason_too_long' using errcode = '22001'; end if;
  begin
    insert into public.votes (poll_id, voter_id, choice, reason, owns_item)
    values (p_id, auth.uid(), p_choice, v_reason, coalesce(p_owns, false));
  exception when unique_violation then
    raise exception 'already_voted' using errcode = '23505';
  end;
end;
$$;

create or replace function public.social_set_reel_like(p_reel uuid, p_liked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.social_reels r where r.id = p_reel and public.worthit_post_access(r.author_id,r.archived_at)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_liked then
    insert into public.social_reel_likes (reel_id, viewer_id) values (p_reel, auth.uid()) on conflict do nothing;
  else
    delete from public.social_reel_likes where reel_id = p_reel and viewer_id = auth.uid();
  end if;
end;
$$;

create or replace function public.can_access_comment_thread(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and case p_kind
    when 'poll' then exists (
      select 1 from public.polls p where p.id = p_id and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at)))
    when 'reel' then exists (
      select 1 from public.social_reels r where r.id = p_id and public.worthit_post_access(r.author_id,r.archived_at))
    else false end;
$$;

create or replace function public.get_reel_product_links(p_ids uuid[])
returns table (id uuid, product_url text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.product_url from public.social_reels r
  where auth.uid() is not null and r.id = any(p_ids) and r.product_url is not null
    and public.worthit_post_access(r.author_id,r.archived_at);
$$;

create or replace function public.worthit_saved(p_id uuid default null,p_save boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_id is not null and p_save is not null then
 if p_save then
 if not exists(select 1 from public.polls p where p.id=p_id and p.archived_at is null and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at))) then raise exception 'Poll unavailable.' using errcode='42501';end if;
 perform public.worthit_use_quota('saves',1,200);
 insert into public.saved_polls(user_id,poll_id) values(auth.uid(),p_id) on conflict do nothing;
 else delete from public.saved_polls where user_id=auth.uid() and poll_id=p_id;end if;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'itemName',p.item_name,'createdAt',s.created_at) order by s.created_at desc)
 from public.saved_polls s join public.polls p on p.id=s.poll_id where s.user_id=auth.uid() and p.archived_at is null and (p.is_demo or public.worthit_post_access(p.author_id,p.archived_at))),'[]'::jsonb);
end $$;

create or replace function public.list_social_notifications()
returns table (id text, kind text, target_id uuid, username text, detail text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select activity.id, activity.kind, activity.target_id, activity.username, activity.detail, activity.created_at
  from (
    select 'comment:' || c.id as id, 'poll_comment'::text as kind, p.id as target_id,
      coalesce(a.username, a.display_name, 'Worth It? member') as username, p.item_name as detail, c.created_at
    from public.polls p join public.social_comments c on c.poll_id = p.id
    left join public.social_profiles a on a.id = c.author_id
    where p.author_id = auth.uid() and c.author_id <> auth.uid()
    union all
    select 'comment:' || c.id, 'reel_comment', r.id,
      coalesce(a.username, a.display_name, 'Worth It? member'), r.caption, c.created_at
    from public.social_reels r join public.social_comments c on c.reel_id = r.id
    left join public.social_profiles a on a.id = c.author_id
    where r.author_id = auth.uid() and c.author_id <> auth.uid()
    union all
    select 'follow:' || f.follower_id, case when f.accepted then 'follow' else 'follow_request' end, f.follower_id,
      coalesce(a.username, a.display_name, 'Worth It? member'), '', f.created_at
    from public.social_follows f join public.social_profiles a on a.id = f.follower_id
    where f.following_id = auth.uid()
    union all
    select 'decision:' || p.id, 'purchase_update', p.id,
      coalesce(a.username, a.display_name, 'Worth It? shopper'),
      p.item_name || ' ? ' || case
        when u.status = 'returned' then 'Returned'
        when u.status = 'passed' then 'Passed'
        when u.would_buy_again is not null then 'After-buy verdict'
        else 'Bought' end, u.updated_at
    from public.votes v join public.purchase_updates u on u.poll_id = v.poll_id
    join public.polls p on p.id = u.poll_id
    left join public.social_profiles a on a.id = p.author_id
    where v.voter_id = auth.uid() and public.worthit_post_access(p.author_id,p.archived_at)
      and not p.is_demo and u.updated_at >= v.created_at
    union all
    select 'reminder:' || p.id, 'after_buy_reminder', p.id, 'Worth It?', p.item_name,
      u.purchased_at + interval '7 days'
    from public.purchase_updates u join public.polls p on p.id = u.poll_id
    where p.author_id = auth.uid() and u.status = 'bought' and u.would_buy_again is null
      and u.purchased_at <= now() - interval '7 days'
  ) activity
  order by activity.created_at desc, activity.id desc limit 50;
$$;

create or replace function public.worthit_media_derivatives(p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('poll_id',j.poll_id,'reel_id',j.reel_id,'source_path',j.source_path,'preview_path',j.preview_path,'playback_path',j.playback_path,'state',j.state)),'[]'::jsonb)
 from public.media_jobs j where (j.poll_id=any(p_ids) or j.reel_id=any(p_ids)) and public.can_view_social_content(j.owner_id)
 and (j.owner_id=auth.uid() or (exists(select 1 from public.polls p where p.id=j.poll_id and p.archived_at is null)
 or exists(select 1 from public.social_reels r where r.id=j.reel_id and r.archived_at is null)));
$$;


create or replace function public.worthit_discovery_unfiltered(p_category text, p_min integer, p_max integer, p_query text, p_needs_answer boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.post order by d.helpful, d.replies, d.created_at desc, d.id desc), '[]'::jsonb)
  from (
    select p.id, p.created_at,
      case when p_needs_answer then v.helpful else 0 end as helpful,
      case when p_needs_answer then v.replies else 0 end as replies,
      jsonb_build_object('id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
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
    where not p.is_demo and p.archived_at is null and public.can_view_social_content(p.author_id) and not coalesce(a.is_private, false)
      and (p_category is null or p.category = p_category)
      and (p_min is null or p.price_inr >= p_min) and (p_max is null or p.price_inr <= p_max)
      and (p_query is null or (char_length(p_query) <= 2048 and
        (strpos(lower(p.item_name), lower(p_query)) > 0 or p.product_url = p_query)))
      and (not p_needs_answer or (u.poll_id is null and v.helpful = 0))
    order by helpful, replies, p.created_at desc, p.id desc limit 50
  ) d;
$$;

create or replace function public.worthit_original_object_access(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select (p_bucket='social-media' and (
 exists(select 1 from public.social_profiles where avatar_path=p_name and public.can_view_social_content(id))
 or exists(select 1 from public.social_reels where video_path=p_name and public.worthit_post_access(author_id,archived_at))
 )) or (p_bucket in ('poll-photos','social-media') and exists(
 select 1 from public.polls p where split_part(p_name,'/',1)=p.author_id::text and public.worthit_post_access(p.author_id,p.archived_at)
 and ((p_bucket='poll-photos' and p.image_path=p_name)
 or exists(select 1 from jsonb_array_elements(p.media_gallery) item where
 (item->>'kind'=case when p_bucket='poll-photos' then 'image' else 'video' end and item->>'value'=p_name)
 or (p_bucket='poll-photos' and item->>'kind'='image' and item->>'thumbnail'=p_name
 and p_name=p.author_id::text||'/thumbnails/'||split_part(item->>'value','/',2))
 ))));
$$;

create or replace function public.can_read_social_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select (
 public.worthit_original_object_access(p_bucket,p_name)
 and not exists(select 1 from public.polls p where p.media_state<>'ready' and (p.image_path=p_name or exists(select 1 from jsonb_array_elements(p.media_gallery) m where m->>'value'=p_name or m->>'thumbnail'=p_name)))
 and not exists(select 1 from public.media_jobs j left join public.polls p on p.id=j.poll_id left join public.social_reels r on r.id=j.reel_id
 where j.bucket=p_bucket and j.source_path=p_name and coalesce(p.media_state,r.media_state,'failed')<>'ready')
 ) or exists(select 1 from public.media_jobs j left join public.polls p on p.id=j.poll_id left join public.social_reels r on r.id=j.reel_id
 where j.bucket=p_bucket and j.state='ready' and (j.preview_path=p_name or j.playback_path=p_name)
 and coalesce(p.media_state,r.media_state,'failed')='ready' and public.worthit_post_access(j.owner_id,coalesce(p.archived_at,r.archived_at)));
$$;

create or replace function public.report_content(p_kind text,p_target uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report.' using errcode='42501'; end if;
 perform public.worthit_use_quota('reports',1,20);
 if not (
 (p_kind='poll' and exists(select 1 from public.polls where id=p_target and public.worthit_post_access(author_id,archived_at)))
 or (p_kind='reel' and exists(select 1 from public.social_reels where id=p_target and public.worthit_post_access(author_id,archived_at)))
 or (p_kind='account' and exists(select 1 from public.social_profiles where id=p_target))
 ) then raise exception 'Content unavailable.' using errcode='P0002'; end if;
 insert into public.content_reports(reporter,kind,target,reason) values(auth.uid(),p_kind,p_target,btrim(p_reason))
 on conflict(reporter,kind,target) do update set reason=excluded.reason,status='open';
end $$;

notify pgrst,'reload schema';
commit;
