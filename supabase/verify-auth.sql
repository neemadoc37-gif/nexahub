-- READ ONLY. This inspects schema/security metadata, never customer records.
-- This is NOT a migration and should not change the existing marketplace.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select_granted,
  has_table_privilege('authenticated', c.oid, 'SELECT') as customer_select_granted
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles';

select
  t.tgname as trigger_name,
  t.tgenabled as enabled,
  pg_get_triggerdef(t.oid) as trigger_definition,
  p.proname as function_name,
  position('profiles' in pg_get_functiondef(p.oid)) > 0
    as function_mentions_profiles
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
