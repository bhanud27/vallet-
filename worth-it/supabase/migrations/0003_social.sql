create table public.social_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 150),
  avatar_path text check (avatar_path is null or avatar_path like id::text || '/avatars/%.jpg')
);

create table public.social_reels (
  id uuid primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 180),
  video_path text not null check (video_path = author_id::text || '/reels/' || id::text || '.mp4'),
  created_at timestamptz not null default now()
);

create table public.social_reel_likes (
  reel_id uuid references public.social_reels (id) on delete cascade,
  viewer_id uuid references auth.users (id) on delete cascade,
  primary key (reel_id, viewer_id)
);

create index social_reels_recent on public.social_reels (created_at desc, id desc);
create index social_reels_by_author on public.social_reels (author_id, created_at desc, id desc);

alter table public.social_profiles enable row level security;
alter table public.social_reels enable row level security;
alter table public.social_reel_likes enable row level security;

revoke all on public.social_profiles, public.social_reels, public.social_reel_likes from anon, authenticated;
grant select, insert, update on public.social_profiles to authenticated;
grant insert on public.social_reels to authenticated;

create policy social_profile_read_own on public.social_profiles for select to authenticated using (id = auth.uid());
create policy social_profile_insert_own on public.social_profiles for insert to authenticated with check (id = auth.uid());
create policy social_profile_update_own on public.social_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy social_reel_insert_own on public.social_reels for insert to authenticated
  with check (author_id = auth.uid());

create function public.social_reel_feed(p_author uuid default null)
returns table (id uuid, author_id uuid, caption text, created_at timestamptz, video_path text,
  display_name text, bio text, avatar_path text, liked boolean, likes bigint)
language sql stable security definer set search_path = '' as $$
  select r.id, r.author_id, r.caption, r.created_at, r.video_path,
    coalesce(p.display_name, ''), ''::text, p.avatar_path,
    exists (select 1 from public.social_reel_likes l where l.reel_id = r.id and l.viewer_id = auth.uid()),
    (select count(*) from public.social_reel_likes l where l.reel_id = r.id)
  from public.social_reels r
  left join public.social_profiles p on p.id = r.author_id
  where auth.uid() is not null and (p_author is null or r.author_id = p_author)
  order by r.created_at desc, r.id desc
  limit 60;
$$;

create function public.social_set_reel_like(p_reel uuid, p_liked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_liked then
    insert into public.social_reel_likes (reel_id, viewer_id) values (p_reel, auth.uid()) on conflict do nothing;
  else
    delete from public.social_reel_likes where reel_id = p_reel and viewer_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.social_reel_feed(uuid), public.social_set_reel_like(uuid, boolean) from public, anon;
grant execute on function public.social_reel_feed(uuid), public.social_set_reel_like(uuid, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', true, 20971520, array['image/jpeg', 'video/mp4']);

create policy social_media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy social_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy social_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);
