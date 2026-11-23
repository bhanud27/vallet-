begin;

alter table public.polls drop constraint polls_content_details;
alter table public.polls add constraint polls_content_details check (
  (content_type = 'poll' and char_length(btrim(question)) between 1 and 200
    and (price_inr is not null or (creation_spec is not null and creation_spec->>'subtype' in ('opinion', 'compare'))))
  or
  (content_type = 'post' and not is_demo and price_inr is null
    and char_length(question) <= 2000
    and (image_path is not null or jsonb_array_length(media_gallery) > 0
      or (creation_spec->>'subtype' is not distinct from 'post' and public.worthit_creation_url_valid(product_url))))
);

commit;
