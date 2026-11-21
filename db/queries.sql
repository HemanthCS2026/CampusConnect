-- DBMS query demonstrations using tables and columns from schema.sql.

-- SELECT and ORDER BY: list students with their department and graduation year.
SELECT
    s.student_id,
    s.first_name,
    s.last_name,
    d.dept_name,
    s.gpa,
    s.graduation_year
FROM public.students AS s
JOIN public.departments AS d
  ON d.dept_id = s.dept_id
ORDER BY s.graduation_year, s.last_name, s.first_name;

-- JOIN and ORDER BY: show opportunities with the associated company.
SELECT
    o.opp_id,
    o.title AS opportunity_title,
    o.type AS opportunity_type,
    c.company_name,
    o.salary,
    o.deadline
FROM public.opportunities AS o
JOIN public.companies AS c
  ON c.company_id = o.company_id
ORDER BY o.deadline, c.company_name, o.title;

-- Multiple JOINs: show each application with student, opportunity, and company.
SELECT
    a.app_id,
    a.applied_date,
    a.status AS application_status,
    s.student_id,
    s.first_name,
    s.last_name,
    o.title AS opportunity_title,
    c.company_name
FROM public.applications AS a
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
JOIN public.companies AS c
  ON c.company_id = o.company_id
ORDER BY a.applied_date DESC, a.app_id;

-- GROUP BY and aggregate functions: summarize applications by status.
SELECT
    a.status AS application_status,
    COUNT(*) AS application_count,
    MIN(a.applied_date) AS first_application_date,
    MAX(a.applied_date) AS latest_application_date
FROM public.applications AS a
GROUP BY a.status
ORDER BY application_count DESC, a.status;

-- GROUP BY and HAVING: report departments whose average student GPA is at least 7.
SELECT
    d.dept_name,
    COUNT(s.student_id) AS student_count,
    ROUND(AVG(s.gpa), 2) AS average_gpa,
    MAX(s.gpa) AS highest_gpa
FROM public.departments AS d
JOIN public.students AS s
  ON s.dept_id = d.dept_id
GROUP BY d.dept_id, d.dept_name
HAVING AVG(s.gpa) >= 7.00
ORDER BY average_gpa DESC, d.dept_name;

-- Aggregate functions: compare opportunity counts and average listed salary by company.
SELECT
    c.company_name,
    COUNT(o.opp_id) AS opportunity_count,
    ROUND(AVG(o.salary), 2) AS average_salary
FROM public.companies AS c
LEFT JOIN public.opportunities AS o
  ON o.company_id = c.company_id
GROUP BY c.company_id, c.company_name
ORDER BY opportunity_count DESC, c.company_name;

-- Subquery: find students whose GPA is above their own department's average.
SELECT
    s.student_id,
    s.first_name,
    s.last_name,
    d.dept_name,
    s.gpa
FROM public.students AS s
JOIN public.departments AS d
  ON d.dept_id = s.dept_id
WHERE s.gpa > (
    SELECT AVG(peer.gpa)
    FROM public.students AS peer
    WHERE peer.dept_id = s.dept_id
)
ORDER BY d.dept_name, s.gpa DESC, s.student_id;

-- Subquery: find opportunities with salary above the average non-null opportunity salary.
SELECT
    o.opp_id,
    o.title,
    o.type,
    o.salary,
    c.company_name
FROM public.opportunities AS o
JOIN public.companies AS c
  ON c.company_id = o.company_id
WHERE o.salary > (
    SELECT AVG(salary)
    FROM public.opportunities
    WHERE salary IS NOT NULL
)
ORDER BY o.salary DESC, o.title;

-- -------------------------------------------------------------------------
-- Application-only parameterized query (NOT runnable with psql).
-- -------------------------------------------------------------------------
-- This query is intended for the Next.js application API, which supplies a
-- bound parameter through the PostgreSQL client driver (node-postgres). It is
-- shown here, commented out, so the rest of this file remains safe to run with
-- psql. Pass NULL as the bound value to return applications for all students,
-- or an integer student_id to filter to one student.
--
-- SELECT
--     a.app_id,
--     a.student_id,
--     concat_ws(' ', s.first_name, s.last_name) AS student_name,
--     a.opp_id,
--     o.title AS opportunity_title,
--     c.company_name,
--     a.applied_date,
--     a.status,
--     a.resume_url
-- FROM public.applications AS a
-- JOIN public.students AS s
--   ON s.student_id = a.student_id
-- JOIN public.opportunities AS o
--   ON o.opp_id = a.opp_id
-- JOIN public.companies AS c
--   ON c.company_id = o.company_id
-- WHERE ($1::integer IS NULL OR a.student_id = $1)
-- ORDER BY a.applied_date DESC, a.app_id DESC;

-- psql-compatible demonstration: applications for a selected student.
-- Demonstrates a psql variable. The variable is read at query time, so this
-- single statement is safe to run whether or not the variable is set:
--   * Variable unset (or empty): all applications are returned.
--   * To filter by one student, set the variable before running, for example:
--         psql ... -v student_id=1 -f db/queries.sql
--     or, in an interactive session:
--         \set student_id 1
--         \i db/queries.sql
-- Replace 1 with any existing students.student_id value, or leave it empty
-- to display all students' applications.
SELECT
    a.app_id,
    a.student_id,
    concat_ws(' ', s.first_name, s.last_name) AS student_name,
    a.opp_id,
    o.title AS opportunity_title,
    c.company_name,
    a.applied_date,
    a.status,
    a.resume_url
