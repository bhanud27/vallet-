begin;
insert into auth.users(id,raw_user_meta_data)values('c0000000-0000-4000-8000-000000000001','{"worthit_username":"creator_owner"}'),('c0000000-0000-4000-8000-000000000002','{"worthit_username":"creator_viewer"}');
set local role authenticated;set local "request.jwt.claim.sub"='c0000000-0000-4000-8000-000000000001';
insert into public.polls(id,author_id,item_name,price_inr,question,product_url,creation_spec,import_source)
values
 ('c1000000-0000-4000-8000-000000000001',auth.uid(),'Shirt A',null,'Which one should I buy?','https://www.myntra.com/a','{"version":1,"subtype":"compare","products":[{"id":"a","name":"Shirt A","media":[],"url":"https://www.myntra.com/a"},{"id":"b","name":"Shirt B","media":[],"url":"https://www.ajio.com/b"}],"options":[{"id":"a","label":"Shirt A","productId":"a"},{"id":"b","label":"Shirt B","productId":"b"}]}','server'),
 ('c1000000-0000-4000-8000-000000000003',auth.uid(),'Canvas tote',null,'Is this worth buying?','https://shop.example/tote','{"version":1,"subtype":"opinion","products":[{"id":"tote","name":"Canvas tote","media":[],"url":"https://shop.example/tote"}],"options":[{"id":"buy","label":"Worth it"},{"id":"skip","label":"Not worth it"}]}','manual');
do $$begin
if public.get_poll_view('c1000000-0000-4000-8000-000000000001')->'poll'->'creation_spec'->>'subtype'<>'compare' then raise exception 'Legacy reader lost comparison setup';end if;
begin perform public.worthit_cast_option_vote('c1000000-0000-4000-8000-000000000001','a');raise exception 'Author voted';exception when insufficient_privilege then null;end;
begin update public.polls set creation_spec=jsonb_set(creation_spec,'{options,0,label}','"Invalid"') where id='c1000000-0000-4000-8000-000000000001';raise exception 'Published setup mutated';exception when invalid_parameter_value or insufficient_privilege then null;end;
end $$;
insert into public.polls(id,author_id,item_name,content_type,price_inr,question,product_url,creation_spec,import_source)
values ('c1000000-0000-4000-8000-000000000002',auth.uid(),'Link-only jacket','post',null,'My pick','https://shop.example/item?variant=navy','{"version":1,"subtype":"post","products":[],"options":[]}','device');
do $$begin
 if (select count(*) from public.polls
     where author_id=auth.uid() and creation_spec is not null
     and (creation_spec->>'subtype', import_source) in
       (('compare','server'), ('opinion','manual'), ('post','device'))) <> 3 then
   raise exception 'Publishing did not retain the creation type and import source';
 end if;
 if public.get_poll_view('c1000000-0000-4000-8000-000000000002')->'poll'->>'product_url'<>'https://shop.example/item?variant=navy' then
   raise exception 'Link-only post lost its source URL';
 end if;
 begin
   insert into public.polls(author_id,item_name,content_type,price_inr,question,product_url)
   values(auth.uid(),'Legacy media-less post','post',null,'My pick','https://shop.example/item');
   raise exception 'Legacy post unexpectedly bypassed media validation';
 exception when check_violation then null;end;
 begin
   perform public.worthit_manage_post('poll','c1000000-0000-4000-8000-000000000002','edit','{"question":"My pick","productUrl":""}');
   raise exception 'Post without product link or media accepted';
 exception when check_violation then null;end;
end $$;

set local "request.jwt.claim.sub"='c0000000-0000-4000-8000-000000000002';
do $$begin
begin perform public.cast_vote('c1000000-0000-4000-8000-000000000001','buy',null,false);raise exception 'Generic vote accepted for comparison';exception when invalid_parameter_value then null;end;
begin perform public.worthit_cast_option_vote('c1000000-0000-4000-8000-000000000001','absent');raise exception 'Invalid product vote accepted';exception when invalid_parameter_value then null;end;
perform public.worthit_cast_option_vote('c1000000-0000-4000-8000-000000000001','b');
begin perform public.worthit_cast_option_vote('c1000000-0000-4000-8000-000000000001','a');raise exception 'Duplicate vote accepted';exception when unique_violation then null;end;
if public.worthit_option_results('c1000000-0000-4000-8000-000000000001')->'counts'->>'b'<>'1' or public.worthit_option_results('c1000000-0000-4000-8000-000000000001')->>'my_option'<>'b' then raise exception 'Counts or own choice incorrect';end if;
end $$;
set local "request.jwt.claim.sub"='c0000000-0000-4000-8000-000000000001';select public.set_social_privacy(true);
set local "request.jwt.claim.sub"='c0000000-0000-4000-8000-000000000002';
do $$begin begin perform public.worthit_option_results('c1000000-0000-4000-8000-000000000001');raise exception 'Private comparison results leaked';exception when no_data_found then null;end;end $$;
reset role;insert into auth.mfa_factors(user_id,status)values('c0000000-0000-4000-8000-000000000002','verified');set local role authenticated;
do $$begin begin perform public.worthit_option_results('c1000000-0000-4000-8000-000000000001');raise exception 'AAL1 bypassed creation guards';exception when insufficient_privilege then null;end;end $$;

rollback;
