create function public.valid_poll_media(p_media jsonb, p_author uuid)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p_media) <> 'array' then false
    when jsonb_array_length(p_media) > 24 then false
    else not exists (
      select 1 from jsonb_array_elements(p_media) item
      where not coalesce(
        jsonb_typeof(item) = 'object'
        and item->>'kind' in ('image', 'video')
        and item->>'value' like p_author::text || '/%'
        and split_part(item->>'value', '/', 2) ~ '^[0-9a-f-]{36}\.(jpg|mp4)$'
        and item->>'value' = split_part(item->>'value', '/', 1) || '/' || split_part(item->>'value', '/', 2)
        and right(item->>'value', 4) = case when item->>'kind' = 'image' then '.jpg' else '.mp4' end
        and (item->>'sourceUrl' is null or (item->>'kind' = 'image' and char_length(item->>'sourceUrl') <= 2048
          and item->>'sourceUrl' ~ '^https://[^/@[:space:]]+([/?#]|$)'))
        and not (item ? 'device'), false
      )
    ) end;
$$;

alter table public.polls add column media_gallery jsonb not null default '[]'::jsonb;
alter table public.polls add constraint polls_media_gallery_valid check (public.valid_poll_media(media_gallery, author_id));
alter table public.polls drop constraint polls_demo_or_authored;
alter table public.polls add constraint polls_demo_or_authored check (
  (is_demo and author_id is null and media_gallery = '[]'::jsonb)
  or (not is_demo and author_id is not null and (image_path is not null or product_url is not null or media_gallery <> '[]'::jsonb))
);

create function public.get_poll_media(p_ids uuid[])
returns table (id uuid, media jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.media_gallery from public.polls p
  where p.id = any(p_ids) and p.media_gallery <> '[]'::jsonb;
$$;

revoke all on function public.get_poll_media(uuid[]) from public, anon, authenticated;
grant execute on function public.get_poll_media(uuid[]) to anon, authenticated;
