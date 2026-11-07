-- READ ONLY: schema/security metadata, not customer rows or a migration.
-- Run in the existing Supabase project's SQL Editor. Export each result grid.
-- Review exports before sharing: custom default expressions/policy definitions
-- could contain private configuration if earlier custom code embedded it.
-- Do not send credentials or customer data.

-- 1. Existing columns, types, defaults and nullability.
select table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','seller_profiles','categories','products',
                    'orders','order_items','payment_transactions','bookings')
order by table_name, ordinal_position;

-- 2. RLS and owner status. A granted SELECT does not bypass enabled RLS.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as table_owner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
  and c.relname in ('profiles','seller_profiles','categories','products',
                   'orders','order_items','payment_transactions','bookings')
order by c.relname;

-- 3. Existing row policies, including their write checks.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','seller_profiles','categories','products',
                    'orders','order_items','payment_transactions','bookings')
order by tablename, policyname;

-- 4. Existing table and column grants to public API roles.
select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('profiles','seller_profiles','categories','products',
                    'orders','order_items','payment_transactions','bookings')
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name, grantee, privilege_type;

select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('profiles','seller_profiles','categories','products',
                    'orders','order_items','payment_transactions','bookings')
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name, column_name, grantee, privilege_type;

-- 5. Relationships, unique/primary keys, checks and validation state.
select c.relname as table_name, con.conname, con.contype,
       con.convalidated, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','seller_profiles','categories','products',
                   'orders','order_items','payment_transactions','bookings')
order by c.relname, con.conname;

-- 6. Index definitions, including partial/unique indexes.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('profiles','seller_profiles','categories','products',
                    'orders','order_items','payment_transactions','bookings')
order by tablename, indexname;

-- 7. Provisioning and marketplace triggers: names/definitions, not function bodies.
select n.nspname as table_schema, c.relname as table_name,
       t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as trigger_definition,
       pn.nspname as function_schema, p.proname as function_name,
       p.prosecdef as security_definer, p.proconfig as function_settings
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal and
  ((n.nspname = 'auth' and c.relname = 'users') or
   (n.nspname = 'public' and c.relname in
     ('profiles','seller_profiles','categories','products','orders',
      'order_items','payment_transactions','bookings')))
order by n.nspname, c.relname, t.tgname;

-- 8. Existing public RPC signatures/privileges, without bodies or argument defaults.
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as returns,
       p.prosecdef as security_definer, p.proconfig as function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as customer_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname, p.oid;
