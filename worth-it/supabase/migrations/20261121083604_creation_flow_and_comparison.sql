begin;
do $$begin if to_regprocedure('public.worthit_require_session()') is null or to_regprocedure('public.worthit_product_details_valid(jsonb)') is null then raise exception 'Apply the earlier product-details and Settings/security migrations before the creator migration.';end if;end $$;

create function public.worthit_creation_url_valid(value text) returns boolean language sql immutable set search_path='' as $$
 select value is not null and length(value)<=2048 and value ~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+([/?#]|$)' and split_part(split_part(value,'://',2),'/',1) !~* '\.(local|internal|localhost|home|lan)([?#]|$)';
$$;
revoke all on function public.worthit_creation_url_valid(text) from public,anon,authenticated;grant execute on function public.worthit_creation_url_valid(text) to authenticated;
create function public.worthit_creation_valid(value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb;o jsonb;ids text[]='{}';labels text[]='{}';product_ids text[]='{}';product_names text[]='{}';media_ids int[]='{}';index_value jsonb;n int;kind text;
begin
 if value is null then return true;end if;
 if jsonb_typeof(value)<>'object' or octet_length(value::text)>40000 or value-array['version','subtype','products','options','description','location']::text[]<>'{}'::jsonb or (value->>'version') is distinct from '1' or jsonb_typeof(value->'products') is distinct from 'array' or jsonb_typeof(value->'options') is distinct from 'array' then return false;end if;
 kind=value->>'subtype';if kind is null or kind not in ('opinion','compare','post') then return false;end if;
 if value?'description' and (jsonb_typeof(value->'description')<>'string' or length(value->>'description')>500) then return false;end if;
 if value?'location' and (jsonb_typeof(value->'location')<>'string' or length(value->>'location')>120) then return false;end if;
 if jsonb_array_length(value->'products')>4 or jsonb_array_length(value->'options')>4 then return false;end if;
 for p in select * from jsonb_array_elements(value->'products') loop
 if jsonb_typeof(p)<>'object' or p-array['id','name','url','details','media']::text[]<>'{}'::jsonb or jsonb_typeof(p->'id') is distinct from 'string' or coalesce(p->>'id','')!~'^[a-zA-Z0-9_-]{1,64}$' or p->>'id'=any(product_ids) or length(btrim(coalesce(p->>'name',''))) not between 1 and 80 or jsonb_typeof(p->'name')<>'string' or jsonb_typeof(p->'media') is distinct from 'array' then return false;end if;
 if p?'url' and (jsonb_typeof(p->'url')<>'string' or not public.worthit_creation_url_valid(p->>'url')) then return false;end if;
 if p?'details' and not public.worthit_product_details_valid(p->'details') then return false;end if;
 product_ids=array_append(product_ids,p->>'id');product_names=array_append(product_names,p->>'name');
 for index_value in select * from jsonb_array_elements(p->'media') loop
 if jsonb_typeof(index_value)<>'number' or (index_value::text)::numeric<>trunc((index_value::text)::numeric) then return false;end if;
 n=(index_value::text)::int;if n<0 or n>23 or n=any(media_ids) then return false;end if;media_ids=array_append(media_ids,n);
 end loop;end loop;
 for o in select * from jsonb_array_elements(value->'options') loop
 if jsonb_typeof(o)<>'object' or o-array['id','label','productId']::text[]<>'{}'::jsonb or jsonb_typeof(o->'id') is distinct from 'string' or coalesce(o->>'id','')!~'^[a-zA-Z0-9_-]{1,64}$' or o->>'id'=any(ids) or length(btrim(coalesce(o->>'label',''))) not between 1 and 80 or jsonb_typeof(o->'label')<>'string' or lower(btrim(o->>'label'))=any(labels) then return false;end if;
 if kind='opinion' and o?'productId' then return false;end if;
 if kind='compare' and (not coalesce(o->>'productId'=any(product_ids),false) or o->>'label'<>product_names[array_position(product_ids,o->>'productId')] or exists(select 1 from jsonb_array_elements(value->'options') x where x->>'id'<>o->>'id' and x->>'productId'=o->>'productId')) then return false;end if;
 ids=array_append(ids,o->>'id');labels=array_append(labels,lower(btrim(o->>'label')));end loop;
 return case kind when 'post' then cardinality(product_ids)=0 and cardinality(ids)=0 when 'opinion' then cardinality(product_ids)=1 and cardinality(ids) between 2 and 4 else cardinality(product_ids) between 2 and 4 and cardinality(ids)=cardinality(product_ids) end;
exception when others then return false;
end $$;
revoke all on function public.worthit_creation_valid(jsonb) from public,anon,authenticated;
grant execute on function public.worthit_creation_valid(jsonb) to authenticated;
alter table public.polls add column creation_spec jsonb check(public.worthit_creation_valid(creation_spec));
alter table public.polls drop constraint polls_content_details;
alter table public.polls add constraint polls_content_details check(
 (content_type='poll' and char_length(btrim(question)) between 1 and 200 and (price_inr is not null or (creation_spec is not null and creation_spec->>'subtype' in ('opinion','compare'))))
 or (content_type='post' and not is_demo and price_inr is null and char_length(question)<=2000 and (image_path is not null or jsonb_array_length(media_gallery)>0)));
alter table public.votes alter column choice drop not null;
alter table public.votes add column option_id text check(option_id is null or option_id~'^[a-zA-Z0-9_-]{1,64}$');
alter table public.votes add constraint vote_has_choice check(choice is not null or option_id is not null);
create function public.worthit_creation_guard() returns trigger language plpgsql security definer set search_path='' as $$declare p jsonb;i jsonb;begin
 if tg_op='UPDATE' and new.creation_spec is distinct from old.creation_spec then raise exception 'Product and voting setup is fixed after publishing.' using errcode='22023';end if;
 if new.creation_spec is not null then
 if (new.content_type='post')<>(new.creation_spec->>'subtype'='post') then raise exception 'Content subtype mismatch.' using errcode='22023';end if;
 for p in select * from jsonb_array_elements(new.creation_spec->'products') loop for i in select * from jsonb_array_elements(p->'media') loop
 if coalesce(new.media_gallery->(i::text)::int->>'kind','') not in ('image','video') then raise exception 'Invalid product photo reference.' using errcode='22023';end if;
 end loop;end loop;end if;return new;end $$;
create trigger worthit_creation_guard before insert or update on public.polls for each row execute function public.worthit_creation_guard();
create function public.worthit_option_vote_guard() returns trigger language plpgsql security definer set search_path='' as $$declare spec jsonb;begin
 select creation_spec into spec from public.polls where id=new.poll_id;
 if spec is null then if new.option_id is not null or new.choice is null then raise exception 'This poll uses its original choices.' using errcode='22023';end if;
 elsif new.choice is not null or new.option_id is null or not exists(select 1 from jsonb_array_elements(spec->'options') o where o->>'id'=new.option_id) then raise exception 'Choose one of this poll’s options.' using errcode='22023';end if;return new;end $$;
create trigger worthit_option_vote_guard before insert or update of choice,option_id on public.votes for each row execute function public.worthit_option_vote_guard();
create function public.worthit_cast_option_vote(p_id uuid,p_option text,p_reason text default null,p_owns boolean default false) returns void language plpgsql security definer set search_path='' as $$declare p public.polls;begin
 perform public.worthit_require_session();
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 select * into p from public.polls where id=p_id and not is_demo and content_type='poll' and creation_spec is not null for share;
 if p.id is null or not public.worthit_post_access(p.author_id,p.archived_at) then raise exception 'Poll unavailable.' using errcode='P0002';end if;
 if p.author_id=auth.uid() then raise exception 'You cannot vote on your own poll.' using errcode='42501';end if;
 if length(coalesce(p_reason,''))>280 then raise exception 'Keep reasons to 280 characters.' using errcode='22023';end if;
 insert into public.votes(poll_id,voter_id,choice,option_id,reason,owns_item) values(p_id,auth.uid(),null,p_option,nullif(btrim(p_reason),''),coalesce(p_owns,false));
end $$;
create function public.worthit_option_results(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare p public.polls;begin
 perform public.worthit_require_session();select * into p from public.polls where id=p_id and creation_spec is not null;
 if p.id is null or not public.worthit_post_access(p.author_id,p.archived_at) then raise exception 'Poll unavailable.' using errcode='P0002';end if;
 return jsonb_build_object('counts',coalesce((select jsonb_object_agg(option_id,n) from (select option_id,count(*) n from public.votes where poll_id=p_id and option_id is not null group by option_id) counts),'{}'::jsonb),'total',(select count(*) from public.votes where poll_id=p_id),'my_option',(select option_id from public.votes where poll_id=p_id and voter_id=auth.uid()));
end $$;
revoke all on function public.worthit_creation_guard(),public.worthit_option_vote_guard(),public.worthit_cast_option_vote(uuid,text,text,boolean),public.worthit_option_results(uuid) from public,anon,authenticated;
grant execute on function public.worthit_cast_option_vote(uuid,text,text,boolean) to authenticated;
grant execute on function public.worthit_option_results(uuid) to anon,authenticated;
-- Existing JSON readers get the additive setup without changing their signatures.
do $readers$ declare f record;body text;begin
 for f in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_polls','list_social_polls','get_poll_view','worthit_discovery_unfiltered') loop
 body=replace(f.prosrc,$x$'content_type',$x$,$x$'creation_spec',p.creation_spec,'content_type',$x$);execute replace(pg_get_functiondef(f.oid),f.prosrc,body);end loop;
end $readers$;
create or replace function public.worthit_manage_post(p_kind text,p_id uuid,p_action text,p_values jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid;stamp timestamptz;link text;
begin
 perform public.worthit_require_session();
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_kind='poll' then select author_id,archived_at into owner,stamp from public.polls where id=p_id and not is_demo for update;
 elsif p_kind='reel' then select author_id,archived_at into owner,stamp from public.social_reels where id=p_id for update;
 else raise exception 'Invalid post type.' using errcode='22023';end if;
 if owner is null or owner<>auth.uid() then raise exception 'Only the owner can manage this post.' using errcode='42501';end if;
 if p_action='delete' then
 if p_kind='poll' then delete from public.polls where id=p_id;else delete from public.social_reels where id=p_id;end if;
 elsif p_action in ('archive','restore') then
 stamp=case when p_action='archive' then coalesce(stamp,now()) else null end;
 if p_kind='poll' then update public.polls set archived_at=stamp where id=p_id;
 else update public.social_reels set archived_at=stamp where id=p_id;end if;
 elsif p_action='edit' then
 if p_values?'productDetails' and not public.worthit_product_details_valid(p_values->'productDetails') then raise exception 'Invalid product details.' using errcode='22023';end if;
 if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Invalid details.' using errcode='22023';end if;
 perform public.worthit_use_quota('post_edits',1,120);
 link=nullif(btrim(p_values->>'productUrl'),'');
 if link is not null and (length(link)>2048 or link !~ '^https://[^/@[:space:]]+([/?#]|$)') then
 raise exception 'Enter a valid HTTPS product link.' using errcode='22023';end if;
 if p_kind='poll' then
 if exists(select 1 from public.polls where id=p_id and content_type='post') then
 if p_values->>'question' is null then raise exception 'Enter a caption.' using errcode='22023';end if;
 update public.polls set item_name=coalesce(nullif(left(btrim(p_values->>'question'),80),''),'Fashion post'),question=btrim(p_values->>'question'),product_details=case when p_values?'productDetails' then p_values->'productDetails' else product_details end,product_url=link,edited_at=now() where id=p_id;
 else
 if p_values->>'itemName' is null or p_values->>'question' is null or p_values->>'priceInr' is null
 then raise exception 'Enter the poll details.' using errcode='22023';end if;
 update public.polls set item_name=btrim(p_values->>'itemName'),question=btrim(p_values->>'question'),
 price_inr=case when creation_spec is not null then nullif((p_values->>'priceInr')::integer,0) else (p_values->>'priceInr')::integer end,product_details=case when p_values?'productDetails' then p_values->'productDetails' else product_details end,product_url=link,edited_at=now() where id=p_id;
 end if;
 else
 if p_values->>'caption' is null then raise exception 'Enter a caption.' using errcode='22023';end if;
 update public.social_reels set caption=btrim(p_values->>'caption'),product_url=link,edited_at=now() where id=p_id;
 end if;
 else raise exception 'Invalid action.' using errcode='22023';end if;
end $$;
create or replace function public.worthit_sync_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;body text;source uuid;target record;
begin
 kind=case tg_table_name when 'social_comments' then 'comment' when 'social_reels' then 'reel' else 'poll' end;
 if tg_op='DELETE' then delete from public.content_mentions where source_kind=kind and source_id=old.id;return old;end if;
 source=new.id;body=case kind when 'comment' then to_jsonb(new)->>'body' when 'reel' then to_jsonb(new)->>'caption' else coalesce(to_jsonb(new)->>'question','')||' '||coalesce(to_jsonb(new)->'creation_spec'->>'description','') end;
 delete from public.content_mentions where source_kind=kind and source_id=source and target_id not in (select p.id from regexp_matches(lower(body),'(^|[^a-z0-9_.])@([a-z0-9_]{3,40})','g') m join public.social_profiles p on p.username=m[2]);
 for target in select distinct p.id from regexp_matches(lower(body),'(^|[^a-z0-9_.])@([a-z0-9_]{3,40})','g') m join public.social_profiles p on p.username=m[2] where p.id<>new.author_id loop
 if not public.worthit_interaction_allowed(target.id,'mentions') then raise exception 'A mentioned account does not allow this mention.' using errcode='42501';end if;
 insert into public.content_mentions(source_kind,source_id,target_id,author_id) values(kind,source,target.id,new.author_id) on conflict do nothing;
 end loop;return new;end $$;
create function public.worthit_creation_ready() returns boolean language plpgsql stable security definer set search_path='' as $$begin perform public.worthit_require_session();return true;end $$;
revoke all on function public.worthit_creation_ready() from public,anon,authenticated;grant execute on function public.worthit_creation_ready() to authenticated;
notify pgrst,'reload schema';commit;
