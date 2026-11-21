# CampusConnect Relational Schema

## Source and ER-to-relational mapping

This relational schema is transcribed from the PostgreSQL DDL in
[`schema.sql`](./schema.sql), which is the source of truth for table names,
columns, types, nullability, defaults, and constraints. It describes the
base exported schema. A read-only catalog check against local PostgreSQL 18.6
on 2026-11-20 confirmed the ten base tables and their key schema objects.
Semantic storage tables and full-text indexes were added separately and are
documented in their respective migration files.

The entities and relationships in [`er-diagram.mmd`](./er-diagram.mmd) map to
the relations below:

- Each existing entity is represented by its same-named table and its own
  primary key.
- The student-to-opportunity many-to-many association is represented by
  `public.applications`, with foreign keys to both sides. The composite UNIQUE
  constraint on `(student_id, opp_id)` prevents duplicate pairs.
- One-to-many relationships are represented by a foreign key in the child
  table. A UNIQUE constraint on a foreign key limits the referenced row to at
  most one child in that relationship.
- Every declared foreign-key column is `NOT NULL`, so every existing child row
  must refer to one parent row. The schema does not require any parent row to
  have a child row.

Type names below use the exact PostgreSQL types in the export. `—` means no
column default or column-specific key/check is declared.

## Tables and columns

### `public.users`

