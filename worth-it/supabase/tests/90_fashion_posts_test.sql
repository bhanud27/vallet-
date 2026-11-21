begin;
insert into auth.users(id) values
 ('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002'),('b1000000-0000-4000-8000-000000000003');
insert into public.social_profiles(id,display_name,is_private) values
 ('b1000000-0000-4000-8000-000000000001','fashion_owner',true),('b1000000-0000-4000-8000-000000000002','fashion_friend',false),('b1000000-0000-4000-8000-000000000003','fashion_stranger',false);
insert into public.social_follows(follower_id,following_id,accepted) values
 ('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001',true),
 ('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001',false);
set local role authenticated;
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into public.polls(id,author_id,item_name,price_inr,question,image_path,content_type,category) values
 ('b2000000-0000-4000-8000-000000000001',auth.uid(),'Weekend look',null,'My weekend look',auth.uid()||'/outfit.jpg','post','fashion');
insert into public.polls(id,author_id,item_name,price_inr,question,image_path) values
 ('b2000000-0000-4000-8000-000000000002',auth.uid(),'Fashion poll',500,'Worth it?',auth.uid()||'/shirt.jpg');
insert into public.social_reels(id,author_id,caption,video_path) values
 ('b3000000-0000-4000-8000-000000000001',auth.uid(),'Outfit check',auth.uid()||'/reels/b3000000-0000-4000-8000-000000000001.mp4');
select public.t_eq(public.get_poll_view('b2000000-0000-4000-8000-000000000001')->'poll'->>'content_type','post','legacy detail serializes post type');
select public.t_eq(public.worthit_poll_page('b2000000-0000-4000-8000-000000000001')->'poll'->>'content_type','post','paged detail retains post type');
select public.t_eq(public.get_poll_view('b2000000-0000-4000-8000-000000000002')->'poll'->>'content_type','poll','existing poll defaults are preserved');
select public.t_fails($$insert into public.polls(author_id,item_name,price_inr,question,image_path) values(auth.uid(),'Missing price',null,'Question',auth.uid()||'/1.jpg')$$,'polls_content_details','poll requires price');
select public.t_fails($$insert into public.polls(author_id,item_name,price_inr,question,image_path,content_type) values(auth.uid(),'Fake post',500,'Caption',auth.uid()||'/1.jpg','post')$$,'polls_content_details','post cannot pretend to have asking price');
select public.t_fails($$insert into public.polls(author_id,item_name,price_inr,question,product_url,content_type) values(auth.uid(),'Link only',null,'Caption','https://example.com/item','post')$$,'polls_content_details','post requires media');
select public.t_fails($$insert into public.purchase_updates(poll_id,status) values('b2000000-0000-4000-8000-000000000001','passed')$$,'Posts do not have votes or purchase updates','direct post purchase update is rejected');
select public.worthit_manage_post('poll','b2000000-0000-4000-8000-000000000001','edit','{"question":"Updated style","contentKind":"poll","priceInr":100,"productUrl":"https://example.com/style"}');
select public.t_eq(public.get_poll_view('b2000000-0000-4000-8000-000000000001')->'poll'->>'question','Updated style','owner edits post caption');
select public.t_eq(public.get_poll_view('b2000000-0000-4000-8000-000000000001')->'poll'->>'content_type','post','client cannot switch stored post type');
select public.t_eq((select count(*) from public.worthit_connections(auth.uid(),'followers')),1::bigint,'only accepted followers are listed');
select public.t_fails($$select * from public.worthit_connections(auth.uid(),'invalid')$$,'Invalid connection list','connection kinds validated');
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000002';
select public.t_eq((select count(*) from public.worthit_connections('b1000000-0000-4000-8000-000000000001','followers')),1::bigint,'approved followers can open private profile connections');
select public.t_eq(jsonb_array_length(public.list_social_polls('b1000000-0000-4000-8000-000000000001')),2,'both posts and polls appear for accepted follower');
select public.t_fails($$select public.cast_vote('b2000000-0000-4000-8000-000000000001','buy','',false)$$,'Posts do not have votes','post voting RPC rejected');
select public.set_poll_star('b2000000-0000-4000-8000-000000000001',true);
select public.set_poll_star('b2000000-0000-4000-8000-000000000001',true);
select public.t_eq((select stars from public.get_poll_extras(array['b2000000-0000-4000-8000-000000000001'::uuid])),1::bigint,'repeated post Stars do not duplicate');
select public.t_eq(public.worthit_set_check_star('b3000000-0000-4000-8000-000000000001',true)->>'count','1','first Check Star returns accurate count');
select public.t_eq(public.worthit_set_check_star('b3000000-0000-4000-8000-000000000001',true)->>'count','1','repeated Check Stars idempotent');
select public.t_eq(public.worthit_set_check_star('b3000000-0000-4000-8000-000000000001',false)->>'count','0','explicit toggle still removes Star');
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000003';
select public.t_fails($$select * from public.worthit_connections('b1000000-0000-4000-8000-000000000001','followers')$$,'private or unavailable','private follower graph not leaked to strangers');
select public.t_fails($$select public.worthit_set_check_star('b3000000-0000-4000-8000-000000000001',true)$$,'unavailable','private Check cannot be starred by stranger');
select public.t_eq(public.get_poll_view('b2000000-0000-4000-8000-000000000001'),null::jsonb,'private post hidden from strangers');
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
select public.worthit_manage_post('poll','b2000000-0000-4000-8000-000000000001','archive');
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000002';
select public.t_eq(public.get_poll_view('b2000000-0000-4000-8000-000000000001'),null::jsonb,'archived posts hidden from followers');
reset role;
rollback;
