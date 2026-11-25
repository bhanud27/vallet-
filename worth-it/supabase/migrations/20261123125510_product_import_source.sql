begin;

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
