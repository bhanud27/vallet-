-- Runs only against the throwaway database. Roll back fixtures after testing.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', '{"worthit_username":"private_shopper"}'),
  ('10000000-0000-4000-8000-000000000002', '{"worthit_username":"public_shopper"}'),
  ('10000000-0000-4000-8000-000000000003', '{"worthit_username":"other_shopper"}');

insert into public.polls (id, author_id, item_name, price_inr, question, image_path, media_gallery)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  'Private poll', 100, 'Worth it?', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004.jpg',
  '[{"kind":"image","value":"10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004.jpg"}]');

insert into public.social_reels (id, author_id, caption, video_path)
values ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Private reel',
  '10000000-0000-4000-8000-000000000001/reels/20000000-0000-4000-8000-000000000002.mp4');

insert into storage.objects (bucket_id, name)
values ('poll-photos', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004.jpg'),
  ('social-media', '10000000-0000-4000-8000-000000000001/reels/20000000-0000-4000-8000-000000000002.mp4');

do $$
begin
  if exists (select 1 from storage.buckets where id in ('poll-photos', 'social-media') and public) then
    raise exception 'Social content buckets must be private';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';

do $$
declare owner_id uuid := '10000000-0000-4000-8000-000000000001';
begin
  if (select count(*) from public.search_social_profiles('PRIVATE_')) <> 1
    or jsonb_array_length(public.list_social_polls(owner_id)) <> 1 then
    raise exception 'Search and public posts should be available';
  end if;
  perform public.set_social_follow(owner_id, true);
  if (select relationship from public.social_profile_card(owner_id)) <> 'following' then
    raise exception 'Public follows should be accepted immediately';
  end if;
  perform public.set_social_follow(owner_id, false);
end;
$$;

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select public.set_social_privacy(true);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
do $$
declare owner_id uuid := '10000000-0000-4000-8000-000000000001';
        poll_id uuid := '20000000-0000-4000-8000-000000000001';
        reel_id uuid := '20000000-0000-4000-8000-000000000002';
begin
  perform public.set_social_follow(owner_id, true);
  perform public.set_social_follow(owner_id, true);
  if (select relationship from public.social_profile_card(owner_id)) <> 'requested'
    or (select followers from public.social_profile_card(owner_id)) <> 0
    or jsonb_array_length(public.list_social_polls(owner_id)) <> 0
    or public.get_poll_view(poll_id) is not null
    or exists (select 1 from public.get_poll_media(array[poll_id]))
    or exists (select 1 from public.get_poll_extras(array[poll_id]))
    or exists (select 1 from public.social_reel_feed(owner_id))
    or exists (select 1 from storage.objects)
    or exists (select 1 from public.list_social_follow_requests()) then
    raise exception 'Pending followers must not see content, media or the owner inbox';
  end if;
  begin
    perform public.cast_vote(poll_id, 'buy', null, false);
    raise exception 'Private poll vote should fail';
  exception when no_data_found then null;
  end;
  begin
    perform public.set_poll_star(poll_id, true);
    raise exception 'Private poll star should fail';
  exception when no_data_found then null;
  end;
  begin
    perform public.social_set_reel_like(reel_id, true);
    raise exception 'Private reel star should fail';
  exception when no_data_found then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select public.respond_social_follow('10000000-0000-4000-8000-000000000002', true);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.list_social_follow_requests()) <> 1 then
    raise exception 'Only the owner should see and approve this request';
  end if;
end;
$$;
select public.respond_social_follow('10000000-0000-4000-8000-000000000002', true);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
do $$
declare owner_id uuid := '10000000-0000-4000-8000-000000000001';
        viewer_id uuid := '10000000-0000-4000-8000-000000000002';
        poll_id uuid := '20000000-0000-4000-8000-000000000001';
begin
  if (select followers from public.social_profile_card(owner_id)) <> 1
    or (select following from public.social_profile_card(viewer_id)) <> 1
    or jsonb_array_length(public.list_social_polls()) <> 1
    or public.get_poll_view(poll_id) is null
    or (select count(*) from public.list_visible_reels(null, true)) <> 1
    or (select count(*) from storage.objects) <> 2 then
    raise exception 'Accepted follow should update counts, feeds and media access';
  end if;
  perform public.set_social_follow(owner_id, false);
  if jsonb_array_length(public.list_social_polls()) <> 0 or public.get_poll_view(poll_id) is not null
    or exists (select 1 from public.list_visible_reels(null, true)) or exists (select 1 from storage.objects) then
    raise exception 'Unfollow should remove private feed entries and stop fresh media access';
  end if;
  perform public.set_social_follow(owner_id, true);
end;
$$;

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select public.respond_social_follow('10000000-0000-4000-8000-000000000002', false);
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
do $$
begin
  if (select relationship from public.social_profile_card('10000000-0000-4000-8000-000000000001')) <> 'none' then
    raise exception 'Declined request should be removed';
  end if;
end;
$$;

rollback;
