begin;

alter table public.social_profiles add column is_private boolean not null default false;

create table public.social_follows (
  follower_id uuid not null references public.social_profiles(id) on delete cascade,
  following_id uuid not null references public.social_profiles(id) on delete cascade,
  accepted boolean not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index social_follows_incoming on public.social_follows (following_id, accepted, created_at);
alter table public.social_follows enable row level security;
revoke all on public.social_follows from public, anon, authenticated;
revoke update on public.social_profiles from authenticated;
grant update (id, display_name, username, bio, avatar_path) on public.social_profiles to authenticated;
revoke insert on public.social_profiles from authenticated;
grant insert (id, display_name, username, bio, avatar_path) on public.social_profiles to authenticated;

create function public.can_view_social_content(p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_author is not null and (
    p_author is not distinct from auth.uid()
    or not exists (select 1 from public.social_profiles p where p.id = p_author and p.is_private)
    or exists (select 1 from public.social_follows f
      where f.following_id = p_author and f.follower_id = auth.uid() and f.accepted)
  );
$$;

create function public.social_profile_card(p_id uuid)
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
  where auth.uid() is not null and p.id = p_id and (p.username is not null or p.id = auth.uid());
$$;

create function public.search_social_profiles(p_query text)
returns table (id uuid, username text, avatar_path text, is_private boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar_path, p.is_private
  from public.social_profiles p
  where auth.uid() is not null and length(p_query) between 1 and 40
    and starts_with(p.username, lower(p_query))
  order by (p.username = lower(p_query)) desc, p.username limit 30;
$$;

create function public.set_social_follow(p_id uuid, p_follow boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare private_account boolean;
begin
  if auth.uid() is null or p_id = auth.uid() then
    raise exception 'Choose another profile to follow.' using errcode = '22023';
  end if;
  if not p_follow then
    delete from public.social_follows where follower_id = auth.uid() and following_id = p_id;
    return;
  end if;
  if not exists (select 1 from public.social_profiles where id = auth.uid() and username is not null) then
    raise exception 'Set a username in your profile before following someone.' using errcode = '22023';
  end if;
  select is_private into private_account from public.social_profiles
  where id = p_id and username is not null for no key update;
  if not found then raise exception 'This profile is unavailable.' using errcode = 'P0002'; end if;
  insert into public.social_follows (follower_id, following_id, accepted)
  values (auth.uid(), p_id, not private_account) on conflict do nothing;
end;
$$;

create function public.list_social_follow_requests()
returns table (id uuid, username text, avatar_path text, is_private boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar_path, p.is_private
  from public.social_follows f join public.social_profiles p on p.id = f.follower_id
  where f.following_id = auth.uid() and not f.accepted
  order by f.created_at, f.follower_id;
$$;

create function public.respond_social_follow(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_accept then
    update public.social_follows set accepted = true
    where following_id = auth.uid() and follower_id = p_id and not accepted;
  else
    delete from public.social_follows
    where following_id = auth.uid() and follower_id = p_id and not accepted;
  end if;
end;
$$;

create function public.set_social_privacy(p_private boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.social_profiles set is_private = p_private where id = auth.uid();
  if not found then raise exception 'Save your profile before setting account privacy.' using errcode = '22023'; end if;
  if not p_private then
    update public.social_follows set accepted = true where following_id = auth.uid() and not accepted;
  end if;
end;
$$;

create function public.list_social_polls(p_author uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(post order by created_at desc, id desc), '[]'::jsonb) from (
    select p.id, p.created_at, jsonb_build_object(
      'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
      'image_path', p.image_path, 'is_demo', false, 'created_at', p.created_at,
      'author_id', a.id, 'username', a.username,
      'vote_count', (select count(*) from public.votes v where v.poll_id = p.id),
      'update_status', (select u.status from public.purchase_updates u where u.poll_id = p.id)
    ) as post
    from public.polls p join public.social_profiles a on a.id = p.author_id
    where auth.uid() is not null and not p.is_demo and public.can_view_social_content(p.author_id)
      and ((p_author is not null and p.author_id = p_author) or (p_author is null and exists (
        select 1 from public.social_follows f
        where f.follower_id = auth.uid() and f.following_id = p.author_id and f.accepted)))
    order by p.created_at desc, p.id desc limit 60
  ) visible;
$$;

revoke all on function public.can_view_social_content(uuid), public.social_profile_card(uuid),
  public.search_social_profiles(text), public.set_social_follow(uuid, boolean),
  public.list_social_follow_requests(), public.respond_social_follow(uuid, boolean),
  public.set_social_privacy(boolean), public.list_social_polls(uuid) from public, anon, authenticated;
grant execute on function public.can_view_social_content(uuid) to anon, authenticated;
grant execute on function public.social_profile_card(uuid), public.search_social_profiles(text),
  public.set_social_follow(uuid, boolean), public.list_social_follow_requests(),
  public.respond_social_follow(uuid, boolean), public.set_social_privacy(boolean),
  public.list_social_polls(uuid) to authenticated;

-- A viewer can read media only through an accessible poll, reel or profile.
create function public.can_read_social_object(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (
    p_bucket = 'social-media' and (
      exists (select 1 from public.social_profiles p where p.avatar_path = p_name
        and (p.username is not null or public.can_view_social_content(p.id)))
      or exists (select 1 from public.social_reels r where r.video_path = p_name
        and public.can_view_social_content(r.author_id))
    )
  ) or (
    p_bucket in ('poll-photos', 'social-media') and exists (
      select 1 from public.polls p
      where split_part(p_name, '/', 1) = p.author_id::text
        and public.can_view_social_content(p.author_id)
        and ((p_bucket = 'poll-photos' and p.image_path = p_name)
          or p.media_gallery @> jsonb_build_array(jsonb_build_object('value', p_name, 'kind',
            case when p_bucket = 'poll-photos' then 'image' else 'video' end)))
    )
  );
$$;
revoke all on function public.can_read_social_object(text, text) from public, anon, authenticated;
grant execute on function public.can_read_social_object(text, text) to anon, authenticated;
create policy social_media_read_visible on storage.objects for select to anon, authenticated
  using (bucket_id in ('poll-photos', 'social-media') and public.can_read_social_object(bucket_id, name));
update storage.buckets set public = false where id in ('poll-photos', 'social-media');

-- Guard the existing share, interaction and media endpoints as well as the new feeds.
create or replace function public.get_poll_view(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'poll', jsonb_build_object(
      'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
      'image_path', p.image_path, 'demo_image', p.demo_image, 'is_demo', p.is_demo, 'created_at', p.created_at),
    'is_author', (p.author_id is not null and p.author_id = auth.uid()),
    'my_choice', (select v.choice from public.votes v where v.poll_id = p.id and v.voter_id = auth.uid()),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'choice', v.choice, 'reason', v.reason,
                                          'owns_item', v.owns_item, 'created_at', v.created_at)
                       order by v.created_at desc)
      from public.votes v where v.poll_id = p.id), '[]'::jsonb),
    'update', (select jsonb_build_object('status', u.status, 'price_paid_inr', u.price_paid_inr, 'review', u.review,
                                         'store_url', u.store_url, 'is_affiliate', u.is_affiliate, 'updated_at', u.updated_at)
               from public.purchase_updates u where u.poll_id = p.id)
  )
  from public.polls p where p.id = p_id and (p.is_demo or public.can_view_social_content(p.author_id));
$$;

create or replace function public.cast_vote(p_id uuid, p_choice text, p_reason text, p_owns boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_poll public.polls;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into v_poll from public.polls where id = p_id and (is_demo or public.can_view_social_content(author_id));
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

create or replace function public.get_poll_extras(p_ids uuid[])
returns table (id uuid, product_url text, stars bigint, starred boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.product_url,
    (select count(*) from public.poll_stars s where s.poll_id = p.id),
    exists (select 1 from public.poll_stars s where s.poll_id = p.id and s.viewer_id = auth.uid())
  from public.polls p where p.id = any(p_ids) and (p.is_demo or public.can_view_social_content(p.author_id));
$$;

create or replace function public.set_poll_star(p_id uuid, p_starred boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.polls where id = p_id and (is_demo or public.can_view_social_content(author_id))) then
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

create or replace function public.get_poll_media(p_ids uuid[])
returns table (id uuid, media jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.media_gallery from public.polls p
  where p.id = any(p_ids) and p.media_gallery <> '[]'::jsonb
    and (p.is_demo or public.can_view_social_content(p.author_id));
$$;

create or replace function public.social_set_reel_like(p_reel uuid, p_liked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.social_reels r where r.id = p_reel and public.can_view_social_content(r.author_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_liked then
    insert into public.social_reel_likes (reel_id, viewer_id) values (p_reel, auth.uid()) on conflict do nothing;
  else
    delete from public.social_reel_likes where reel_id = p_reel and viewer_id = auth.uid();
  end if;
end;
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
  where auth.uid() is not null and public.can_view_social_content(r.author_id)
    and (p_author is null or r.author_id = p_author)
    and (not p_following or exists (select 1 from public.social_follows f
      where f.follower_id = auth.uid() and f.following_id = r.author_id and f.accepted))
  order by r.created_at desc, r.id desc
  limit 60;
$$;

create or replace function public.social_reel_feed(p_author uuid default null)
returns table (id uuid, author_id uuid, caption text, created_at timestamptz, video_path text,
  display_name text, bio text, avatar_path text, liked boolean, likes bigint)
language sql stable security definer set search_path = '' as $$
  select * from public.list_visible_reels(p_author, false);
$$;

revoke all on function public.list_visible_reels(uuid, boolean) from public, anon, authenticated;
grant execute on function public.list_visible_reels(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
