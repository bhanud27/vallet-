begin;

alter table public.social_reels add column product_url text
  check (product_url is null or (
    char_length(product_url) <= 2048 and product_url ~ '^https://[^/@[:space:]]+([/?#]|$)'
  ));

create table public.social_comments (
  id uuid primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  poll_id uuid references public.polls(id) on delete cascade,
  reel_id uuid references public.social_reels(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  check ((poll_id is null) <> (reel_id is null))
);
create index social_comments_poll_recent on public.social_comments (poll_id, created_at desc, id desc) where poll_id is not null;
create index social_comments_reel_recent on public.social_comments (reel_id, created_at desc, id desc) where reel_id is not null;
alter table public.social_comments enable row level security;
revoke all on public.social_comments from public, anon, authenticated;

create function public.can_access_comment_thread(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and case p_kind
    when 'poll' then exists (
      select 1 from public.polls p where p.id = p_id and (p.is_demo or public.can_view_social_content(p.author_id)))
    when 'reel' then exists (
      select 1 from public.social_reels r where r.id = p_id and public.can_view_social_content(r.author_id))
    else false end;
$$;

create function public.list_social_comments(p_kind text, p_id uuid)
returns table (id uuid, username text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_comment_thread(p_kind, p_id) then
    raise exception 'This comment thread is unavailable.' using errcode = 'P0002';
  end if;
  return query
    select c.id, coalesce(p.username, p.display_name, 'Worth It? member'), c.body, c.created_at
    from public.social_comments c left join public.social_profiles p on p.id = c.author_id
    where (p_kind = 'poll' and c.poll_id = p_id) or (p_kind = 'reel' and c.reel_id = p_id)
    order by c.created_at desc, c.id desc limit 50;
end;
$$;

create function public.add_social_comment(p_kind text, p_id uuid, p_comment_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_comment_thread(p_kind, p_id) then
    raise exception 'This comment thread is unavailable.' using errcode = 'P0002';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception 'Write a comment between 1 and 500 characters.' using errcode = '22023';
  end if;
  insert into public.social_comments (id, author_id, poll_id, reel_id, body)
  values (p_comment_id, auth.uid(), case when p_kind = 'poll' then p_id end,
    case when p_kind = 'reel' then p_id end, btrim(p_body))
  on conflict (id) do nothing;
end;
$$;

create function public.get_reel_product_links(p_ids uuid[])
returns table (id uuid, product_url text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.product_url from public.social_reels r
  where auth.uid() is not null and r.id = any(p_ids) and r.product_url is not null
    and public.can_view_social_content(r.author_id);
$$;

create function public.list_social_notifications()
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
  ) activity
  order by activity.created_at desc, activity.id desc limit 50;
$$;

revoke all on function public.can_access_comment_thread(text, uuid),
  public.list_social_comments(text, uuid), public.add_social_comment(text, uuid, uuid, text),
  public.get_reel_product_links(uuid[]), public.list_social_notifications() from public, anon, authenticated;
grant execute on function public.list_social_comments(text, uuid), public.add_social_comment(text, uuid, uuid, text),
  public.get_reel_product_links(uuid[]), public.list_social_notifications() to authenticated;

notify pgrst, 'reload schema';
commit;
