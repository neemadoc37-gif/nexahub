-- Customer-owned profile data. Authentication identities remain in auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  country text not null default '',
  created_at timestamptz not null default now()
);

-- Extend the existing profile table without replacing existing customer data.
alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists country text not null default '';

alter table public.profiles
  drop constraint if exists profiles_full_name_max_length,
  add constraint profiles_full_name_max_length
    check (char_length(full_name) <= 120) not valid,
  drop constraint if exists profiles_phone_max_length,
  add constraint profiles_phone_max_length
    check (phone is null or char_length(phone) <= 32) not valid,
  drop constraint if exists profiles_country_max_length,
  add constraint profiles_country_max_length
    check (country is null or char_length(country) <= 80) not valid;

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, country) on public.profiles to authenticated;

-- Replace legacy profile policies so no permissive policy can expose other
-- customers' records alongside the policies below.
do $block$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end;
$block$;

create policy "Customers can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Customers can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      ),
      120
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

revoke all on function public.handle_new_customer_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_customer_profile();

-- Backfill existing accounts. Run as the Supabase SQL Editor owner.
insert into public.profiles (id, full_name)
select
  users.id,
  left(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', ''), 120)
from auth.users as users
on conflict (id) do update
set full_name = case
  when public.profiles.full_name = '' then excluded.full_name
  else public.profiles.full_name
end;
