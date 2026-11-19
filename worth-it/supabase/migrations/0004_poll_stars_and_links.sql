alter table public.polls add column product_url text check (
  product_url is null or (char_length(product_url) <= 2048 and product_url ~ '^https://[^/@[:space:]]+([/?#]|$)')
);

alter table public.polls drop constraint polls_demo_or_authored;
alter table public.polls add constraint polls_demo_or_authored check (
  (is_demo and author_id is null)
  or (not is_demo and author_id is not null and (image_path is not null or product_url is not null))
);

grant select, insert, update, delete on public.polls, public.purchase_updates to authenticated;

create table public.poll_stars (
  poll_id uuid references public.polls (id) on delete cascade,
  viewer_id uuid references auth.users (id) on delete cascade,
  primary key (poll_id, viewer_id)
);

alter table public.poll_stars enable row level security;
revoke all on public.poll_stars from anon, authenticated;

create function public.get_poll_extras(p_ids uuid[])
returns table (id uuid, product_url text, stars bigint, starred boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.product_url,
    (select count(*) from public.poll_stars s where s.poll_id = p.id),
    exists (select 1 from public.poll_stars s where s.poll_id = p.id and s.viewer_id = auth.uid())
  from public.polls p where p.id = any(p_ids);
$$;

create function public.set_poll_star(p_id uuid, p_starred boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.polls where id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_starred then
    insert into public.poll_stars (poll_id, viewer_id) values (p_id, auth.uid()) on conflict do nothing;
  else
    delete from public.poll_stars where poll_id = p_id and viewer_id = auth.uid();
  end if;
  return (select to_jsonb(result) from public.get_poll_extras(array[p_id]) result);
end;
$$;

revoke all on function public.get_poll_extras(uuid[]), public.set_poll_star(uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_poll_extras(uuid[]) to anon, authenticated;
grant execute on function public.set_poll_star(uuid, boolean) to authenticated;
