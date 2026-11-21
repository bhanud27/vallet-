begin;
delete from public.media_jobs;
insert into auth.users(id,raw_user_meta_data) values
 ('81000000-0000-4000-8000-000000000001','{"worthit_username":"media_owner"}'),
 ('81000000-0000-4000-8000-000000000002','{"worthit_username":"media_viewer"}');
update public.media_pipeline_settings set enabled=true;
set local role authenticated;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
insert into public.polls(id,author_id,item_name,price_inr,question,image_path,media_gallery,media_state) values
 ('82000000-0000-4000-8000-000000000001',auth.uid(),'Processed shoe',100,'Worth it?',
 '81000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001.jpg',
 '[{"kind":"image","value":"81000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001.jpg","thumbnail":"81000000-0000-4000-8000-000000000001/thumbnails/83000000-0000-4000-8000-000000000001.jpg"}]','ready');
select public.t_eq((public.worthit_poll_page('82000000-0000-4000-8000-000000000001')->'poll'->>'media_state'),'pending','client cannot bypass quarantine');
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000002';
select public.t_eq(public.can_read_social_object('poll-photos','81000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001.jpg'),false,'unvalidated original hidden');
select public.t_eq(public.can_read_social_object('poll-photos','81000000-0000-4000-8000-000000000001/thumbnails/83000000-0000-4000-8000-000000000001.jpg'),false,'unvalidated thumbnail hidden');
select public.t_fails('select * from public.worthit_claim_media()','permission denied','clients cannot claim processing jobs');
select public.t_fails('select public.worthit_finish_media(gen_random_uuid(),true)','permission denied','clients cannot approve media');
reset role;
set local "request.jwt.claim.sub"='';
select public.worthit_finish_media(id,true,owner_id::text||'/processed/'||id::text||'.jpg',null) from public.worthit_claim_media();
set local role authenticated;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000002';
select public.t_eq(public.can_read_social_object('poll-photos','81000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001.jpg'),true,'validated original visible');
select public.t_eq((public.worthit_poll_page('82000000-0000-4000-8000-000000000001')->'poll'->>'media_state'),'ready','completed job releases media');
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
select public.set_social_privacy(true);
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000002';
select public.t_eq(public.can_read_social_object('poll-photos','81000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001.jpg'),false,'validation never bypasses account privacy');
rollback;
