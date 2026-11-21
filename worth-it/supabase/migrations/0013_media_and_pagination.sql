begin;
-- Block and suspension rules also apply to public discovery, not only detail views.
alter function public.discover_shopping_polls(text,integer,integer,text,boolean) rename to worthit_discovery_unfiltered;
revoke all on function public.worthit_discovery_unfiltered(text,integer,integer,text,boolean) from public,anon,authenticated;
create function public.discover_shopping_polls(p_category text,p_min integer,p_max integer,p_query text,p_needs_answer boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(public.worthit_discovery_unfiltered(p_category,p_min,p_max,p_query,p_needs_answer)) item
 where public.can_view_social_content((item->>'author_id')::uuid);
$$;
grant execute on function public.discover_shopping_polls(text,integer,integer,text,boolean) to anon,authenticated;

-- Apply page bounds before aggregation.
create or replace function public.worthit_feed(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 with authors as materialized(
 select id from (select auth.uid() as id union select following_id from public.social_follows where follower_id=auth.uid() and accepted) a
 where public.can_view_social_content(id)
 ), candidates as (
 select p.id,p.created_at,'poll'::text as kind from authors a join public.polls p on p.author_id=a.id where not p.is_demo
 union all
 select r.id,r.created_at,'reel'::text from authors a join public.social_reels r on r.author_id=a.id
 ), page as materialized(
 select * from candidates where p_before is null or (created_at,id)<(p_before,p_before_id)
 order by created_at desc,id desc limit greatest(1,least(p_limit,30))
 )
 select coalesce(jsonb_agg(jsonb_build_object('kind',page.kind,'post',
 case when page.kind='poll' then to_jsonb(p)||jsonb_build_object(
 'username',a.username,'vote_count',(select count(*) from public.votes where poll_id=p.id),
 'update_status',(select status from public.purchase_updates where poll_id=p.id))
 else to_jsonb(r)||jsonb_build_object('username',a.username,'avatar_path',a.avatar_path,
 'liked',exists(select 1 from public.social_reel_likes where reel_id=r.id and viewer_id=auth.uid()),
 'likes',(select count(*) from public.social_reel_likes where reel_id=r.id)) end
 ) order by page.created_at desc,page.id desc),'[]'::jsonb) into result
 from page left join public.polls p on page.kind='poll' and p.id=page.id
 left join public.social_reels r on page.kind='reel' and r.id=page.id
 left join public.social_profiles a on a.id=coalesce(p.author_id,r.author_id);
 return result;
end $$;
revoke all on function public.worthit_feed(timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.worthit_feed(timestamptz,uuid,integer) to authenticated;

-- Author-owned thumbnails share visibility with their original attachment.
create or replace function public.can_read_social_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select (p_bucket='social-media' and (
 exists(select 1 from public.social_profiles where avatar_path=p_name and public.can_view_social_content(id))
 or exists(select 1 from public.social_reels where video_path=p_name and public.can_view_social_content(author_id))
 )) or (p_bucket in ('poll-photos','social-media') and exists(
 select 1 from public.polls p where split_part(p_name,'/',1)=p.author_id::text and public.can_view_social_content(p.author_id)
 and ((p_bucket='poll-photos' and p.image_path=p_name)
 or exists(select 1 from jsonb_array_elements(p.media_gallery) item where
 (item->>'kind'=case when p_bucket='poll-photos' then 'image' else 'video' end and item->>'value'=p_name)
 or (p_bucket='poll-photos' and item->>'kind'='image' and item->>'thumbnail'=p_name
 and p_name=p.author_id::text||'/thumbnails/'||split_part(item->>'value','/',2))
 ))));
$$;
notify pgrst,'reload schema';
commit;
