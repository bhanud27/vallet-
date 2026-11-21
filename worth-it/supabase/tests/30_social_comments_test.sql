begin;

insert into auth.users (id, raw_user_meta_data) values
  ('30000000-0000-4000-8000-000000000001', '{"worthit_username":"comment_owner"}'),
  ('30000000-0000-4000-8000-000000000002', '{"worthit_username":"comment_viewer"}'),
  ('30000000-0000-4000-8000-000000000003', '{"worthit_username":"comment_other"}');

insert into public.polls (id, author_id, item_name, price_inr, question, product_url)
values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  'Walking shoes', 100, 'Worth it?', 'https://example.com/shoes');
insert into public.social_reels (id, author_id, caption, video_path, product_url)
values ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Running shoes',
  '30000000-0000-4000-8000-000000000001/reels/40000000-0000-4000-8000-000000000002.mp4', 'https://example.com/reel');

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000001';
select public.set_social_privacy(true);

set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000002';
select public.set_social_follow('30000000-0000-4000-8000-000000000001', true);
do $$
declare reel uuid := '40000000-0000-4000-8000-000000000002';
begin
  if exists (select 1 from public.get_reel_product_links(array[reel])) then
    raise exception 'Pending followers cannot read product links';
  end if;
  begin
    perform public.list_social_comments('reel', reel);
    raise exception 'Pending followers cannot read comments';
  exception when no_data_found then null;
  end;
  begin
    perform public.add_social_comment('reel', reel, gen_random_uuid(), 'Blocked');
    raise exception 'Pending followers cannot comment';
  exception when no_data_found then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.list_social_notifications() where kind = 'follow_request') <> 1 then
    raise exception 'The owner should see the request notification';
  end if;
end;
$$;
select public.respond_social_follow('30000000-0000-4000-8000-000000000002', true);

set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000002';
do $$
declare poll uuid := '40000000-0000-4000-8000-000000000001';
        reel uuid := '40000000-0000-4000-8000-000000000002';
        retry_id uuid := gen_random_uuid();
begin
  if (select product_url from public.get_reel_product_links(array[reel])) is distinct from 'https://example.com/reel' then
    raise exception 'Accepted followers should see the product link';
  end if;
  perform public.add_social_comment('poll', poll, retry_id, '  Good price  ');
  perform public.add_social_comment('poll', poll, retry_id, '  Good price  ');
  perform public.add_social_comment('reel', reel, gen_random_uuid(), 'Nice reel');
  if (select count(*) from public.list_social_comments('poll', poll) where body = 'Good price' and username = 'comment_viewer') <> 1
    or (select count(*) from public.list_social_comments('reel', reel) where body = 'Nice reel') <> 1 then
    raise exception 'Comments should be trimmed, isolated by target and deduplicated on retry';
  end if;
  begin
    perform public.add_social_comment('poll', poll, gen_random_uuid(), '   ');
    raise exception 'Blank comments must be rejected';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.list_social_notifications()) then
    raise exception 'The author of comments should not see the owner notification';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.list_social_notifications() where kind in ('poll_comment', 'reel_comment')) <> 2
    or (select count(*) from public.list_social_notifications() where kind = 'follow') <> 1 then
    raise exception 'The owner should see the two comment notifications and accepted follow';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000003';
do $$
begin
  if exists (select 1 from public.list_social_notifications()) then
    raise exception 'Unrelated accounts must not receive owner activity';
  end if;
  begin
    perform public.list_social_comments('poll', '40000000-0000-4000-8000-000000000001');
    raise exception 'Unrelated accounts must not read the private thread';
  exception when no_data_found then null;
  end;
end;
$$;

rollback;
