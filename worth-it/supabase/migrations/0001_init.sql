-- Worth It? — schema, access policies, RPCs and photo storage.
-- Requires Supabase Auth with "Allow anonymous sign-ins" enabled (guests get a real auth.uid()).

-- ───────── Tables ─────────
create table public.polls (
  id          uuid primary key default gen_random_uuid(),   -- unguessable; the share link is /p/<id>
  author_id   uuid references auth.users (id) on delete cascade,
  item_name   text    not null check (char_length(btrim(item_name)) between 1 and 80),
  price_inr   integer not null check (price_inr > 0 and price_inr <= 10000000),
  question    text    not null check (char_length(btrim(question)) between 1 and 200),
  image_path  text    check (image_path is null or char_length(image_path) <= 300),
  demo_image  text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint polls_demo_or_authored check (
    (is_demo and author_id is null) or (not is_demo and author_id is not null and image_path is not null)
  )
);

create table public.votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  voter_id   uuid not null,                     -- auth.uid() of the account or guest session
  choice     text not null check (choice in ('buy', 'wait', 'skip')),
  reason     text check (reason is null or char_length(reason) <= 280),
  owns_item  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)                    -- one vote per account / guest session per poll
);

create table public.purchase_updates (
  poll_id        uuid primary key references public.polls (id) on delete cascade,
  status         text not null check (status in ('bought', 'passed')),
  price_paid_inr integer check (price_paid_inr is null or (price_paid_inr > 0 and price_paid_inr <= 10000000)),
  review         text check (review is null or char_length(review) <= 280),
  store_url      text check (store_url is null or (char_length(store_url) <= 500 and store_url ~* '^https?://')),
  is_affiliate   boolean not null default false,
  updated_at     timestamptz not null default now(),
  constraint bought_needs_price  check (status <> 'bought' or price_paid_inr is not null),
  constraint passed_is_bare      check (status <> 'passed' or (price_paid_inr is null and review is null and store_url is null and not is_affiliate)),
  constraint affiliate_needs_url check (not is_affiliate or store_url is not null)
);

create index votes_poll_idx on public.votes (poll_id, created_at desc);
create index polls_author_idx on public.polls (author_id, created_at desc);

-- ───────── Row level security ─────────
-- Tables are NOT publicly readable. Visitors read a poll only through get_poll_view(<id>), so the link is
-- the only way in: there is no query that lists other people's polls.
alter table public.polls            enable row level security;
alter table public.votes            enable row level security;
alter table public.purchase_updates enable row level security;

create policy polls_author_select on public.polls for select to authenticated
  using (author_id = auth.uid());
create policy polls_author_insert on public.polls for insert to authenticated
  with check (author_id = auth.uid() and not is_demo);
create policy polls_author_update on public.polls for update to authenticated
  using (author_id = auth.uid() and not is_demo) with check (author_id = auth.uid() and not is_demo);
create policy polls_author_delete on public.polls for delete to authenticated
  using (author_id = auth.uid() and not is_demo);

-- Voters can see only their own vote row directly. Inserts happen through cast_vote().
create policy votes_own_select on public.votes for select to authenticated
  using (voter_id = auth.uid());

-- Only the poll's author can create, change or remove the purchase update.
create policy updates_author_select on public.purchase_updates for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid()));
create policy updates_author_insert on public.purchase_updates for insert to authenticated
  with check (exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid() and not p.is_demo));
create policy updates_author_update on public.purchase_updates for update to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid() and not p.is_demo))
  with check (exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid() and not p.is_demo));
create policy updates_author_delete on public.purchase_updates for delete to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid() and not p.is_demo));

-- Defence in depth: the browser role never needs to write votes directly or touch anything as `anon`.
revoke all on public.polls, public.votes, public.purchase_updates from anon;
revoke insert, update, delete on public.votes from authenticated;

-- ───────── RPCs (security definer, minimal output) ─────────
-- Never returns author_id or voter_id.
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
  from public.polls p where p.id = p_id;
$$;

-- p_demo = true  -> the shared sample polls. p_demo = false -> polls the caller created.
create or replace function public.list_polls(p_demo boolean)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json_poll order by sort_key), '[]'::jsonb) from (
    select jsonb_build_object(
             'id', p.id, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
             'image_path', p.image_path, 'demo_image', p.demo_image, 'is_demo', p.is_demo, 'created_at', p.created_at,
             'vote_count', (select count(*) from public.votes v where v.poll_id = p.id),
             'update_status', (select u.status from public.purchase_updates u where u.poll_id = p.id)
           ) as row_to_json_poll,
           case when p_demo then p.price_inr::double precision else -extract(epoch from p.created_at) end as sort_key
    from public.polls p
    where (p_demo and p.is_demo) or (not p_demo and auth.uid() is not null and p.author_id = auth.uid())
  ) s;
$$;

create or replace function public.cast_vote(p_id uuid, p_choice text, p_reason text, p_owns boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_poll public.polls;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into v_poll from public.polls where id = p_id;
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

-- Supabase's default privileges grant EXECUTE on new functions to anon/authenticated, so revoke explicitly first.
revoke all on function public.get_poll_view(uuid), public.list_polls(boolean), public.cast_vote(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_poll_view(uuid), public.list_polls(boolean) to anon, authenticated;
grant execute on function public.cast_vote(uuid, text, text, boolean) to authenticated;

-- ───────── Storage: photos ─────────
-- Public bucket: anyone who knows the (random) object URL can load the photo. The link is unlisted, not private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poll-photos', 'poll-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under <auth.uid()>/<random>.jpg. Only that user may write or delete there; nobody can list.
create policy poll_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'poll-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy poll_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'poll-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy poll_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'poll-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy poll_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'poll-photos' and (storage.foldername(name))[1] = auth.uid()::text);
