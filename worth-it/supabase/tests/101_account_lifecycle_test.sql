begin;
insert into auth.users(id,raw_user_meta_data)values('b0000000-0000-4000-8000-000000000001','{"worthit_username":"life_owner"}'),('b0000000-0000-4000-8000-000000000002','{"worthit_username":"life_viewer"}');
set local role authenticated;set local "request.jwt.claim.sub"='b0000000-0000-4000-8000-000000000001';
set local "request.jwt.claims"='{"is_anonymous":false,"aal":"aal1","amr":[]}';
do $$begin
begin perform public.worthit_deactivate(true);raise exception 'Stale auth deactivated account';exception when insufficient_privilege then null;end;
begin perform public.request_account_deletion();raise exception 'Stale auth deleted account';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('is_anonymous',false,'aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now()))))::text,true);
select public.worthit_deactivate(true);
do $$begin
if public.worthit_account_state()->>'deactivated'<>'true' then raise exception 'Deactivation missing';end if;
begin perform public.worthit_settings('{"autoplay":false}');raise exception 'Deactivated account wrote settings';exception when insufficient_privilege then null;end;
end $$;
set local "request.jwt.claim.sub"='b0000000-0000-4000-8000-000000000002';
do $$begin
if exists(select 1 from public.social_profile_card('b0000000-0000-4000-8000-000000000001')) or exists(select 1 from public.search_social_profiles('life_owner')) then raise exception 'Deactivated profile visible';end if;
end $$;
set local "request.jwt.claim.sub"='b0000000-0000-4000-8000-000000000001';
select public.worthit_deactivate(false);
select public.worthit_report_problem('b1000000-0000-4000-8000-000000000001','An issue in settings',null);
select public.worthit_report_problem('b1000000-0000-4000-8000-000000000001','An issue in settings',null);

insert into storage.objects(bucket_id,name,owner) values('poll-photos','b0000000-0000-4000-8000-000000000001/support/b1000000-0000-4000-8000-000000000002.jpg','b0000000-0000-4000-8000-000000000001');
select public.worthit_report_problem('b1000000-0000-4000-8000-000000000002','Screenshot issue','b0000000-0000-4000-8000-000000000001/support/b1000000-0000-4000-8000-000000000002.jpg');
do $$begin if not public.can_read_social_object('poll-photos','b0000000-0000-4000-8000-000000000001/support/b1000000-0000-4000-8000-000000000002.jpg') then raise exception 'Owner screenshot unavailable';end if;end $$;
set local "request.jwt.claim.sub"='b0000000-0000-4000-8000-000000000002';
do $$begin
if public.can_read_social_object('poll-photos','b0000000-0000-4000-8000-000000000001/support/b1000000-0000-4000-8000-000000000002.jpg') then raise exception 'Private screenshot leaked';end if;
begin perform public.worthit_report_problem(gen_random_uuid(),'Foreign screenshot','b0000000-0000-4000-8000-000000000001/support/b1000000-0000-4000-8000-000000000002.jpg');raise exception 'Foreign screenshot accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$begin if not public.worthit_object_referenced('poll-photos','b0000000-0000-4000-8000-000000000001/support/b1000000-0000-4000-8000-000000000002.jpg') then raise exception 'Cleanup would delete support screenshot';end if;end $$;
set local "request.jwt.claim.sub"='b0000000-0000-4000-8000-000000000001';

reset role;
insert into auth.mfa_factors(user_id,status)values('b0000000-0000-4000-8000-000000000001','verified');
set local role authenticated;
do $$begin
begin perform public.worthit_settings();raise exception 'AAL1 bypassed MFA through RPC';exception when insufficient_privilege then null;end;
if exists(select 1 from public.social_profiles where id=auth.uid()) then raise exception 'AAL1 bypassed MFA through table read';end if;
begin perform public.request_account_deletion();raise exception 'AAL1 deletion bypassed MFA';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('is_anonymous',false,'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now()))))::text,true);
select public.worthit_settings('{"autoplay":false}');
select public.request_account_deletion();
reset role;
do $$begin
if (select count(*) from public.product_feedback where id='b1000000-0000-4000-8000-000000000001')<>1 then raise exception 'Report retry duplicated';end if;
if not exists(select 1 from public.account_deletion_requests where user_id='b0000000-0000-4000-8000-000000000001') then raise exception 'Deletion was not queued';end if;
end $$;
rollback;
