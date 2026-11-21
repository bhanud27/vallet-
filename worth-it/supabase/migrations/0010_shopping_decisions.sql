begin;

alter table public.polls
  add column category text check (category in ('audio', 'electronics', 'fashion', 'home', 'fitness', 'other')),
  add column use_case text check (char_length(use_case) <= 120),
  add column priority text check (char_length(priority) <= 120),
  add column budget_inr integer check (budget_inr between 1 and 10000000);
create index polls_discovery_recent on public.polls (created_at desc, id desc) where not is_demo;
create index polls_exact_product_link on public.polls (product_url, created_at desc) where product_url is not null and not is_demo;

alter table public.votes add column helpful_at timestamptz;

alter table public.purchase_updates
  drop constraint purchase_updates_status_check,
  drop constraint bought_needs_price,
  add column purchased_at timestamptz,
  add column would_buy_again boolean,
  add constraint purchase_updates_status_check check (status in ('bought', 'passed', 'returned')),
  add constraint bought_needs_price check (status = 'passed' or price_paid_inr is not null),
  add constraint returned_needs_reason check (status <> 'returned' or nullif(btrim(review), '') is not null),
  add constraint returned_has_no_store_link check (status <> 'returned' or (store_url is null and not is_affiliate)),
  add constraint verdict_requires_purchase check (status = 'bought' or would_buy_again is null);

update public.purchase_updates set purchased_at = updated_at where status = 'bought';

create function public.stamp_purchase_outcome()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'passed' then
    new.purchased_at := null;
  elsif tg_op = 'UPDATE' and old.purchased_at is not null then
    new.purchased_at := old.purchased_at;
  else
    new.purchased_at := now();
  end if;

  if tg_op = 'UPDATE' and row(new.status, new.price_paid_inr, new.review, new.store_url, new.is_affiliate, new.would_buy_again)
    is not distinct from row(old.status, old.price_paid_inr, old.review, old.store_url, old.is_affiliate, old.would_buy_again) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger stamp_purchase_outcome before insert or update on public.purchase_updates
for each row execute function public.stamp_purchase_outcome();

create function public.mark_poll_reason_helpful(p_poll uuid, p_vote uuid, p_helpful boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.polls p where p.id = p_poll and p.author_id = auth.uid() and not p.is_demo) then
    raise exception 'Only the shopper who posted this poll can mark reasons helpful.' using errcode = '42501';
  end if;
  update public.votes v set helpful_at = case when p_helpful then coalesce(v.helpful_at, now()) else null end
    where v.id = p_vote and v.poll_id = p_poll and nullif(btrim(v.reason), '') is not null;
  if not found then raise exception 'This reply is unavailable.' using errcode = 'P0002'; end if;
end;
$$;

create function public.discover_shopping_polls(p_category text, p_min integer, p_max integer, p_query text, p_needs_answer boolean)
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
    where not p.is_demo and not coalesce(a.is_private, false)
      and (p_category is null or p.category = p_category)
      and (p_min is null or p.price_inr >= p_min) and (p_max is null or p.price_inr <= p_max)
      and (p_query is null or (char_length(p_query) <= 2048 and
        (strpos(lower(p.item_name), lower(p_query)) > 0 or p.product_url = p_query)))
      and (not p_needs_answer or (u.poll_id is null and v.helpful = 0))
    order by helpful, replies, p.created_at desc, p.id desc limit 50
  ) d;
$$;

create function public.list_product_history(p_url text, p_current uuid)
returns table (id uuid, item_name text, price_inr integer, created_at timestamptz,
  price_paid_inr integer, purchased_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.item_name, p.price_inr, p.created_at, u.price_paid_inr, u.purchased_at, u.status
  from public.polls p left join public.purchase_updates u on u.poll_id = p.id
  where (p.product_url = p_url or (p.product_url is null and u.store_url = p_url))
    and not p.is_demo and p.id is distinct from p_current
    and public.can_view_social_content(p.author_id)
  order by p.created_at desc, p.id desc limit 12;
$$;

-- Anonymous viewers can sign media only where the existing Storage policy permits it.
grant select on storage.objects to anon;

revoke all on function public.stamp_purchase_outcome(), public.mark_poll_reason_helpful(uuid, uuid, boolean),
  public.discover_shopping_polls(text, integer, integer, text, boolean), public.list_product_history(text, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_poll_reason_helpful(uuid, uuid, boolean) to authenticated;
grant execute on function public.discover_shopping_polls(text, integer, integer, text, boolean),
  public.list_product_history(text, uuid) to anon, authenticated;

create or replace function public.get_poll_view(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'poll', jsonb_build_object(
      'id', p.id, 'category', p.category, 'use_case', p.use_case, 'priority', p.priority,
      'budget_inr', p.budget_inr, 'item_name', p.item_name, 'price_inr', p.price_inr, 'question', p.question,
      'image_path', p.image_path, 'demo_image', p.demo_image, 'is_demo', p.is_demo, 'created_at', p.created_at),
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
  from public.polls p where p.id = p_id and (p.is_demo or public.can_view_social_content(p.author_id));
$$;

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
    where v.voter_id = auth.uid() and public.can_view_social_content(p.author_id)
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

notify pgrst, 'reload schema';
commit;
