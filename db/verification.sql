-- Read-only inspection of the exported public schema and its three views.
-- The transaction guard prevents accidental writes while these checks run.
BEGIN TRANSACTION READ ONLY;

-- List the base tables in the exported schema.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- List primary key, foreign key, unique, and check constraints.
SELECT
    table_name,
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
ORDER BY table_name, constraint_type, constraint_name;

-- List the indexes defined in the exported schema.
SELECT
    tablename AS table_name,
    indexname AS index_name,
    indexdef AS index_definition
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- List views available in the exported schema.
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- List trigger events and their timing/actions.
SELECT
    event_object_table AS table_name,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name, event_manipulation;

-- List user-defined functions, including trigger functions.
SELECT
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_catalog.pg_get_function_result(p.oid) AS return_type,
    language.lanname AS language
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = p.pronamespace
JOIN pg_catalog.pg_language AS language
  ON language.oid = p.prolang
WHERE namespace.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- Inspect the existing student application view.
SELECT *
FROM public.vw_student_applications
ORDER BY student_id, app_id;

-- Inspect the existing interview schedule view.
SELECT *
FROM public.vw_interview_schedule
ORDER BY interview_date, interview_id;

-- Inspect the existing placement report view.
SELECT *
FROM public.vw_placement_report
ORDER BY placement_id;

COMMIT;
