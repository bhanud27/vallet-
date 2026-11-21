begin;
insert into auth.users(id,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','{"worthit_username":"page_author"}'),
 ('91000000-0000-4000-8000-000000000002','{"worthit_username":"page_viewer"}');
insert into public.polls(id,author_id,item_name,price_inr,question,product_url,created_at)
select ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'91000000-0000-4000-8000-000000000001','Page '||n,100,'Worth it?','https://example.com/item','2026-01-01T00:00:00Z' from generate_series(1,25) n;
insert into public.social_follows(follower_id,following_id,accepted) values
 ('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001',true);
select public.t_eq(public.worthit_product_key('https://example.com/item?variant=blue&utm_source=test'),'https://example.com/item?variant=blue','history retains variants while dropping trackers');
set local role authenticated;
set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000002';
select public.t_eq(jsonb_array_length(public.worthit_feed()),12,'feed first page bounded');
select public.t_eq(jsonb_array_length(public.worthit_feed('2026-01-01','92000000-0000-4000-8000-000000000014',12)),12,'same-time cursor page bounded');
select public.t_eq(public.worthit_feed()->0->'post'->>'id','92000000-0000-4000-8000-000000000025','ties use descending ID');
select public.t_eq(public.worthit_feed('2026-01-01','92000000-0000-4000-8000-000000000014',12)->0->'post'->>'id','92000000-0000-4000-8000-000000000013','cursor excludes previous page boundary');
select public.t_eq(jsonb_array_length(public.worthit_feed('2026-01-01','92000000-0000-4000-8000-000000000002',12)),1,'last page reaches oldest post');
select public.set_account_block('91000000-0000-4000-8000-000000000001',true);
select public.t_eq(jsonb_array_length(public.worthit_feed()),0,'blocked account disappears from paginated feed');
rollback;
