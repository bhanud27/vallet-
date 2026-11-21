begin;
insert into auth.users(id,raw_user_meta_data) values
('a0000000-0000-4000-8000-000000000001','{"worthit_username":"settings_owner"}'),
('a0000000-0000-4000-8000-000000000002','{"worthit_username":"settings_viewer"}');
insert into public.polls(id,author_id,item_name,price_inr,question,image_path)values('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Linen shirt',100,'Worth it?','a0000000-0000-4000-8000-000000000001/photo.jpg');
insert into public.social_reels(id,author_id,caption,video_path)values('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Linen shirt','a0000000-0000-4000-8000-000000000001/reels/a1000000-0000-4000-8000-000000000002.mp4');
set local role authenticated;
set local "request.jwt.claim.sub"='a0000000-0000-4000-8000-000000000001';
select public.worthit_settings('{"comments_audience":"nobody","mentions_audience":"nobody","hidden_words":["spam"],"autoplay":false,"notification_types":{"poll_comments":false}}');
do $$begin
if public.worthit_settings()->>'autoplay'<>'false' then raise exception 'Settings did not persist';end if;
begin perform public.worthit_settings('{"autoplay":"yes"}');raise exception 'Invalid settings accepted';exception when invalid_parameter_value then null;end;
begin perform public.worthit_settings('{"preferred_brands":[null]}');raise exception 'Invalid lists accepted';exception when invalid_parameter_value then null;end;
end $$;
set local "request.jwt.claim.sub"='a0000000-0000-4000-8000-000000000002';
do $$begin
if public.worthit_settings()->>'autoplay'='false' then raise exception 'Cross-account settings leaked';end if;
begin perform public.add_social_comment('poll','a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'Hi');raise exception 'Comment audience ignored';exception when insufficient_privilege then null;end;
begin perform public.add_social_comment('reel','a1000000-0000-4000-8000-000000000002',gen_random_uuid(),'@settings_owner hello');raise exception 'Mention audience ignored';exception when insufficient_privilege then null;end;
perform public.worthit_save_content('reel','a1000000-0000-4000-8000-000000000002',true);
if jsonb_array_length(public.worthit_activity('saved'))<>1 then raise exception 'Saved Check missing';end if;
perform public.worthit_muted('a0000000-0000-4000-8000-000000000001',true);
if exists(select 1 from public.list_visible_reels(null,false)) then raise exception 'Muted account recommended';end if;
end $$;
set local "request.jwt.claim.sub"='a0000000-0000-4000-8000-000000000001';
select public.worthit_settings('{"comments_audience":"everyone"}');
set local "request.jwt.claim.sub"='a0000000-0000-4000-8000-000000000002';
do $$begin
begin perform public.add_social_comment('poll','a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'SPAM');raise exception 'Hidden words ignored';exception when invalid_parameter_value then null;end;
perform public.add_social_comment('poll','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Helpful');
if jsonb_array_length(public.worthit_activity('comments'))<>1 then raise exception 'Own comment missing';end if;
end $$;
set local "request.jwt.claim.sub"='a0000000-0000-4000-8000-000000000001';
do $$begin
if exists(select 1 from public.list_social_notifications() where kind='poll_comment') then raise exception 'Notification preference ignored';end if;
begin perform public.worthit_delete_comment('a2000000-0000-4000-8000-000000000001');raise exception 'Non-owner deleted comment';exception when insufficient_privilege then null;end;
end $$;
set local "request.jwt.claim.sub"='a0000000-0000-4000-8000-000000000002';
select public.worthit_delete_comment('a2000000-0000-4000-8000-000000000001');
do $$begin if jsonb_array_length(public.worthit_activity('comments'))<>0 then raise exception 'Deleted comment retained';end if;end $$;

do $$declare page jsonb;next_page jsonb;cursor jsonb;begin
begin perform public.add_social_comment('poll','a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'@settings_owner hello');raise exception 'Mention restriction ignored';exception when insufficient_privilege then null;end;
perform public.set_poll_star('a1000000-0000-4000-8000-000000000001',true);
if jsonb_array_length(public.worthit_activity('stars'))<>1 then raise exception 'Star activity missing';end if;
for i in 1..36 loop perform public.add_social_comment('poll','a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'Activity entry '||i);end loop;
page=public.worthit_activity('comments');cursor=page->29;
next_page=public.worthit_activity('comments',(cursor->>'created_at')::timestamptz,cursor->>'entry_id');
if jsonb_array_length(page)<>30 or jsonb_array_length(next_page)<>6 or exists(select 1 from jsonb_array_elements(page) a join jsonb_array_elements(next_page) b on a->>'entry_id'=b->>'entry_id') then raise exception 'Activity keyset pagination lost or duplicated rows';end if;
end $$;

rollback;