FROM public.applications AS a
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
JOIN public.companies AS c
  ON c.company_id = o.company_id
WHERE a.student_id = CASE WHEN :'student_id' = '' THEN a.student_id ELSE :'student_id'::int END
ORDER BY a.applied_date DESC, a.app_id DESC;

-- =====================================================================
-- Extended DBMS demonstrations (all read-only)
-- =====================================================================

-- WHERE filtering: open placement opportunities whose deadline has not passed.
-- Demonstrates combining equality and date comparisons in a WHERE clause.
SELECT
    o.opp_id,
    o.title,
    c.company_name,
    o.salary,
    o.deadline
FROM public.opportunities AS o
JOIN public.companies AS c
  ON c.company_id = o.company_id
WHERE o.type = 'Placement'
  AND o.deadline >= CURRENT_DATE
ORDER BY o.deadline, o.title;

-- LIKE pattern matching: students whose last name starts with a given letter.
-- Demonstrates prefix pattern matching with the LIKE operator.
SELECT
    s.student_id,
    s.first_name,
    s.last_name,
    d.dept_name
FROM public.students AS s
JOIN public.departments AS d
  ON d.dept_id = s.dept_id
WHERE s.last_name LIKE 'S%'
ORDER BY s.last_name, s.first_name;

-- DISTINCT: list each industry that has at least one opportunity only once.
-- Demonstrates removing duplicate rows from a joined result set.
SELECT DISTINCT c.industry
FROM public.companies AS c
JOIN public.opportunities AS o
  ON o.company_id = c.company_id
ORDER BY c.industry;

-- UNION: students who applied to at least one placement or internship.
-- UNION removes duplicate rows, so a student who applied to both types
-- appears only once in the combined result.
SELECT s.student_id, s.first_name, s.last_name
FROM public.applications AS a
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
WHERE o.type = 'Placement'
UNION
SELECT s.student_id, s.first_name, s.last_name
FROM public.applications AS a
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
WHERE o.type = 'Internship'
ORDER BY student_id;

-- EXCEPT: students who applied to a placement but not to any internship.
-- EXCEPT returns rows from the first query that are absent from the second.
SELECT s.student_id, s.first_name, s.last_name
FROM public.applications AS a
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
WHERE o.type = 'Placement'
EXCEPT
SELECT s.student_id, s.first_name, s.last_name
FROM public.applications AS a
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
WHERE o.type = 'Internship';

-- Window function: rank students by GPA within their department.
-- RANK() assigns the same rank to tied GPAs and skips the next rank,
-- unlike ROW_NUMBER(), which never ties.
SELECT
    s.student_id,
    s.first_name,
    s.last_name,
    d.dept_name,
    s.gpa,
    RANK() OVER (PARTITION BY s.dept_id ORDER BY s.gpa DESC) AS gpa_rank
FROM public.students AS s
JOIN public.departments AS d
  ON d.dept_id = s.dept_id
ORDER BY d.dept_name, gpa_rank, s.student_id;

-- Multi-table join across the full placement pipeline:
-- placements -> offers -> applications -> students -> opportunities -> companies.
-- Demonstrates following the foreign-key chain from a placement back to the
-- student and company, the same relationship the vw_placement_report view uses.
SELECT
    p.placement_id,
    p.status AS placement_status,
    p.joining_date,
    f.amount AS offer_amount,
    s.student_id,
    s.first_name,
    s.last_name,
    o.title AS opportunity_title,
    c.company_name
FROM public.placements AS p
JOIN public.offers AS f
  ON f.offer_id = p.offer_id
JOIN public.applications AS a
  ON a.app_id = f.app_id
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
JOIN public.companies AS c
  ON c.company_id = o.company_id
ORDER BY p.placement_id;

-- Join involving interviews: non-cancelled interviews with student and
-- opportunity context. Demonstrates joining the interview record back to the
-- application, student, and opportunity it belongs to.
SELECT
    i.interview_id,
    i.interview_date,
    i.type AS interview_type,
    i.status AS interview_status,
    s.first_name,
    s.last_name,
    o.title AS opportunity_title
FROM public.interviews AS i
JOIN public.applications AS a
  ON a.app_id = i.app_id
JOIN public.students AS s
  ON s.student_id = a.student_id
JOIN public.opportunities AS o
  ON o.opp_id = a.opp_id
WHERE i.status <> 'Cancelled'
ORDER BY i.interview_date, i.interview_id;

-- Join involving company_reps and users: each company's representative.
-- Only non-sensitive user columns (username, role) are selected;
-- password_hash is never exposed.
SELECT
    c.company_name,
    r.name AS rep_name,
    u.username,
    u.role
FROM public.companies AS c
JOIN public.company_reps AS r
  ON r.company_id = c.company_id
JOIN public.users AS u
  ON u.user_id = r.user_id
ORDER BY c.company_name, r.name;

-- Users (safe aggregate): number of accounts per role.
-- Demonstrates grouping on the users table without selecting any
-- credentials, password hashes, or other sensitive columns.
SELECT
    u.role,
    COUNT(*) AS user_count
FROM public.users AS u
GROUP BY u.role
ORDER BY user_count DESC, u.role;
