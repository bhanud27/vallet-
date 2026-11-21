-- Regular posts reuse polls, media, Stars, comments, privacy and owner management.
-- Existing polls retain their type, prices, questions and identifiers.
begin;
alter table public.polls add column content_type text not null default 'poll' check(content_type in ('poll','post'));
alter table public.polls alter column price_inr drop not null;
alter table public.polls drop constraint polls_question_check;
alter table public.polls add constraint polls_content_details check (
 (content_type='poll' and price_inr is not null and char_length(btrim(question)) between 1 and 200)
 or (content_type='post' and not is_demo and price_inr is null and char_length(question)<=2000
 and (image_path is not null or jsonb_array_length(media_gallery)>0))
);
-- Extra enforcement on direct table writes as well as RPCs.
create function public.worthit_poll_interaction_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.polls where id=new.poll_id and content_type='post') then
 raise exception 'Posts do not have votes or purchase updates.' using errcode='22023';end if;
 return new;
end $$;
create trigger worthit_poll_votes before insert or update on public.votes for each row execute function public.worthit_poll_interaction_guard();
create trigger worthit_poll_updates before insert or update on public.purchase_updates for each row execute function public.worthit_poll_interaction_guard();
revoke all on function public.worthit_poll_interaction_guard() from public,anon,authenticated;
create or replace function public.list_polls(p_demo boolean)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json_poll order by sort_key), '[]'::jsonb) from (
    select jsonb_build_object(
             'content_type',p.content_type,'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
             'image_path', p.image_path, 'demo_image', p.demo_image, 'is_demo', p.is_demo, 'created_at', p.created_at, 'archived_at',p.archived_at,'edited_at',p.edited_at,
             'vote_count', (select count(*) from public.votes v where v.poll_id = p.id),
             'update_status', (select u.status from public.purchase_updates u where u.poll_id = p.id)
           ) as row_to_json_poll,
           case when p_demo then p.price_inr::double precision else -extract(epoch from p.created_at) end as sort_key
    from public.polls p
    where p.archived_at is null and ((p_demo and p.is_demo) or (not p_demo and auth.uid() is not null and p.author_id = auth.uid()))
  ) s;
