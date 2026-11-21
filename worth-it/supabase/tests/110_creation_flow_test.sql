begin;
insert into auth.users(id,raw_user_meta_data)values('c0000000-0000-4000-8000-000000000001','{"worthit_username":"creator_owner"}'),('c0000000-0000-4000-8000-000000000002','{"worthit_username":"creator_viewer"}');
set local role authenticated;set local "request.jwt.claim.sub"='c0000000-0000-4000-8000-000000000001';
insert into public.polls(id,author_id,item_name,price_inr,question,product_url,creation_spec)values('c1000000-0000-4000-8000-000000000001',auth.uid(),'Shirt A',null,'Which one should I buy?','https://www.myntra.com/a','{"version":1,"subtype":"compare","products":[{"id":"a","name":"Shirt A","media":[],"url":"https://www.myntra.com/a"},{"id":"b","name":"Shirt B","media":[],"url":"https://www.ajio.com/b"}],"options":[{"id":"a","label":"Shirt A","productId":"a"},{"id":"b","label":"Shirt B","productId":"b"}]}');
do $$begin
if public.get_poll_view('c1000000-0000-4000-8000-000000000001')->'poll'->'creation_spec'->>'subtype'<>'compare' then raise exception 'Legacy reader lost comparison setup';end if;
begin perform public.worthit_cast_option_vote('c1000000-0000-4000-8000-000000000001','a');raise exception 'Author voted';exception when insufficient_privilege then null;end;
begin update public.polls set creation_spec=jsonb_set(creation_spec,'{options,0,label}','"Invalid"') where id='c1000000-0000-4000-8000-000000000001';raise exception 'Published setup mutated';exception when invalid_parameter_value or insufficient_privilege then null;end;
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
