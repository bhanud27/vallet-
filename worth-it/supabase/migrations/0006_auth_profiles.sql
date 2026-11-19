-- Supabase Auth stores login email and password hashes. The app exposes only profile fields.
create function public.sync_worthit_signup_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_name text := left(btrim(new.raw_user_meta_data->>'worthit_display_name'), 40);
begin
  if new_name is null or new_name = '' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.raw_user_meta_data->>'worthit_display_name' is not distinct from
      old.raw_user_meta_data->>'worthit_display_name' then return new; end if;
  end if;
  insert into public.social_profiles (id, display_name) values (new.id, new_name)
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;

revoke all on function public.sync_worthit_signup_profile() from public, anon, authenticated;

create trigger sync_worthit_signup_profile
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_worthit_signup_profile();
