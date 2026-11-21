-- CampusConnect: DML demonstration
-- Demonstrates INSERT, SELECT, UPDATE, and DELETE safely.
-- All changes are rolled back at the end.

BEGIN;

CREATE TEMP TABLE dml_demo_departments (
    demo_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dept_name text NOT NULL
);

-- INSERT
INSERT INTO dml_demo_departments (dept_name)
VALUES ('DBMS Demo Department')
RETURNING demo_id, dept_name;

-- SELECT
SELECT demo_id, dept_name
FROM dml_demo_departments;

-- UPDATE
UPDATE dml_demo_departments
SET dept_name = 'DBMS Demo Department Updated'
WHERE dept_name = 'DBMS Demo Department'
RETURNING demo_id, dept_name;

-- DELETE
DELETE FROM dml_demo_departments
WHERE dept_name = 'DBMS Demo Department Updated'
RETURNING demo_id, dept_name;

-- Confirm the demonstration table is empty.
SELECT COUNT(*) AS remaining_demo_rows
FROM dml_demo_departments;

ROLLBACK;
