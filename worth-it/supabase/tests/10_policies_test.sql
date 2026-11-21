-- Behavioural tests for access policies and RPCs. Run via supabase/tests/run.sh (plain Postgres + stubs).
\set ON_ERROR_STOP on
\set QUIET on

create function public.t_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;
create function public.t_su() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;

-- run sql, expect it to fail with a message containing `frag`
create function public.t_fails(q text, frag text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if position(frag in sqlerrm) = 0 then
      raise exception 'FAIL [%]: expected error containing "%", got "%"', label, frag, sqlerrm;
    end if;
    raise notice 'ok   %', label; return;
  end;
  raise exception 'FAIL [%]: expected an error but statement succeeded', label;
end $$;

create function public.t_eq(actual anyelement, expected anyelement, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL [%]: expected %, got %', label, expected, actual; end if;
  raise notice 'ok   %', label;
end $$;

\o /dev/null
\set A '''aaaaaaaa-0000-4000-8000-00000000000a'''
\set B '''bbbbbbbb-0000-4000-8000-00000000000b'''
\set C '''cccccccc-0000-4000-8000-00000000000c'''
\set P '''11111111-0000-4000-8000-000000000001'''
\set DEMO '''00000000-0000-4000-8000-0000000000d1'''

insert into auth.users (id) values (:A), (:B), (:C);

-- ── Author creates a poll ──
select t_as(:A);
insert into polls (id, author_id, item_name, price_inr, question, image_path)
values (:P, :A, 'Sneakers', 2499, 'Worth it for daily walking?', 'aaaaaaaa-0000-4000-8000-00000000000a/x.jpg');
select t_eq((select count(*) from polls), 1::bigint, 'author sees own poll');
select t_fails($$insert into polls (author_id, item_name, price_inr, question, image_path) values ('bbbbbbbb-0000-4000-8000-00000000000b','x',1,'q','p')$$,
               'row-level security', 'cannot create a poll as someone else');
select t_fails($$insert into polls (author_id, item_name, price_inr, question, image_path) values ('aaaaaaaa-0000-4000-8000-00000000000a','x',0,'q','p')$$,
               'price_inr', 'price must be positive');

-- ── Guest B cannot list or read tables, but can open the poll by id ──
select t_as(:B);
select t_eq((select count(*) from polls), 0::bigint, 'guest cannot select polls directly');
select t_eq((select count(*) from votes), 0::bigint, 'guest sees no votes directly');
select t_eq(get_poll_view(:P)->'poll'->>'item_name', 'Sneakers', 'guest can open poll by link (id)');
select t_eq((get_poll_view(:P)->>'is_author')::boolean, false, 'guest is not author');
select t_eq(get_poll_view(:P)::text like '%author_id%' or get_poll_view(:P)::text like '%voter_id%', false, 'no author_id / voter_id leaked');

-- ── One vote per guest ──
select cast_vote(:P, 'wait', '  Wait for the sale  ', true);
select t_fails($$select cast_vote('11111111-0000-4000-8000-000000000001', 'buy', null, false)$$, 'already_voted', 'second vote is rejected');
select t_fails($$insert into votes (poll_id, voter_id, choice) values ('11111111-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'buy')$$,
               'permission denied', 'direct vote insert is blocked');
select t_eq(get_poll_view(:P)->>'my_choice', 'wait', 'guest sees own choice');

select t_as(:C);
select t_fails($$select cast_vote('11111111-0000-4000-8000-000000000001', 'maybe', null, false)$$, 'invalid_choice', 'invalid choice rejected');
select t_fails($$select cast_vote('11111111-0000-4000-8000-000000000001', 'buy', repeat('x', 281), false)$$, 'reason_too_long', 'long reason rejected');
select cast_vote(:P, 'skip', null, false);
select t_fails($$select cast_vote('99999999-0000-4000-8000-000000000009', 'buy', null, false)$$, 'not_found', 'unknown poll rejected');

-- ── Author sees votes and reasons; cannot vote ──
select t_as(:A);
select t_eq(jsonb_array_length(get_poll_view(:P)->'votes'), 2, 'author sees 2 votes');
select t_eq((select count(*) from jsonb_array_elements(get_poll_view(:P)->'votes') v where v->>'reason' = 'Wait for the sale'), 1::bigint, 'reason trimmed and visible');
select t_eq((get_poll_view(:P)->>'is_author')::boolean, true, 'author flag true for author');
select t_fails($$select cast_vote('11111111-0000-4000-8000-000000000001', 'buy', null, false)$$, 'author_cannot_vote', 'author cannot vote on own poll');

-- ── Purchase update: author only ──
select t_as(:B);
select t_fails($$insert into purchase_updates (poll_id, status, price_paid_inr) values ('11111111-0000-4000-8000-000000000001','bought',100)$$,
               'row-level security', 'non-author cannot post a purchase update');
select t_as(:A);
insert into purchase_updates (poll_id, status, price_paid_inr, review, store_url, is_affiliate)
values (:P, 'bought', 2199, 'Great for walking', 'https://example.com/shoe', true);
select t_fails($$insert into purchase_updates (poll_id, status, price_paid_inr, store_url) values ('11111111-0000-4000-8000-000000000001','bought',1,'https://example.com/other')$$, 'duplicate key', 'one update per poll');
select t_fails($$update purchase_updates set store_url = 'javascript:alert(1)' where poll_id = '11111111-0000-4000-8000-000000000001'$$, 'store_url', 'only http(s) links allowed');
select t_fails($$update purchase_updates set store_url = null where poll_id = '11111111-0000-4000-8000-000000000001'$$, 'affiliate_needs_url', 'affiliate flag requires a link');
select t_fails($$update purchase_updates set status = 'passed' where poll_id = '11111111-0000-4000-8000-000000000001'$$, 'passed_is_bare', 'passed update carries no price/link');
update purchase_updates set price_paid_inr = 2099 where poll_id = :P;
select t_eq((select price_paid_inr from purchase_updates where poll_id = :P), 2099, 'author can edit own update');

-- ── Visitor sees it, cannot change it or the poll ──
select t_as(:B);
select t_eq(get_poll_view(:P)->'update'->>'review', 'Great for walking', 'visitor sees purchase update');
select t_eq((get_poll_view(:P)->'update'->>'is_affiliate')::boolean, true, 'visitor sees affiliate flag');
with u as (update purchase_updates set price_paid_inr = 1 where poll_id = :P returning 1) select t_eq((select count(*) from u), 0::bigint, 'visitor update affects 0 rows');
select t_fails($$select worthit_manage_post('poll','11111111-0000-4000-8000-000000000001','edit','{}')$$,'Only the owner','visitor cannot edit poll');
select t_fails($$select worthit_manage_post('poll','11111111-0000-4000-8000-000000000001','delete')$$,'Only the owner','visitor cannot delete poll');
with d as (delete from purchase_updates where poll_id = :P returning 1) select t_eq((select count(*) from d), 0::bigint, 'visitor cannot delete update');
select t_su();
select t_eq((select price_paid_inr from purchase_updates where poll_id = :P), 2099, 'update unchanged after visitor attempts');

-- ── Author can edit own poll ──
select t_as(:A);
select worthit_manage_post('poll',:P,'edit','{"itemName":"Sneakers","priceInr":2499,"question":"Edited?"}');
select t_eq(get_poll_view(:P)->'poll'->>'question','Edited?','author can edit own poll');
select t_fails($$update polls set author_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = '11111111-0000-4000-8000-000000000001'$$, 'permission denied', 'author cannot hand poll to someone else');

-- ── Anonymous (no session) ──
select t_as(null);
select t_eq(get_poll_view(:P)->'poll'->>'item_name', 'Sneakers', 'no-session visitor can still read via link');
select t_fails($$select cast_vote('11111111-0000-4000-8000-000000000001', 'buy', null, false)$$, 'permission denied', 'no-session visitor cannot vote');
select t_fails($$select * from polls$$, 'permission denied', 'no-session visitor cannot read tables');
select t_eq(jsonb_array_length(list_polls(true)), 3, 'three demo polls are listed');
select t_eq(jsonb_array_length(list_polls(false)), 0, 'no "my polls" without a session');

-- ── Demo polls ──
select t_as(:B);
select t_fails($$select cast_vote('00000000-0000-4000-8000-0000000000d1', 'buy', null, false)$$, 'demo_readonly', 'demo polls are read-only in the shared backend');
select t_eq(jsonb_array_length(get_poll_view(:DEMO)->'votes'), 6, 'demo poll shows seeded votes');
select t_eq((get_poll_view('00000000-0000-4000-8000-0000000000d3')->'update'->>'status'), 'bought', 'demo poll 3 has a purchase update');
select t_eq((list_polls(true)->0->>'price_inr')::int, 1299, 'demo list ordered by price');
select t_eq(jsonb_array_length(list_polls(false)), 0, 'guest B has no own polls');
select t_as(:A);
select t_eq(jsonb_array_length(list_polls(false)), 1, 'author lists own poll');
select t_eq((list_polls(false)->0->>'vote_count')::int, 2, 'my-poll summary counts votes');

-- ── Storage policies ──
select t_as(:B);
select t_fails($$insert into storage.objects (bucket_id, name) values ('poll-photos', 'aaaaaaaa-0000-4000-8000-00000000000a/evil.jpg')$$, 'row-level security', 'cannot upload into another user''s folder');
insert into storage.objects (bucket_id, name) values ('poll-photos', 'bbbbbbbb-0000-4000-8000-00000000000b/ok.jpg');
select t_fails($$insert into storage.objects (bucket_id, name) values ('other', 'bbbbbbbb-0000-4000-8000-00000000000b/ok.jpg')$$, 'row-level security', 'cannot write to other buckets');
select t_as(:C);
select t_eq((select count(*) from storage.objects where bucket_id = 'poll-photos'), 0::bigint, 'other users cannot list photos');
select t_su();
select t_eq((select public from storage.buckets where id = 'poll-photos'), false, 'photo bucket requires authorized access');
select t_eq((select file_size_limit from storage.buckets where id = 'poll-photos'), 15728640::bigint, 'full-size photo limit set');

\o
\echo ALL POLICY TESTS PASSED
