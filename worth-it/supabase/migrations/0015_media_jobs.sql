begin;
alter table public.polls add column media_state text not null default 'ready' check(media_state in ('pending','ready','failed'));
alter table public.social_reels add column media_state text not null default 'ready' check(media_state in ('pending','ready','failed'));
create table public.media_pipeline_settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into public.media_pipeline_settings(id) values(true);
create table public.media_jobs(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 poll_id uuid references public.polls(id) on delete cascade,reel_id uuid references public.social_reels(id) on delete cascade,
 bucket text not null check(bucket in ('poll-photos','social-media')),source_path text not null,
 state text not null default 'pending' check(state in ('pending','processing','ready','failed')),attempts int not null default 0,
 locked_at timestamptz,created_at timestamptz not null default now(),preview_path text,playback_path text,
 check((poll_id is null)<>(reel_id is null)),unique(poll_id,bucket,source_path),unique(reel_id,bucket,source_path)
);
create index media_jobs_pending on public.media_jobs(state,created_at);
alter table public.media_pipeline_settings enable row level security;
alter table public.media_jobs enable row level security;
revoke all on public.media_pipeline_settings,public.media_jobs from public,anon,authenticated;
grant all on public.media_pipeline_settings,public.media_jobs to service_role;
-- Authenticated clients cannot mark their own uploads as validated.
create function public.worthit_queue_media() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;required boolean;
begin
 select enabled into required from public.media_pipeline_settings where id;
 if tg_op='UPDATE' then
 if auth.uid() is not null then
 new.media_state=old.media_state;
 if tg_table_name='polls' then
 if (new.media_gallery is distinct from old.media_gallery or new.image_path is distinct from old.image_path) then
 raise exception 'Published attachments cannot be replaced.' using errcode='42501';end if;end if;
 end if;return new;
 end if;
 if tg_table_name='polls' then
 new.media_state=case when required and not new.is_demo and (jsonb_array_length(new.media_gallery)>0 or new.image_path is not null) then 'pending' else 'ready' end;
 else new.media_state=case when required then 'pending' else 'ready' end;end if;
 return new;
end $$;
create function public.worthit_enqueue_media() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 if tg_table_name='polls' then
 for item in select * from jsonb_array_elements(new.media_gallery) loop
 insert into public.media_jobs(owner_id,poll_id,bucket,source_path)
 values(new.author_id,new.id,case when item->>'kind'='image' then 'poll-photos' else 'social-media' end,item->>'value') on conflict do nothing;
 end loop;
 if not new.is_demo and new.image_path is not null and jsonb_array_length(new.media_gallery)=0 then
 insert into public.media_jobs(owner_id,poll_id,bucket,source_path) values(new.author_id,new.id,'poll-photos',new.image_path) on conflict do nothing;end if;
 else insert into public.media_jobs(owner_id,reel_id,bucket,source_path) values(new.author_id,new.id,'social-media',new.video_path) on conflict do nothing;end if;
 return new;
end $$;
create trigger worthit_poll_media_gate before insert or update on public.polls for each row execute function public.worthit_queue_media();
create trigger worthit_reel_media_gate before insert or update on public.social_reels for each row execute function public.worthit_queue_media();
create trigger worthit_poll_media_queue after insert on public.polls for each row execute function public.worthit_enqueue_media();
create trigger worthit_reel_media_queue after insert on public.social_reels for each row execute function public.worthit_enqueue_media();
create function public.worthit_claim_media() returns setof public.media_jobs language sql security definer set search_path='' as $$
 update public.media_jobs set state='processing',locked_at=now(),attempts=attempts+1
 where id=(select id from public.media_jobs where (state='pending' or (state='processing' and locked_at<now()-interval '10 minutes')) and attempts<5 order by created_at for update skip locked limit 1)
 returning *;
$$;
create function public.worthit_finish_media(p_id uuid,p_success boolean,p_preview text default null,p_playback text default null)
returns void language plpgsql security definer set search_path='' as $$
declare job public.media_jobs;
begin
 select * into job from public.media_jobs where id=p_id for update;
 if job.id is null then return;end if;
 if (p_preview is not null and p_preview not like job.owner_id::text||'/processed/%') or (p_playback is not null and p_playback not like job.owner_id::text||'/processed/%') then raise exception 'Invalid derivative path.';end if;
 update public.media_jobs set state=case when p_success then 'ready' else 'failed' end,preview_path=p_preview,playback_path=p_playback where id=p_id;
 if job.poll_id is not null then
 update public.polls set media_state=case
 when exists(select 1 from public.media_jobs where poll_id=job.poll_id and state='failed') then 'failed'
 when exists(select 1 from public.media_jobs where poll_id=job.poll_id and state<>'ready') then 'pending' else 'ready' end where id=job.poll_id;
 else update public.social_reels set media_state=case when p_success then 'ready' else 'failed' end where id=job.reel_id;end if;
