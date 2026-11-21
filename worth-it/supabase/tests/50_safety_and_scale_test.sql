begin;
insert into auth.users(id,raw_user_meta_data) values
 ('71000000-0000-4000-8000-000000000001','{"worthit_username":"safe_owner"}'),
 ('71000000-0000-4000-8000-000000000002','{"worthit_username":"safe_viewer"}');
insert into public.polls(id,author_id,item_name,price_inr,question,product_url) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Safety test',100,'Worth it?','https://example.com/item');
insert into public.votes(poll_id,voter_id,choice,reason,owns_item)
 select '72000000-0000-4000-8000-000000000001',gen_random_uuid(),'buy','Good',true from generate_series(1,25);
set local role authenticated;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000002';
select public.t_eq((public.worthit_poll_page('72000000-0000-4000-8000-000000000001')->'summary'->>'buy')::int,25,'totals include every vote');
select public.t_eq(jsonb_array_length(public.worthit_poll_page('72000000-0000-4000-8000-000000000001')->'votes'),20,'vote reasons are bounded');
select public.t_fails('select * from public.content_reports','permission denied','reporters cannot list private reports');
select public.t_fails('select public.worthit_operations()','Moderator access','operations dashboard is protected');
select public.t_fails('select public.list_content_reports()','Moderator access','nonmoderator cannot moderate');
select public.t_fails('select public.worthit_use_quota(''polls'',-100,9999)','permission denied','clients cannot reset counters');
select public.report_content('poll','72000000-0000-4000-8000-000000000001','Misleading product');
select public.worthit_saved('72000000-0000-4000-8000-000000000001',true);
select public.t_eq(jsonb_array_length(public.worthit_saved()),1,'saved polls persist');
select public.set_account_block('71000000-0000-4000-8000-000000000001',true);
select public.t_eq(public.worthit_poll_page('72000000-0000-4000-8000-000000000001'),null::jsonb,'blocking hides poll details');
select public.t_eq(jsonb_array_length(public.worthit_saved()),0,'blocking also hides saved content');
select public.t_fails('select public.set_social_follow(''71000000-0000-4000-8000-000000000001'',true)','Account unavailable','blocked account cannot refollow');
select public.set_account_block('71000000-0000-4000-8000-000000000001',false);
select public.worthit_feedback(4,'Useful voting process');
select public.t_fails('select * from public.product_feedback','permission denied','feedback is private');
select public.t_fails('update public.social_profiles set is_suspended=false where id=auth.uid()','permission denied','users cannot unsuspend accounts');
reset role;
set local "request.jwt.claim.sub"='';
insert into public.daily_usage(user_id,day,action,amount) values ('71000000-0000-4000-8000-000000000002',current_date,'polls',30);
set local role authenticated;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000002';
select public.t_fails('insert into public.polls(author_id,item_name,price_inr,question,product_url) values(auth.uid(),''Quota'',100,''Worth it?'',''https://example.com/q'')','Daily limit','direct inserts cannot bypass quotas');
select public.request_account_deletion();
select public.t_fails('select public.worthit_feedback(5,''More feedback'')','Account unavailable','queued deletions disable new activity');
rollback;
