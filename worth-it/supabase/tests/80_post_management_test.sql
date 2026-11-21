begin;
insert into auth.users(id,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','{"worthit_username":"manage_owner"}'),
 ('a1000000-0000-4000-8000-000000000002','{"worthit_username":"manage_viewer"}');
insert into public.polls(id,author_id,item_name,price_inr,question,image_path,product_url,created_at)
select ('a2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a1000000-0000-4000-8000-000000000001',
 'Managed '||n,500,'Worth it?','a1000000-0000-4000-8000-000000000001/'||n||'.jpg','https://example.com/item','2026-01-01'
from generate_series(1,25) n;
insert into public.social_reels(id,author_id,caption,video_path) values
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Original caption',
 'a1000000-0000-4000-8000-000000000001/reels/a3000000-0000-4000-8000-000000000001.mp4');
insert into public.social_follows(follower_id,following_id,accepted) values
 ('a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',true);
update public.media_jobs set id='a5000000-0000-4000-8000-000000000001',state='ready',
preview_path='a1000000-0000-4000-8000-000000000001/processed/a5000000-0000-4000-8000-000000000001.jpg'
where poll_id='a2000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000002';
select public.cast_vote('a2000000-0000-4000-8000-000000000001','buy','Original vote',false);
select public.add_social_comment('poll','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','Comment');
select public.social_set_reel_like('a3000000-0000-4000-8000-000000000001',true);
select public.t_fails($$select public.worthit_manage_post('poll','a2000000-0000-4000-8000-000000000001','delete')$$,'Only the owner','nonowner cannot delete');
select public.t_fails($$select public.worthit_manage_post('reel','a3000000-0000-4000-8000-000000000001','archive')$$,'Only the owner','nonowner cannot archive');
select public.t_fails($$select public.worthit_manage_post('reel','a3000000-0000-4000-8000-000000000001','edit','{"caption":"Stolen"}')$$,'Only the owner','nonowner cannot edit reel');
select public.t_eq(public.worthit_archived_posts('poll'),'[]'::jsonb,'archive is scoped to authenticated owner');

set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000001';
select public.t_fails($$update public.polls set archived_at=now()$$,'permission denied','direct updates cannot forge archive or media state');
select public.worthit_manage_post('poll','a2000000-0000-4000-8000-000000000001','edit','{"itemName":"Updated item","priceInr":600,"question":"Updated question?","productUrl":"https://example.com/new"}');
select public.t_eq(public.get_poll_view('a2000000-0000-4000-8000-000000000001')->'poll'->>'item_name','Updated item','poll edited');
select public.t_eq(jsonb_array_length(public.get_poll_view('a2000000-0000-4000-8000-000000000001')->'votes'),1,'editing keeps votes');
select public.t_eq((select count(*) from public.list_social_comments('poll','a2000000-0000-4000-8000-000000000001')),1::bigint,'editing keeps comments');
select public.t_eq(public.get_poll_view('a2000000-0000-4000-8000-000000000001')->'poll'->>'media_state',null::text,'legacy detail remains compatible');
select public.t_eq(public.worthit_poll_page('a2000000-0000-4000-8000-000000000001')->'poll'->>'media_state','ready','editing preserves validated media');
select public.worthit_manage_post('reel','a3000000-0000-4000-8000-000000000001','edit','{"caption":"New caption","productUrl":"https://example.com/reel"}');
select public.t_eq((select caption from public.social_reel_feed() where id='a3000000-0000-4000-8000-000000000001'),'New caption','reel edited');
select public.worthit_manage_post('reel','a3000000-0000-4000-8000-000000000001','archive');
select public.worthit_manage_post('poll',('a2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'archive') from generate_series(13,25) n;
select public.worthit_manage_post('poll','a2000000-0000-4000-8000-000000000001','archive');
select public.t_eq(jsonb_array_length(public.list_polls(false)),11,'owner active list excludes archive');
select public.t_eq(jsonb_array_length(public.worthit_archived_posts('poll')),14,'archive retains owner polls');
select public.t_eq(jsonb_array_length(public.worthit_archived_posts('reel')),1,'archive retains owner reels');
select public.t_eq(public.can_read_social_object('poll-photos','a1000000-0000-4000-8000-000000000001/1.jpg'),true,'owner can read archived media');

set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000002';
select public.t_eq(public.get_poll_view('a2000000-0000-4000-8000-000000000001'),null::jsonb,'shared legacy link hides archive');
select public.t_eq(public.worthit_poll_page('a2000000-0000-4000-8000-000000000001'),null::jsonb,'shared current link hides archive');
select public.t_fails($$select public.list_social_comments('poll','a2000000-0000-4000-8000-000000000001')$$,'unavailable','archived comments hidden');
select public.t_fails($$select public.list_social_comments('reel','a3000000-0000-4000-8000-000000000001')$$,'unavailable','archived reel comments hidden');
select public.t_eq(public.can_read_social_object('poll-photos','a1000000-0000-4000-8000-000000000001/1.jpg'),false,'archived original media hidden');
select public.t_eq(public.can_read_social_object('poll-photos','a1000000-0000-4000-8000-000000000001/processed/a5000000-0000-4000-8000-000000000001.jpg'),false,'archived processed preview hidden');
select public.t_fails($$select public.report_content('poll','a2000000-0000-4000-8000-000000000001','Hidden post')$$,'unavailable','nonowner cannot report an archived private post');
select public.t_eq(public.can_read_social_object('social-media','a1000000-0000-4000-8000-000000000001/reels/a3000000-0000-4000-8000-000000000001.mp4'),false,'archived reel media hidden');
select public.t_eq(jsonb_array_length(public.worthit_feed(null,null,12)),11,'archive filtering happens before page limit');
select public.t_eq(public.worthit_feed()->0->'post'->>'id','a2000000-0000-4000-8000-000000000012','feed reaches active rows behind archived rows');
select public.t_eq((select count(*) from public.social_reel_feed()),0::bigint,'archived reels not recommended');
select public.t_eq(jsonb_array_length(public.discover_shopping_polls(null,null,null,'Managed',false)),11,'search hides archives');
select public.t_eq(jsonb_array_length(public.worthit_archived_posts('poll')),0,'viewer cannot list owner archive');
select public.t_fails($$select public.cast_vote('a2000000-0000-4000-8000-000000000001','skip','Hidden',false)$$,'not_found','archived poll rejects new votes');
select public.t_fails($$select public.social_set_reel_like('a3000000-0000-4000-8000-000000000001',true)$$,'not_found','archived reel rejects likes');
select public.t_eq(jsonb_array_length(public.worthit_media_derivatives(array['a2000000-0000-4000-8000-000000000001']::uuid[])),0,'archived derivatives hidden');

set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000001';
select public.worthit_manage_post('poll','a2000000-0000-4000-8000-000000000001','restore');
select public.worthit_manage_post('reel','a3000000-0000-4000-8000-000000000001','restore');
select public.t_eq((select likes from public.social_reel_feed() where id='a3000000-0000-4000-8000-000000000001'),1::bigint,'restoring keeps likes');
select public.worthit_manage_post('poll','a2000000-0000-4000-8000-000000000001','delete');
select public.worthit_manage_post('reel','a3000000-0000-4000-8000-000000000001','delete');
select public.t_fails($$select * from public.post_media_cleanup$$,'permission denied','clients cannot inspect cleanup targets');
select public.t_fails($$select public.worthit_claim_post_cleanup()$$,'permission denied','clients cannot claim cleanup jobs');
reset role;
set local "request.jwt.claim.sub"='';
select public.t_eq((select count(*) from public.social_comments where poll_id='a2000000-0000-4000-8000-000000000001'),0::bigint,'delete cascades comments');
select public.t_eq((select count(*) from public.votes where poll_id='a2000000-0000-4000-8000-000000000001'),0::bigint,'delete cascades votes');
select public.t_eq((select count(*) from public.social_reel_likes where reel_id='a3000000-0000-4000-8000-000000000001'),0::bigint,'delete cascades reel likes');
select public.t_eq((select count(*)>0 from public.post_media_cleanup where path='a1000000-0000-4000-8000-000000000001/1.jpg'),true,'delete queues original media');
select public.t_eq((select count(*)>0 from public.post_media_cleanup where path like '%/processed/%'),true,'delete queues derived media');
select public.t_fails($$insert into public.polls(id,author_id,item_name,price_inr,question) values('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Retry',500,'Retry?')$$,'was deleted','publish retries cannot resurrect deleted id');
select public.t_fails($$insert into public.polls(id,author_id,item_name,price_inr,question,image_path) values('a2000000-0000-4000-8000-000000000090','a1000000-0000-4000-8000-000000000001','Reused file',500,'Retry?','a1000000-0000-4000-8000-000000000001/1.jpg')$$,'retired','new posts cannot race cleanup by reusing deleted media');
update public.post_media_cleanup set created_at=now()-interval '1 hour';
set local role service_role;
select public.t_eq((select count(*) from public.worthit_claim_post_cleanup()),1::bigint,'server claims cleanup');
select public.t_eq((select count(*) from public.worthit_claim_post_cleanup()),1::bigint,'leased job excluded from next claim');
rollback;