end $$;
alter function public.can_read_social_object(text,text) rename to worthit_original_object_access;
revoke all on function public.worthit_original_object_access(text,text) from public,anon,authenticated;
create function public.can_read_social_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select (
 public.worthit_original_object_access(p_bucket,p_name)
 and not exists(select 1 from public.polls p where p.media_state<>'ready' and (p.image_path=p_name or exists(select 1 from jsonb_array_elements(p.media_gallery) m where m->>'value'=p_name or m->>'thumbnail'=p_name)))
 and not exists(select 1 from public.media_jobs j left join public.polls p on p.id=j.poll_id left join public.social_reels r on r.id=j.reel_id
 where j.bucket=p_bucket and j.source_path=p_name and coalesce(p.media_state,r.media_state,'failed')<>'ready')
 ) or exists(select 1 from public.media_jobs j left join public.polls p on p.id=j.poll_id left join public.social_reels r on r.id=j.reel_id
 where j.bucket=p_bucket and j.state='ready' and (j.preview_path=p_name or j.playback_path=p_name)
 and coalesce(p.media_state,r.media_state,'failed')='ready' and public.can_view_social_content(j.owner_id));
$$;
create function public.worthit_media_derivatives(p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('poll_id',j.poll_id,'reel_id',j.reel_id,'source_path',j.source_path,'preview_path',j.preview_path,'playback_path',j.playback_path,'state',j.state)),'[]'::jsonb)
 from public.media_jobs j where (j.poll_id=any(p_ids) or j.reel_id=any(p_ids)) and public.can_view_social_content(j.owner_id);
$$;
create function public.worthit_object_referenced(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.polls p where (p_bucket='poll-photos' and p.image_path=p_path) or exists(select 1 from jsonb_array_elements(p.media_gallery) m where m->>'value'=p_path or m->>'thumbnail'=p_path))
 or exists(select 1 from public.social_reels where p_bucket='social-media' and video_path=p_path)
 or exists(select 1 from public.social_profiles where p_bucket='social-media' and avatar_path=p_path)
 or exists(select 1 from public.media_jobs where bucket=p_bucket and (source_path=p_path or preview_path=p_path or playback_path=p_path));
$$;
revoke all on function public.worthit_queue_media(),public.worthit_enqueue_media(),public.worthit_claim_media(),public.worthit_finish_media(uuid,boolean,text,text),public.worthit_object_referenced(text,text),public.worthit_media_derivatives(uuid[]) from public,anon,authenticated;
grant execute on function public.worthit_claim_media(),public.worthit_finish_media(uuid,boolean,text,text),public.worthit_object_referenced(text,text) to service_role;
grant execute on function public.worthit_media_derivatives(uuid[]) to authenticated,anon;
drop policy social_media_read_visible on storage.objects;
create policy social_media_read_visible on storage.objects for select to anon,authenticated
 using(bucket_id in ('poll-photos','social-media') and public.can_read_social_object(bucket_id,name));
revoke all on function public.can_read_social_object(text,text) from public;
grant execute on function public.can_read_social_object(text,text) to anon,authenticated;
create function public.worthit_retry_media(p_poll uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.polls where id=p_poll and author_id=auth.uid()) then raise exception 'Owner required.' using errcode='42501';end if;
 perform public.worthit_use_quota('media_retries',1,5);
 update public.media_jobs set state='pending',attempts=0,locked_at=null where poll_id=p_poll and (state='failed' or (state='processing' and locked_at<now()-interval '10 minutes'));
 -- The gate preserves the current state for client calls; a pending job can still be retried and finish normally.
end $$;
revoke all on function public.worthit_retry_media(uuid) from public,anon,authenticated;
grant execute on function public.worthit_retry_media(uuid) to authenticated;
grant select on public.social_reels to authenticated;
create policy worthit_reel_owner_read on public.social_reels for select to authenticated using(author_id=auth.uid());
notify pgrst,'reload schema';
commit;