$$;
create or replace function public.list_social_polls(p_author uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(post order by created_at desc, id desc), '[]'::jsonb) from (
    select p.id, p.created_at, jsonb_build_object(
      'content_type',p.content_type,'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
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
create or replace function public.get_poll_view(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'poll', jsonb_build_object(
      'content_type',p.content_type,'id', p.id, 'category', p.category, 'use_case', p.use_case, 'priority', p.priority,
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
create or replace function public.worthit_discovery_unfiltered(p_category text, p_min integer, p_max integer, p_query text, p_needs_answer boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.post order by d.helpful, d.replies, d.created_at desc, d.id desc), '[]'::jsonb)
  from (
    select p.id, p.created_at,
      case when p_needs_answer then v.helpful else 0 end as helpful,
      case when p_needs_answer then v.replies else 0 end as replies,
      jsonb_build_object('content_type',p.content_type,'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
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
        (strpos(lower(p.item_name), lower(p_query)) > 0 or (p.content_type='post' and strpos(lower(p.question),lower(p_query))>0) or p.product_url = p_query)))
      and (not p_needs_answer or (p.content_type='poll' and u.poll_id is null and v.helpful = 0))
    order by helpful, replies, p.created_at desc, p.id desc limit 50
  ) d;
$$;
create or replace function public.list_product_history(p_url text, p_current uuid)
returns table (id uuid, item_name text, price_inr integer, created_at timestamptz,
  price_paid_inr integer, purchased_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.item_name, p.price_inr, p.created_at, u.price_paid_inr, u.purchased_at, u.status
  from public.polls p left join public.purchase_updates u on u.poll_id = p.id
  where (public.worthit_product_key(p.product_url) = public.worthit_product_key(p_url) or (p.product_url is null and public.worthit_product_key(u.store_url) = public.worthit_product_key(p_url)))
    and p.content_type='poll' and not p.is_demo and p.archived_at is null and p.id is distinct from p_current
    and public.worthit_post_access(p.author_id,p.archived_at)
  order by p.created_at desc, p.id desc limit 12;
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
  if v_poll.content_type='post' then raise exception 'Posts do not have votes.' using errcode='22023';end if;
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
create or replace function public.worthit_manage_post(p_kind text,p_id uuid,p_action text,p_values jsonb default '{}'::jsonb)
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
 if exists(select 1 from public.polls where id=p_id and content_type='post') then
 if p_values->>'question' is null then raise exception 'Enter a caption.' using errcode='22023';end if;
 update public.polls set item_name=coalesce(nullif(left(btrim(p_values->>'question'),80),''),'Fashion post'),question=btrim(p_values->>'question'),product_url=link,edited_at=now() where id=p_id;
 else
 if p_values->>'itemName' is null or p_values->>'question' is null or p_values->>'priceInr' is null
 then raise exception 'Enter the poll details.' using errcode='22023';end if;
 update public.polls set item_name=btrim(p_values->>'itemName'),question=btrim(p_values->>'question'),
 price_inr=(p_values->>'priceInr')::integer,product_url=link,edited_at=now() where id=p_id;
 end if;
 else
 if p_values->>'caption' is null then raise exception 'Enter a caption.' using errcode='22023';end if;
 update public.social_reels set caption=btrim(p_values->>'caption'),product_url=link,edited_at=now() where id=p_id;
 end if;
 else raise exception 'Invalid action.' using errcode='22023';end if;
end $$;

-- Existing unique (reel_id,viewer_id) is the authority for exactly one Star.
-- Serialize reactions on a Check so the returned total reflects committed writes.
create function public.worthit_set_check_star(p_id uuid,p_starred boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_starred is null then raise exception 'Invalid Star state.' using errcode='22023';end if;
 perform 1 from public.social_reels where id=p_id and public.worthit_post_access(author_id,archived_at) for update;
 if not found then raise exception 'Check unavailable.' using errcode='P0002';end if;
 perform public.social_set_reel_like(p_id,p_starred);
 return jsonb_build_object('starred',exists(select 1 from public.social_reel_likes where reel_id=p_id and viewer_id=auth.uid()),'count',(select count(*) from public.social_reel_likes where reel_id=p_id));
end $$;
revoke all on function public.worthit_set_check_star(uuid,boolean) from public,anon,authenticated;
grant execute on function public.worthit_set_check_star(uuid,boolean) to authenticated;

-- Accepted connections only; authorize the profile before pagination. Hidden
-- accounts and blocked relationships never leak through follower/following lists.
create function public.worthit_connections(p_id uuid,p_kind text,p_after uuid default null)
returns table(id uuid,username text,avatar_path text,is_private boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_kind not in ('followers','following') or p_kind is null then raise exception 'Invalid connection list.' using errcode='22023';end if;
 if not public.can_view_social_content(p_id) then raise exception 'This profile is private or unavailable.' using errcode='42501';end if;
 return query select a.id,a.username,a.avatar_path,a.is_private from public.social_follows f join public.social_profiles a
 on a.id=case when p_kind='followers' then f.follower_id else f.following_id end
 where f.accepted and (case when p_kind='followers' then f.following_id else f.follower_id end)=p_id
 and (p_after is null or a.id>p_after) and not a.is_suspended
 and not exists(select 1 from public.account_deletion_requests where user_id=a.id)
 and not exists(select 1 from public.account_blocks where (blocker=auth.uid() and blocked=a.id) or (blocked=auth.uid() and blocker=a.id))
 order by a.id limit 50;
end $$;
revoke all on function public.worthit_connections(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.worthit_connections(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
