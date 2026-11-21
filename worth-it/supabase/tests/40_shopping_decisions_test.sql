begin;

insert into auth.users (id, raw_user_meta_data) values
  ('50000000-0000-4000-8000-000000000001', '{"worthit_username":"decision_owner"}'),
  ('50000000-0000-4000-8000-000000000002', '{"worthit_username":"decision_voter"}'),
  ('50000000-0000-4000-8000-000000000003', '{"worthit_username":"hidden_shopper"}');

insert into public.polls (id, author_id, item_name, price_inr, question, product_url, category, use_case, priority, budget_inr)
values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
    'Work headphones', 2499, 'Worth it for calls?', 'https://example.com/headphones', 'audio', 'Work calls', 'Microphone', 3000),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003',
    'Private headphones', 2300, 'Worth it?', 'https://example.com/headphones', 'audio', null, null, null);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000003';
select public.set_social_privacy(true);

set local role anon;
set local "request.jwt.claim.sub" = '';
do $$
declare public_poll uuid := '60000000-0000-4000-8000-000000000001';
        private_poll uuid := '60000000-0000-4000-8000-000000000002';
begin
  if public.get_poll_view(public_poll)->'poll'->>'use_case' is distinct from 'Work calls'
    or public.get_poll_view(private_poll) is not null
    or jsonb_array_length(public.discover_shopping_polls('audio', 2000, 3000, 'headphones', true)) <> 1
    or jsonb_array_length(public.discover_shopping_polls('audio', null, 2000, null, false)) <> 0
    or exists (select 1 from public.list_product_history('https://example.com/headphones', public_poll)) then
    raise exception 'Signed-out discovery, detail and history must hide private polls and apply filters';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';
select public.cast_vote('60000000-0000-4000-8000-000000000001', 'wait', 'Good sound, poor microphone', true);
do $$
begin
  begin
    perform public.mark_poll_reason_helpful('60000000-0000-4000-8000-000000000001',
      (select id from public.votes limit 1), true);
    raise exception 'A voter must not mark their own reply';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
do $$
declare poll uuid := '60000000-0000-4000-8000-000000000001';
        vote uuid;
begin
  vote := (public.get_poll_view(poll)->'votes'->0->>'id')::uuid;
  perform public.mark_poll_reason_helpful(poll, vote, true);
  if public.get_poll_view(poll)->'votes'->0->>'helpful' is distinct from 'true'
    or public.get_poll_view(poll)->'votes'->0->>'owns_item' is distinct from 'true'
    or jsonb_array_length(public.discover_shopping_polls('audio', null, null, null, true)) <> 0 then
    raise exception 'Helpful owner reply must appear in results and resolve the discovery question';
  end if;
  perform public.mark_poll_reason_helpful(poll, vote, false);
end;
$$;

insert into public.purchase_updates (poll_id, status, price_paid_inr)
values ('60000000-0000-4000-8000-000000000001', 'bought', 2199);

reset role;
alter table public.purchase_updates disable trigger stamp_purchase_outcome;
update public.purchase_updates set purchased_at = now() - interval '8 days'
where poll_id = '60000000-0000-4000-8000-000000000001';
alter table public.purchase_updates enable trigger stamp_purchase_outcome;

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.list_social_notifications() where kind = 'after_buy_reminder') <> 1 then
    raise exception 'Shopper must see the due after-buy reminder';
  end if;
end;
$$;
update public.purchase_updates set would_buy_again = false, review = 'Microphone was too quiet'
where poll_id = '60000000-0000-4000-8000-000000000001';

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';
do $$
declare poll uuid := '60000000-0000-4000-8000-000000000001';
begin
  if (select count(*) from public.list_social_notifications() where kind = 'purchase_update' and detail like '%After-buy verdict') <> 1
    or (select price_paid_inr from public.list_product_history('https://example.com/headphones', null)) is distinct from 2199
    or public.get_poll_view(poll)->'update'->>'would_buy_again' is distinct from 'false' then
    raise exception 'Voters must see the purchase outcome and exact-link price history';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
update public.purchase_updates set status = 'returned', would_buy_again = null, review = 'Microphone not usable'
where poll_id = '60000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.list_social_notifications() where kind = 'after_buy_reminder')
    or (select status from public.list_product_history('https://example.com/headphones', null)
        where id = '60000000-0000-4000-8000-000000000001') is distinct from 'returned' then
    raise exception 'Returns must retain history and clear the reminder';
  end if;
end;
$$;

rollback;
