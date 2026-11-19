alter table public.social_profiles
  add column username text
  constraint social_profiles_username_format check (username ~ '^[a-z0-9_]{3,40}$')
  constraint social_profiles_username_unique unique;

-- Keep original names for older clients. Assign each existing profile a unique handle.
with candidates as (
  select id, lower(btrim(display_name) collate "C") as candidate
  from public.social_profiles
), ranked as (
  select id, candidate, row_number() over (partition by candidate order by id) as position,
    row_number() over (order by id) as fallback_number
  from candidates
)
update public.social_profiles p
set username = case
  when r.position = 1 and r.candidate ~ '^[a-z0-9_]{3,40}$'
    and r.candidate !~ '^shopper_[0-9]+$' then r.candidate
  else 'shopper_' || r.fallback_number
end
from ranked r
where r.id = p.id;

create function public.worthit_username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_username ~ '^[a-z0-9_]{3,40}$' and not exists (
    select 1 from public.social_profiles p
    where p.username = p_username and p.id is distinct from auth.uid()
  ), false);
$$;

revoke all on function public.worthit_username_available(text) from public, anon, authenticated;
grant execute on function public.worthit_username_available(text) to anon, authenticated;

create or replace function public.sync_worthit_signup_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_username text := new.raw_user_meta_data->>'worthit_username';
  new_name text := left(btrim(new.raw_user_meta_data->>'worthit_display_name'), 40);
begin
  if new_username is not null then
    if tg_op = 'UPDATE' then
      if new_username is not distinct from old.raw_user_meta_data->>'worthit_username' then return new; end if;
    end if;
    insert into public.social_profiles (id, display_name, username)
    values (new.id, new_username, new_username)
    on conflict (id) do update set username = excluded.username;
  elsif new_name is not null and new_name <> '' then
    if tg_op = 'UPDATE' then
      if new.raw_user_meta_data->>'worthit_display_name' is not distinct from
        old.raw_user_meta_data->>'worthit_display_name' then return new; end if;
    end if;
    insert into public.social_profiles (id, display_name) values (new.id, new_name)
    on conflict (id) do update set display_name = excluded.display_name;
  end if;
  return new;
end;
$$;

create or replace function public.social_reel_feed(p_author uuid default null)
returns table (id uuid, author_id uuid, caption text, created_at timestamptz, video_path text,
  display_name text, bio text, avatar_path text, liked boolean, likes bigint)
language sql stable security definer set search_path = '' as $$
  select r.id, r.author_id, r.caption, r.created_at, r.video_path,
    coalesce(p.username, p.display_name, ''), ''::text, p.avatar_path,
    exists (select 1 from public.social_reel_likes l where l.reel_id = r.id and l.viewer_id = auth.uid()),
    (select count(*) from public.social_reel_likes l where l.reel_id = r.id)
  from public.social_reels r
  left join public.social_profiles p on p.id = r.author_id
  where auth.uid() is not null and (p_author is null or r.author_id = p_author)
  order by r.created_at desc, r.id desc
  limit 60;
$$;
