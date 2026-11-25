-- Worth It publishing repair for Supabase project ahplnvlmfjphrxqulisd.
-- Run the entire file once in that project's SQL Editor.
-- It applies the two existing migration bodies without changing migration history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regprocedure('public.worthit_creation_ready()') is null then
    raise exception 'Install the existing Worth It creation flow before running this repair.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'polls'
      and column_name = 'import_source'
  ) or exists (
    select 1 from pg_constraint
    where conrelid = 'public.polls'::regclass and conname = 'polls_content_details'
      and pg_get_constraintdef(oid) like '%worthit_creation_url_valid%'
  ) then
    raise exception 'The publishing schema has changed. Check which migration is already installed before retrying.';
  end if;
end
$preflight$;

-- From 20261122053448_link_preview_posts.sql
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

-- From 20261123125510_product_import_source.sql
alter table public.polls add column import_source text
  check (import_source in ('server', 'device', 'manual'));

create or replace function public.worthit_creation_url_valid(value text)
returns boolean language sql immutable set search_path = '' as $$
  select value is not null and length(value) <= 2048
    and value ~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+([/?#]|$)'
    and split_part(split_part(value, '://', 2), '/', 1) !~* '\.(local|internal|localhost|home|lan)([?#]|$)';
$$;

alter table public.polls drop constraint polls_product_url_check;
alter table public.polls add constraint polls_product_url_check check (
  product_url is null or (char_length(product_url) <= 2048 and product_url ~ '^https?://[^/@[:space:]]+([/?#]|$)')
);

-- Preserve the existing edit RPC's authorization and update only its link validation.
do $update_edit$
declare
  definition text := pg_get_functiondef('public.worthit_manage_post(text,uuid,text,jsonb)'::regprocedure);
  old_check text := $previous$(length(link)>2048 or link !~ '^https://[^/@[:space:]]+([/?#]|$)')$previous$;
  new_check text := $current$(length(link)>2048 or link !~ '^https?://[^/@[:space:]]+([/?#]|$)' or (p_kind <> 'poll' and link !~ '^https://'))$current$;
begin
  if strpos(definition, old_check) = 0 or strpos(definition, 'public.worthit_require_session()') = 0 then
    raise exception 'The expected session-protected post edit function is required.';
  end if;
  execute replace(replace(definition, old_check, new_check), 'Enter a valid HTTPS product link.', 'Enter a valid public product link.');
end
$update_edit$;

notify pgrst, 'reload schema';

commit;

-- Expected result: true for both columns.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'polls'
      and column_name = 'import_source'
  ) as import_source_ready,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.polls'::regclass and conname = 'polls_content_details'
      and pg_get_constraintdef(oid) like '%worthit_creation_url_valid%'
  ) as link_only_post_ready;
