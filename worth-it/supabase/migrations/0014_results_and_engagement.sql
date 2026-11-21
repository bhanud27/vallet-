begin;
create index if not exists votes_poll_page on public.votes(poll_id,created_at desc,id desc);
create function public.worthit_poll_page(p_id uuid,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'poll',to_jsonb(p)-'author_id'-'media_gallery'||jsonb_build_object('author_id',p.author_id,'username',s.username),
 'is_author',p.author_id=auth.uid(),
 'my_choice',(select choice from public.votes where poll_id=p.id and voter_id=auth.uid()),
 'summary',(select jsonb_build_object('buy',count(*) filter(where choice='buy'),'wait',count(*) filter(where choice='wait'),'skip',count(*) filter(where choice='skip'),
 'ownerBuy',count(*) filter(where owns_item and choice='buy'),'ownerWait',count(*) filter(where owns_item and choice='wait'),'ownerSkip',count(*) filter(where owns_item and choice='skip')) from public.votes where poll_id=p.id),
 'votes',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'choice',v.choice,'reason',v.reason,'owns_item',v.owns_item,'helpful',v.helpful_at is not null,'created_at',v.created_at) order by v.created_at desc,v.id desc)
 from (select * from public.votes where poll_id=p.id and nullif(btrim(reason),'') is not null and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 20) v),'[]'::jsonb),
 'update',(select to_jsonb(u)-'poll_id' from public.purchase_updates u where poll_id=p.id))
 from public.polls p left join public.social_profiles s on s.id=p.author_id
 where p.id=p_id and (p.is_demo or public.can_view_social_content(p.author_id));
$$;
create function public.worthit_follow_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.account_blocks where (blocker=new.follower_id and blocked=new.following_id) or (blocked=new.follower_id and blocker=new.following_id))
 then raise exception 'Account unavailable.' using errcode='42501';end if;
 if auth.uid() is not null then perform public.worthit_use_quota('follows',1,100);end if;
 return new;
end $$;
create trigger worthit_follow_limits before insert or update on public.social_follows for each row execute function public.worthit_follow_guard();
create table public.notification_reads(user_id uuid primary key references auth.users(id) on delete cascade,read_at timestamptz not null default now());
alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from public,anon,authenticated;
create function public.worthit_notification_read(p_mark boolean default false) returns timestamptz language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_mark then insert into public.notification_reads(user_id) values(auth.uid()) on conflict(user_id) do update set read_at=now();end if;
 select read_at into stamp from public.notification_reads where user_id=auth.uid();return stamp;
end $$;
create table public.saved_polls(user_id uuid references auth.users(id) on delete cascade,poll_id uuid references public.polls(id) on delete cascade,created_at timestamptz default now(),primary key(user_id,poll_id));
alter table public.saved_polls enable row level security;
revoke all on public.saved_polls from public,anon,authenticated;
create function public.worthit_saved(p_id uuid default null,p_save boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 if p_id is not null and p_save is not null then
 if p_save then
 if not exists(select 1 from public.polls p where p.id=p_id and (p.is_demo or public.can_view_social_content(p.author_id))) then raise exception 'Poll unavailable.' using errcode='42501';end if;
 perform public.worthit_use_quota('saves',1,200);
 insert into public.saved_polls(user_id,poll_id) values(auth.uid(),p_id) on conflict do nothing;
 else delete from public.saved_polls where user_id=auth.uid() and poll_id=p_id;end if;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'itemName',p.item_name,'createdAt',s.created_at) order by s.created_at desc)
 from public.saved_polls s join public.polls p on p.id=s.poll_id where s.user_id=auth.uid() and (p.is_demo or public.can_view_social_content(p.author_id))),'[]'::jsonb);
end $$;
create table public.product_feedback(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,rating int not null check(rating between 1 and 5),message text not null check(length(message) between 1 and 1000),created_at timestamptz default now());
alter table public.product_feedback enable row level security;
revoke all on public.product_feedback from public,anon,authenticated;
create function public.worthit_feedback(p_rating int,p_message text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 perform public.worthit_use_quota('feedback',1,5);
 insert into public.product_feedback(user_id,rating,message) values(auth.uid(),p_rating,btrim(p_message));
end $$;
revoke all on function public.worthit_poll_page(uuid,timestamptz,uuid),public.worthit_follow_guard(),public.worthit_notification_read(boolean),public.worthit_saved(uuid,boolean),public.worthit_feedback(int,text) from public,anon,authenticated;
grant execute on function public.worthit_poll_page(uuid,timestamptz,uuid) to anon,authenticated;
grant execute on function public.worthit_notification_read(boolean),public.worthit_saved(uuid,boolean),public.worthit_feedback(int,text) to authenticated;
notify pgrst,'reload schema';
commit;