**Primary key:** `users_pkey (user_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `user_id` | `integer` | NOT NULL | `nextval('public.users_user_id_seq'::regclass)` | PRIMARY KEY |
| `username` | `character varying(50)` | NOT NULL | — | UNIQUE `users_username_key` |
| `password_hash` | `character varying(255)` | NOT NULL | — | — |
| `role` | `character varying(20)` | NOT NULL | — | CHECK `users_role_check` |

### `public.students`

**Primary key:** `students_pkey (student_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `student_id` | `integer` | NOT NULL | `nextval('public.students_student_id_seq'::regclass)` | PRIMARY KEY |
| `user_id` | `integer` | NOT NULL | — | FOREIGN KEY `students_user_id_fkey` to `public.users(user_id)`; UNIQUE `students_user_id_key` |
| `dept_id` | `integer` | NOT NULL | — | FOREIGN KEY `students_dept_id_fkey` to `public.departments(dept_id)` |
| `first_name` | `character varying(50)` | NOT NULL | — | — |
| `last_name` | `character varying(50)` | NOT NULL | — | — |
| `gpa` | `numeric(4,2)` | NOT NULL | — | CHECK `students_gpa_check`; also checked by `fn_validate_student_gpa()` |
| `graduation_year` | `integer` | NOT NULL | — | CHECK `students_graduation_year_check` |

### `public.departments`

**Primary key:** `departments_pkey (dept_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `dept_id` | `integer` | NOT NULL | `nextval('public.departments_dept_id_seq'::regclass)` | PRIMARY KEY |
| `dept_name` | `character varying(100)` | NOT NULL | — | UNIQUE `departments_dept_name_key` |

### `public.companies`

**Primary key:** `companies_pkey (company_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `company_id` | `integer` | NOT NULL | `nextval('public.companies_company_id_seq'::regclass)` | PRIMARY KEY |
| `company_name` | `character varying(100)` | NOT NULL | — | UNIQUE `companies_company_name_key` |
| `industry` | `character varying(100)` | NOT NULL | — | — |

### `public.company_reps`

**Primary key:** `company_reps_pkey (rep_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `rep_id` | `integer` | NOT NULL | `nextval('public.company_reps_rep_id_seq'::regclass)` | PRIMARY KEY |
| `company_id` | `integer` | NOT NULL | — | FOREIGN KEY `company_reps_company_id_fkey` to `public.companies(company_id)` |
| `user_id` | `integer` | NOT NULL | — | FOREIGN KEY `company_reps_user_id_fkey` to `public.users(user_id)`; UNIQUE `company_reps_user_id_key` |
| `name` | `character varying(100)` | NOT NULL | — | — |

### `public.opportunities`

**Primary key:** `opportunities_pkey (opp_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `opp_id` | `integer` | NOT NULL | `nextval('public.opportunities_opp_id_seq'::regclass)` | PRIMARY KEY |
| `company_id` | `integer` | NOT NULL | — | FOREIGN KEY `opportunities_company_id_fkey` to `public.companies(company_id)` |
| `title` | `character varying(100)` | NOT NULL | — | — |
| `type` | `character varying(20)` | NOT NULL | — | CHECK `opportunities_type_check` |
| `salary` | `numeric(12,2)` | NULL | — | CHECK `opportunities_salary_check` |
| `deadline` | `date` | NOT NULL | — | — |
| `min_gpa` | `numeric(4,2)` | NULL | — | CHECK `opportunities_min_gpa_check` |

### `public.applications`

**Primary key:** `applications_pkey (app_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `app_id` | `integer` | NOT NULL | `nextval('public.applications_app_id_seq'::regclass)` | PRIMARY KEY |
| `student_id` | `integer` | NOT NULL | — | FOREIGN KEY `applications_student_id_fkey` to `public.students(student_id)`; member of composite UNIQUE constraint |
| `opp_id` | `integer` | NOT NULL | — | FOREIGN KEY `applications_opp_id_fkey` to `public.opportunities(opp_id)`; member of composite UNIQUE constraint |
| `applied_date` | `date` | NOT NULL | `CURRENT_DATE` | — |
| `status` | `character varying(20)` | NOT NULL | `'Applied'::character varying` | CHECK `applications_status_check` |
| `resume_url` | `character varying(255)` | NULL | — | — |

### `public.interviews`

**Primary key:** `interviews_pkey (interview_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `interview_id` | `integer` | NOT NULL | `nextval('public.interviews_interview_id_seq'::regclass)` | PRIMARY KEY |
| `app_id` | `integer` | NOT NULL | — | FOREIGN KEY `interviews_app_id_fkey` to `public.applications(app_id)` |
| `interview_date` | `timestamp without time zone` | NOT NULL | — | — |
| `type` | `character varying(50)` | NOT NULL | — | — |
| `status` | `character varying(20)` | NOT NULL | `'Scheduled'::character varying` | CHECK `interviews_status_check` |
| `feedback` | `text` | NULL | — | — |

### `public.offers`

**Primary key:** `offers_pkey (offer_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `offer_id` | `integer` | NOT NULL | `nextval('public.offers_offer_id_seq'::regclass)` | PRIMARY KEY |
| `app_id` | `integer` | NOT NULL | — | FOREIGN KEY `offers_app_id_fkey` to `public.applications(app_id)`; UNIQUE `offers_app_id_key` |
| `offer_date` | `date` | NOT NULL | `CURRENT_DATE` | — |
| `amount` | `numeric(12,2)` | NOT NULL | — | CHECK `offers_amount_check` |
| `status` | `character varying(20)` | NOT NULL | `'Pending'::character varying` | CHECK `offers_status_check` |

### `public.placements`

**Primary key:** `placements_pkey (placement_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `placement_id` | `integer` | NOT NULL | `nextval('public.placements_placement_id_seq'::regclass)` | PRIMARY KEY |
| `offer_id` | `integer` | NOT NULL | — | FOREIGN KEY `placements_offer_id_fkey` to `public.offers(offer_id)`; UNIQUE `placements_offer_id_key`; checked by `fn_validate_placement_offer()` |
| `joining_date` | `date` | NULL | — | — |
| `status` | `character varying(20)` | NOT NULL | `'Pending Joining'::character varying` | CHECK `placements_status_check` |

### `public.opportunity_semantic_content`

**Primary key:** `opportunity_semantic_content_pkey (opp_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `opp_id` | `integer` | NOT NULL | — | PRIMARY KEY; FOREIGN KEY to `public.opportunities(opp_id) ON DELETE CASCADE` |
| `description` | `text` | NULL | — | — |
| `required_skills` | `text[]` | NOT NULL | `ARRAY[]::text[]` | CHECK `opportunity_semantic_content_skills_limit` (`cardinality <= 100`) |
| `updated_at` | `timestamp with time zone` | NOT NULL | `CURRENT_TIMESTAMP` | — |

### `public.opportunity_semantic_embeddings`

**Primary key:** `opportunity_semantic_embeddings_pkey (opp_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `opp_id` | `integer` | NOT NULL | — | PRIMARY KEY; FOREIGN KEY to `public.opportunities(opp_id) ON DELETE CASCADE` |
| `model_name` | `text` | NOT NULL | — | CHECK (`model_name = 'sentence-transformers/all-MiniLM-L6-v2'`) |
| `model_revision` | `text` | NOT NULL | — | CHECK (`model_revision = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'`) |
| `source_hash` | `text` | NOT NULL | — | CHECK (length 64, hex string `^[0-9a-f]{64}$`) |
| `embedding` | `real[]` | NOT NULL | — | CHECK `opportunity_semantic_embeddings_dimensions` (1D, 384D); CHECK `opportunity_semantic_embeddings_finite` |
| `generated_at` | `timestamp with time zone` | NOT NULL | `CURRENT_TIMESTAMP` | — |

### `public.student_semantic_embeddings`

**Primary key:** `student_semantic_embeddings_pkey (student_id)`

| Column | PostgreSQL type | Nullability | Default | Key or column constraint |
|---|---|---|---|---|
| `student_id` | `integer` | NOT NULL | — | PRIMARY KEY; FOREIGN KEY to `public.students(student_id) ON DELETE CASCADE` |
| `model_name` | `text` | NOT NULL | — | CHECK (`model_name = 'sentence-transformers/all-MiniLM-L6-v2'`) |
| `model_revision` | `text` | NOT NULL | — | CHECK (`model_revision = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'`) |
| `source_hash` | `text` | NOT NULL | — | CHECK (length 64, hex string `^[0-9a-f]{64}$`) |
| `embedding` | `real[]` | NOT NULL | — | CHECK `student_semantic_embeddings_dimensions` (1D, 384D); CHECK `student_semantic_embeddings_finite` |
| `generated_at` | `timestamp with time zone` | NOT NULL | `CURRENT_TIMESTAMP` | — |

## Foreign keys and relationships

For each relationship, the child-side foreign key is NOT NULL, so each child
row references exactly one parent. The parent-side minimum is zero because no
constraint requires a child to exist.

| Foreign-key constraint | Child column | Referenced column | Cardinality implied by the schema |
|---|---|---|---|
| `students_user_id_fkey` | `students.user_id` | `users.user_id` | Each student has exactly one user; each user has zero or one student because `students.user_id` is UNIQUE. |
| `students_dept_id_fkey` | `students.dept_id` | `departments.dept_id` | Each student has exactly one department; each department has zero or many students. |
| `company_reps_company_id_fkey` | `company_reps.company_id` | `companies.company_id` | Each representative has exactly one company; each company has zero or many representatives. |
| `company_reps_user_id_fkey` | `company_reps.user_id` | `users.user_id` | Each representative has exactly one user; each user has zero or one representative because `company_reps.user_id` is UNIQUE. |
| `opportunities_company_id_fkey` | `opportunities.company_id` | `companies.company_id` | Each opportunity has exactly one company; each company has zero or many opportunities. |
| `applications_student_id_fkey` | `applications.student_id` | `students.student_id` | Each application has exactly one student; each student has zero or many applications. |
| `applications_opp_id_fkey` | `applications.opp_id` | `opportunities.opp_id` | Each application has exactly one opportunity; each opportunity has zero or many applications. |
| `interviews_app_id_fkey` | `interviews.app_id` | `applications.app_id` | Each interview has exactly one application; each application has zero or many interviews. |
| `offers_app_id_fkey` | `offers.app_id` | `applications.app_id` | Each offer has exactly one application; each application has zero or one offer because `offers.app_id` is UNIQUE. |
| `placements_offer_id_fkey` | `placements.offer_id` | `offers.offer_id` | Each placement has exactly one offer; each offer has zero or one placement because `placements.offer_id` is UNIQUE. |
| `opportunity_semantic_content_pkey` (FK) | `opportunity_semantic_content.opp_id` | `opportunities.opp_id` | Each opportunity has zero or one semantic content row; cascades on delete. |
| `opportunity_semantic_embeddings_pkey` (FK) | `opportunity_semantic_embeddings.opp_id` | `opportunities.opp_id` | Each opportunity has zero or one embedding row; cascades on delete. |
| `student_semantic_embeddings_pkey` (FK) | `student_semantic_embeddings.student_id` | `students.student_id` | Each student has zero or one cached embedding row; cascades on delete. |

`students` and `opportunities` have a many-to-many association through
`applications`. The composite UNIQUE constraint limits each student/opportunity
pair to at most one application; it does not require every student or
opportunity to have an application.

## Table constraints

### Primary keys

| Constraint | Columns |
|---|---|
| `users_pkey` | `users(user_id)` |
| `students_pkey` | `students(student_id)` |
| `departments_pkey` | `departments(dept_id)` |
| `companies_pkey` | `companies(company_id)` |
| `company_reps_pkey` | `company_reps(rep_id)` |
| `opportunities_pkey` | `opportunities(opp_id)` |
| `applications_pkey` | `applications(app_id)` |
| `interviews_pkey` | `interviews(interview_id)` |
| `offers_pkey` | `offers(offer_id)` |
| `placements_pkey` | `placements(placement_id)` |
| `opportunity_semantic_content_pkey` | `opportunity_semantic_content(opp_id)` |
| `opportunity_semantic_embeddings_pkey` | `opportunity_semantic_embeddings(opp_id)` |
| `student_semantic_embeddings_pkey` | `student_semantic_embeddings(student_id)` |

### UNIQUE constraints

| Constraint | Columns | Effect |
|---|---|---|
| `users_username_key` | `users(username)` | Usernames are unique. |
| `students_user_id_key` | `students(user_id)` | At most one student row per user. |
| `departments_dept_name_key` | `departments(dept_name)` | Department names are unique. |
| `companies_company_name_key` | `companies(company_name)` | Company names are unique. |
| `company_reps_user_id_key` | `company_reps(user_id)` | At most one representative row per user. |
| `applications_student_id_opp_id_key` | `applications(student_id, opp_id)` | At most one application per student/opportunity pair. |
| `offers_app_id_key` | `offers(app_id)` | At most one offer per application. |
| `placements_offer_id_key` | `placements(offer_id)` | At most one placement per offer. |

### CHECK constraints

| Constraint | Table and rule |
|---|---|
| `users_role_check` | `users.role` is `Student`, `CompanyRep`, or `Admin`. |
| `students_gpa_check` | `students.gpa` is between 0 and 10. |
| `students_graduation_year_check` | `students.graduation_year >= 2000`. |
| `opportunities_min_gpa_check` | `opportunities.min_gpa` is between 0 and 10 when non-NULL. |
| `opportunities_salary_check` | `opportunities.salary >= 0` when non-NULL. |
| `opportunities_type_check` | `opportunities.type` is `Placement` or `Internship`. |
| `applications_status_check` | `applications.status` is `Applied`, `Interviewing`, `Rejected`, or `Selected`. |
| `interviews_status_check` | `interviews.status` is `Scheduled`, `Completed`, or `Cancelled`. |
| `offers_amount_check` | `offers.amount >= 0`. |
| `offers_status_check` | `offers.status` is `Pending`, `Accepted`, or `Rejected`. |
| `placements_status_check` | `placements.status` is `Pending Joining`, `Joined`, or `Withdrawn`. |
| `opportunity_semantic_content_skills_limit` | `opportunity_semantic_content.required_skills` cardinality $\le$ 100. |
| `opportunity_semantic_embeddings_model_check` | Pinned model `sentence-transformers/all-MiniLM-L6-v2`. |
| `opportunity_semantic_embeddings_revision_check` | Pinned revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. |
| `opportunity_semantic_embeddings_hash_check` | 64-character hexadecimal SHA-256 string. |
| `opportunity_semantic_embeddings_dimensions` | Exactly 384 dimensions (`cardinality = 384` and `array_ndims = 1`). |
| `opportunity_semantic_embeddings_finite` | Vector contains no NULL, NaN, Infinity, or -Infinity elements. |
| `student_semantic_embeddings_model_check` | Pinned model `sentence-transformers/all-MiniLM-L6-v2`. |
| `student_semantic_embeddings_revision_check` | Pinned revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. |
| `student_semantic_embeddings_hash_check` | 64-character hexadecimal SHA-256 string. |
| `student_semantic_embeddings_dimensions` | Exactly 384 dimensions (`cardinality = 384` and `array_ndims = 1`). |
| `student_semantic_embeddings_finite` | Vector contains no NULL, NaN, Infinity, or -Infinity elements. |

## Cardinality and schema limitations

- The foreign keys and nullability establish mandatory parent references for
  child rows. No foreign key declares `ON DELETE` or `ON UPDATE` actions;
  PostgreSQL's default behavior applies.
- The UNIQUE constraints on `students.user_id`, `company_reps.user_id`,
  `offers.app_id`, and `placements.offer_id` establish at-most-one child per
  parent for those relationships. They do not require the parent to have a
  child.
- The schema does not constrain `users.role` to match a row in `students` or
  `company_reps`, nor does it make those two profile types mutually exclusive.
- `interviews.app_id` is not UNIQUE, so the schema permits multiple interviews
  for one application.
- CHECK constraints do not make nullable `opportunities.salary` or
  `opportunities.min_gpa` non-NULL.
- Business meanings not encoded in the DDL, such as currency/pay period,
  interview type vocabulary, and resume URL semantics, require domain-owner
  confirmation.
- This document reflects the base schema export. Read-only live checks
  confirmed the base tables and constraints; the additive semantic tables and
  full-text indexes are not part of this base export.

## Related schema objects

The export also defines 11 B-tree indexes, three views, and two trigger
functions with triggers. Their names, indexed columns, view projections, and
trigger behavior are documented in [`data-dictionary.md`](./data-dictionary.md).
