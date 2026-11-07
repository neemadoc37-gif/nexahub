-- SUPERSEDED: the current app uses the owner's existing public.profiles table.
-- Do not run this optional historical migration for the current marketplace.
-- No migration should be repeated to verify authentication.
begin;

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 32),
  country text not null default '' check (char_length(country) <= 80),
  created_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from public, anon, authenticated;
grant select on public.customer_profiles to authenticated;
grant update (full_name, phone, country) on public.customer_profiles to authenticated;

drop policy if exists customer_profile_read_own on public.customer_profiles;
create policy customer_profile_read_own
  on public.customer_profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists customer_profile_update_own on public.customer_profiles;
create policy customer_profile_update_own
  on public.customer_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.customer_profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

revoke all on function public.handle_new_customer_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
  after insert on auth.users
  for each row execute function public.handle_new_customer_profile();

insert into public.customer_profiles (id, full_name)
select
  users.id,
  left(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', ''), 120)
from auth.users as users
on conflict (id) do nothing;

commit;
