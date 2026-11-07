-- READ ONLY. Run in the existing NexaHub Supabase project's SQL Editor.
-- This single SELECT returns one JSON value containing schema metadata.
-- It does not read customer rows, change tables, change policies or run a migration.
-- Export the result as JSON and upload it for inspection.
-- Review custom default/policy/trigger/view expressions before sharing in case
-- existing custom SQL has embedded credentials. Never upload connection strings.

with application_relations as (
  select c.oid, n.nspname as schema_name, c.relname as table_name,
         c.relkind, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
    and n.nspname not like 'pg_%'
    and n.nspname not in (
      'information_schema', 'auth', 'storage', 'realtime', 'extensions',
      'vault', 'supabase_migrations', 'graphql', 'graphql_public', 'net',
      'pgsodium', 'pgsodium_masks', 'cron', 'repack'
    )
)
select jsonb_build_object(
  'tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name, 'kind', r.relkind,
      'rls_enabled', r.relrowsecurity, 'force_rls', r.relforcerowsecurity,
      'view_definition', case when r.relkind in ('v', 'm')
        then pg_get_viewdef(r.oid, true) else null end
    ) order by r.schema_name, r.table_name)
    from application_relations r
  ), '[]'::jsonb),
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name, 'position', a.attnum,
      'column', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull, 'identity', a.attidentity,
      'generated', a.attgenerated,
      'default', pg_get_expr(d.adbin, d.adrelid)
    ) order by r.schema_name, r.table_name, a.attnum)
    from application_relations r
    join pg_attribute a on a.attrelid = r.oid
    left join pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped
  ), '[]'::jsonb),
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name,
      'name', con.conname, 'type', con.contype,
      'validated', con.convalidated,
      'definition', pg_get_constraintdef(con.oid, true),
      'references_schema', target_ns.nspname,
      'references_table', target.relname
    ) order by r.schema_name, r.table_name, con.conname)
    from application_relations r
    join pg_constraint con on con.conrelid = r.oid
    left join pg_class target on target.oid = con.confrelid
    left join pg_namespace target_ns on target_ns.oid = target.relnamespace
  ), '[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(to_jsonb(p) order by p.schemaname, p.tablename, p.policyname)
    from pg_policies p
    join application_relations r
      on r.schema_name = p.schemaname and r.table_name = p.tablename
  ), '[]'::jsonb),
  'table_grants', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.table_schema, g.table_name, g.grantee, g.privilege_type)
    from information_schema.table_privileges g
    join application_relations r
      on r.schema_name = g.table_schema and r.table_name = g.table_name
  ), '[]'::jsonb),
  'column_grants', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.table_schema, g.table_name, g.column_name, g.grantee)
    from information_schema.column_privileges g
    join application_relations r
      on r.schema_name = g.table_schema and r.table_name = g.table_name
  ), '[]'::jsonb),
  'indexes', coalesce((
    select jsonb_agg(to_jsonb(i) order by i.schemaname, i.tablename, i.indexname)
    from pg_indexes i
    join application_relations r
      on r.schema_name = i.schemaname and r.table_name = i.tablename
  ), '[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name,
      'trigger', t.tgname, 'enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid, true),
      'function_schema', fn.nspname, 'function', f.proname,
      'security_definer', f.prosecdef
    ) order by r.schema_name, r.table_name, t.tgname)
    from application_relations r
    join pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal
    join pg_proc f on f.oid = t.tgfoid
    join pg_namespace fn on fn.oid = f.pronamespace
  ), '[]'::jsonb),
  'functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by n.nspname, p.proname, p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f'
      and n.nspname in (select distinct schema_name from application_relations union select 'public')
      and not exists (
        select 1 from pg_depend dep
        where dep.classid = 'pg_proc'::regclass and dep.objid = p.oid
          and dep.deptype = 'e'
      )
  ), '[]'::jsonb)
) as nexahub_delivery_schema_inspection;
