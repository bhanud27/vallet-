-- Demo content: three clearly flagged sample sneaker polls (is_demo = true, no author). Safe to re-run.
-- Photos are bundled in the app (demo_image key), so no storage upload is needed.
insert into public.polls (id, author_id, item_name, price_inr, question, demo_image, is_demo, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', null, 'Stride Lite everyday sneakers', 1299, 'Good enough for college and daily walking?', 'sneaker-1', true, now() - interval '52 hours'),
  ('00000000-0000-4000-8000-0000000000d2', null, 'Cloudwalk knit trainers',       3999, 'Is the knit upper worth the extra money over a ₹2,500 pair?', 'sneaker-2', true, now() - interval '30 hours'),
  ('00000000-0000-4000-8000-0000000000d3', null, 'Apex Pro trail sneakers',       6499, 'Too much for weekend hikes and some office wear?', 'sneaker-3', true, now() - interval '120 hours')
on conflict (id) do nothing;

insert into public.votes (poll_id, voter_id, choice, reason, owns_item, created_at)
select v.poll_id::uuid, gen_random_uuid(), v.choice, v.reason, v.owns, now() - (v.mins || ' minutes')::interval
from (values
  ('00000000-0000-4000-8000-0000000000d1', 'buy',  'Light and cheap. Mine lasted a year of daily use.', true, 3000),
  ('00000000-0000-4000-8000-0000000000d1', 'buy',  'At this price you can replace them next year and not care.', false, 2900),
  ('00000000-0000-4000-8000-0000000000d1', 'buy',  null, false, 2700),
  ('00000000-0000-4000-8000-0000000000d1', 'wait', 'These drop to about ₹999 every sale season.', false, 2500),
  ('00000000-0000-4000-8000-0000000000d1', 'buy',  'Sole is thin but fine for pavements.', true, 2300),
  ('00000000-0000-4000-8000-0000000000d1', 'skip', 'No arch support. Bad if you walk 5 km or more.', false, 2200),
  ('00000000-0000-4000-8000-0000000000d2', 'wait', 'Was ₹2,999 last month. Wait for the next sale.', false, 1700),
  ('00000000-0000-4000-8000-0000000000d2', 'wait', 'Knit is nice but the price will drop.', false, 1600),
  ('00000000-0000-4000-8000-0000000000d2', 'buy',  'Comfiest shoe I own. Worth it if you walk daily.', true, 1500),
  ('00000000-0000-4000-8000-0000000000d2', 'skip', 'Knit gets dirty fast and is hard to clean.', true, 1400),
  ('00000000-0000-4000-8000-0000000000d2', 'wait', null, false, 1200),
  ('00000000-0000-4000-8000-0000000000d3', 'skip', 'Buy a ₹3,500 pair and spend the rest on good socks.', false, 7000),
  ('00000000-0000-4000-8000-0000000000d3', 'wait', 'Look for the older colour, usually 30% off.', false, 6900),
  ('00000000-0000-4000-8000-0000000000d3', 'wait', 'Prices drop in festive sales.', false, 6800),
  ('00000000-0000-4000-8000-0000000000d3', 'buy',  'Grip is excellent. Hiking pair that lasts years.', true, 6500)
) as v(poll_id, choice, reason, owns, mins)
where not exists (select 1 from public.votes x where x.poll_id = '00000000-0000-4000-8000-0000000000d1');

insert into public.purchase_updates (poll_id, status, price_paid_inr, review, store_url, is_affiliate)
values ('00000000-0000-4000-8000-0000000000d3', 'bought', 5299,
        'Waited two weeks and got them ₹1,200 under the asking price. Grip is great, a bit stiff for office days.',
        'https://example.com/demo-store-link', true)
on conflict (poll_id) do nothing;
