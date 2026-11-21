# CampusConnect Data Dictionary

This document describes the PostgreSQL schema in [`schema.sql`](./schema.sql)
and the additive semantic storage in [`semantic-vector-search.sql`](./semantic-vector-search.sql).
The DDL files are the source of truth for names, types, nullability,
defaults, keys, constraints, indexes, views, and triggers.

Purpose descriptions below are marked **Inferred** because the schema has no
column or table comments. They are based only on identifiers, constraints, and
the relationships defined in the DDL. A read-only catalog verification
against local PostgreSQL 18.6 confirmed the 10 base tables, 3 semantic storage
tables, constraints, indexes, views, and trigger objects.

## Tables and columns

`NOT NULL` and `NULL` reflect the DDL. The primary-key columns have sequence
defaults; the exact sequence name is recorded in each row.

### `users`

**Purpose (inferred):** Account identity and role data used by student and
company-representative records.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `user_id` | `integer` | NOT NULL | `nextval('public.users_user_id_seq'::regclass)` | PRIMARY KEY `users_pkey` | Inferred: account identifier. |
| `username` | `character varying(50)` | NOT NULL | — | UNIQUE `users_username_key` | Inferred: account login name. |
| `password_hash` | `character varying(255)` | NOT NULL | — | — | Inferred: stores a password hash; the schema does not define its format. |
| `role` | `character varying(20)` | NOT NULL | — | CHECK `users_role_check` | Inferred: account role; allowed values are `Student`, `CompanyRep`, and `Admin`. |

### `students`

**Purpose (inferred):** Student profile and academic attributes associated with
a user account and department.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `student_id` | `integer` | NOT NULL | `nextval('public.students_student_id_seq'::regclass)` | PRIMARY KEY `students_pkey` | Inferred: student identifier. |
| `user_id` | `integer` | NOT NULL | — | FOREIGN KEY to `users.user_id`; UNIQUE `students_user_id_key` | Inferred: associated account; at most one student row per user. |
| `dept_id` | `integer` | NOT NULL | — | FOREIGN KEY to `departments.dept_id` | Inferred: student's department. |
| `first_name` | `character varying(50)` | NOT NULL | — | — | Inferred: student's given name. |
| `last_name` | `character varying(50)` | NOT NULL | — | — | Inferred: student's family name. |
| `gpa` | `numeric(4,2)` | NOT NULL | — | CHECK `students_gpa_check`; also validated by `fn_validate_student_gpa()` | Inferred: student GPA, constrained to 0 through 10. |
| `graduation_year` | `integer` | NOT NULL | — | CHECK `students_graduation_year_check` (`>= 2000`) | Inferred: expected or recorded graduation year. |

### `departments`

**Purpose (inferred):** Lookup records for student departments.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `dept_id` | `integer` | NOT NULL | `nextval('public.departments_dept_id_seq'::regclass)` | PRIMARY KEY `departments_pkey` | Inferred: department identifier. |
| `dept_name` | `character varying(100)` | NOT NULL | — | UNIQUE `departments_dept_name_key` | Inferred: department name. |

### `companies`

**Purpose (inferred):** Company records associated with representatives and
opportunities.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `company_id` | `integer` | NOT NULL | `nextval('public.companies_company_id_seq'::regclass)` | PRIMARY KEY `companies_pkey` | Inferred: company identifier. |
| `company_name` | `character varying(100)` | NOT NULL | — | UNIQUE `companies_company_name_key` | Inferred: company name. |
| `industry` | `character varying(100)` | NOT NULL | — | — | Inferred: industry label for the company. |

### `company_reps`

**Purpose (inferred):** Representative records linked to a company and user.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `rep_id` | `integer` | NOT NULL | `nextval('public.company_reps_rep_id_seq'::regclass)` | PRIMARY KEY `company_reps_pkey` | Inferred: representative identifier. |
| `company_id` | `integer` | NOT NULL | — | FOREIGN KEY to `companies.company_id` | Inferred: associated company. |
| `user_id` | `integer` | NOT NULL | — | FOREIGN KEY to `users.user_id`; UNIQUE `company_reps_user_id_key` | Inferred: associated account; at most one representative row per user. |
| `name` | `character varying(100)` | NOT NULL | — | — | Inferred: representative's name. |

### `opportunities`

**Purpose (inferred):** Placement or internship opportunities associated with
a company.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `opp_id` | `integer` | NOT NULL | `nextval('public.opportunities_opp_id_seq'::regclass)` | PRIMARY KEY `opportunities_pkey` | Inferred: opportunity identifier. |
| `company_id` | `integer` | NOT NULL | — | FOREIGN KEY to `companies.company_id` | Inferred: company offering the opportunity. |
| `title` | `character varying(100)` | NOT NULL | — | — | Inferred: opportunity title. |
| `type` | `character varying(20)` | NOT NULL | — | CHECK `opportunities_type_check`; allowed values are `Placement` and `Internship` | Inferred: opportunity category. |
| `salary` | `numeric(12,2)` | NULL | — | CHECK `opportunities_salary_check` (`>= 0` when non-NULL) | Inferred: listed compensation amount; currency and pay period are not specified. |
| `deadline` | `date` | NOT NULL | — | — | Inferred: opportunity deadline. |
| `min_gpa` | `numeric(4,2)` | NULL | — | CHECK `opportunities_min_gpa_check` (`0` through `10` when non-NULL) | Inferred: minimum GPA criterion. |

### `applications`

**Purpose (inferred):** Association recording a student's application to an
opportunity.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `app_id` | `integer` | NOT NULL | `nextval('public.applications_app_id_seq'::regclass)` | PRIMARY KEY `applications_pkey` | Inferred: application identifier. |
| `student_id` | `integer` | NOT NULL | — | FOREIGN KEY to `students.student_id`; member of UNIQUE `(student_id, opp_id)` | Inferred: applicant. |
| `opp_id` | `integer` | NOT NULL | — | FOREIGN KEY to `opportunities.opp_id`; member of UNIQUE `(student_id, opp_id)` | Inferred: applied-to opportunity. |
| `applied_date` | `date` | NOT NULL | `CURRENT_DATE` | — | Inferred: date the application was recorded. |
| `status` | `character varying(20)` | NOT NULL | `'Applied'` | CHECK `applications_status_check` | Inferred: application state; allowed values are `Applied`, `Interviewing`, `Rejected`, and `Selected`. |
| `resume_url` | `character varying(255)` | NULL | — | — | Inferred: optional resume reference. |

### `interviews`

**Purpose (inferred):** Interview event records associated with applications.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `interview_id` | `integer` | NOT NULL | `nextval('public.interviews_interview_id_seq'::regclass)` | PRIMARY KEY `interviews_pkey` | Inferred: interview identifier. |
| `app_id` | `integer` | NOT NULL | — | FOREIGN KEY to `applications.app_id` | Inferred: associated application. |
| `interview_date` | `timestamp without time zone` | NOT NULL | — | — | Inferred: scheduled or recorded interview date and time; no time zone is stored. |
| `type` | `character varying(50)` | NOT NULL | — | — | Inferred: interview type; allowed values are not constrained in the schema. |
| `status` | `character varying(20)` | NOT NULL | `'Scheduled'` | CHECK `interviews_status_check` | Inferred: interview state; allowed values are `Scheduled`, `Completed`, and `Cancelled`. |
| `feedback` | `text` | NULL | — | — | Inferred: optional interview feedback. |

### `offers`

**Purpose (inferred):** Offer record associated with an application.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `offer_id` | `integer` | NOT NULL | `nextval('public.offers_offer_id_seq'::regclass)` | PRIMARY KEY `offers_pkey` | Inferred: offer identifier. |
| `app_id` | `integer` | NOT NULL | — | FOREIGN KEY to `applications.app_id`; UNIQUE `offers_app_id_key` | Inferred: associated application; at most one offer per application. |
| `offer_date` | `date` | NOT NULL | `CURRENT_DATE` | — | Inferred: date the offer was recorded. |
| `amount` | `numeric(12,2)` | NOT NULL | — | CHECK `offers_amount_check` (`>= 0`) | Inferred: offer amount; currency and pay period are not specified. |
| `status` | `character varying(20)` | NOT NULL | `'Pending'` | CHECK `offers_status_check` | Inferred: offer state; allowed values are `Pending`, `Accepted`, and `Rejected`. |

### `placements`

**Purpose (inferred):** Placement outcome associated with an offer.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `placement_id` | `integer` | NOT NULL | `nextval('public.placements_placement_id_seq'::regclass)` | PRIMARY KEY `placements_pkey` | Inferred: placement identifier. |
| `offer_id` | `integer` | NOT NULL | — | FOREIGN KEY to `offers.offer_id`; UNIQUE `placements_offer_id_key`; validated by `fn_validate_placement_offer()` | Inferred: offer associated with this placement; at most one placement per offer. |
| `joining_date` | `date` | NULL | — | — | Inferred: optional joining date. |
| `status` | `character varying(20)` | NOT NULL | `'Pending Joining'` | CHECK `placements_status_check` | Inferred: placement state; allowed values are `Pending Joining`, `Joined`, and `Withdrawn`. |

### `opportunity_semantic_content`

**Purpose (inferred):** Extended opportunity text attributes (description and required skills) used to assemble text for sentence-transformer vector embedding generation.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `opp_id` | `integer` | NOT NULL | — | PRIMARY KEY `opportunity_semantic_content_pkey`; FOREIGN KEY to `opportunities.opp_id` ON DELETE CASCADE | Inferred: opportunity identifier; at most one content row per opportunity. |
| `description` | `text` | NULL | — | — | Inferred: full descriptive text of role responsibilities and requirements. |
| `required_skills` | `text[]` | NOT NULL | `ARRAY[]::text[]` | CHECK `opportunity_semantic_content_skills_limit` (`cardinality <= 100`) | Inferred: list of required technical and domain skills. |
| `updated_at` | `timestamp with time zone` | NOT NULL | `CURRENT_TIMESTAMP` | — | Inferred: timestamp when semantic content was last updated. |

### `opportunity_semantic_embeddings`

**Purpose (inferred):** Persisted 384-dimensional dense sentence embeddings for opportunities, generated by the pinned MiniLM model and verified against assembled source text hashes.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `opp_id` | `integer` | NOT NULL | — | PRIMARY KEY `opportunity_semantic_embeddings_pkey`; FOREIGN KEY to `opportunities.opp_id` ON DELETE CASCADE | Inferred: opportunity identifier; exactly one embedding row per opportunity. |
| `model_name` | `text` | NOT NULL | — | CHECK (`model_name = 'sentence-transformers/all-MiniLM-L6-v2'`) | Inferred: exact Hugging Face model identifier. |
| `model_revision` | `text` | NOT NULL | — | CHECK (`model_revision = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'`) | Inferred: pinned Git commit hash of model weights. |
| `source_hash` | `text` | NOT NULL | — | CHECK (length 64, hex string `^[0-9a-f]{64}$`) | Inferred: SHA-256 hash of assembled opportunity text and model metadata for cache freshness verification. |
| `embedding` | `real[]` | NOT NULL | — | CHECK `opportunity_semantic_embeddings_dimensions` (1D, 384 dimensions); CHECK `opportunity_semantic_embeddings_finite` (no NULL, NaN, or Infinity) | Inferred: 384-dimensional unit-normalized embedding vector. |
| `generated_at` | `timestamp with time zone` | NOT NULL | `CURRENT_TIMESTAMP` | — | Inferred: timestamp when embedding was generated. |

### `student_semantic_embeddings`

**Purpose (inferred):** Persisted 384-dimensional dense sentence embeddings for students, generated from their MongoDB skill profile and request-scoped preferences.

| Column | PostgreSQL type | Nullability | Default | Key / constraint | Purpose |
|---|---|---|---|---|---|
| `student_id` | `integer` | NOT NULL | — | PRIMARY KEY `student_semantic_embeddings_pkey`; FOREIGN KEY to `students.student_id` ON DELETE CASCADE | Inferred: student identifier; at most one cached embedding row per student. |
| `model_name` | `text` | NOT NULL | — | CHECK (`model_name = 'sentence-transformers/all-MiniLM-L6-v2'`) | Inferred: exact Hugging Face model identifier. |
| `model_revision` | `text` | NOT NULL | — | CHECK (`model_revision = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'`) | Inferred: pinned Git commit hash of model weights. |
| `source_hash` | `text` | NOT NULL | — | CHECK (length 64, hex string `^[0-9a-f]{64}$`) | Inferred: SHA-256 hash of assembled student profile text and model metadata. |
| `embedding` | `real[]` | NOT NULL | — | CHECK `student_semantic_embeddings_dimensions` (1D, 384 dimensions); CHECK `student_semantic_embeddings_finite` (no NULL, NaN, or Infinity) | Inferred: 384-dimensional unit-normalized embedding vector. |
| `generated_at` | `timestamp with time zone` | NOT NULL | `CURRENT_TIMESTAMP` | — | Inferred: timestamp when embedding was generated. |

## Foreign-key relationships

All foreign-key columns are `NOT NULL`, so every child row must reference one
parent row. Foreign keys in the base schema do not declare cascade actions;
foreign keys in the semantic tables specify `ON DELETE CASCADE`.

| Foreign-key constraint | Foreign key | Referenced key | Cardinality implied by the schema |
|---|---|---|---|
| `students_user_id_fkey` | `students.user_id` | `users.user_id` | Each student has exactly one user; each user has zero or one student because `students.user_id` is UNIQUE. |
| `students_dept_id_fkey` | `students.dept_id` | `departments.dept_id` | Each student has exactly one department; a department can have zero or many students. |
| `company_reps_company_id_fkey` | `company_reps.company_id` | `companies.company_id` | Each representative has exactly one company; a company can have zero or many representatives. |
| `company_reps_user_id_fkey` | `company_reps.user_id` | `users.user_id` | Each representative has exactly one user; each user has zero or one representative because `company_reps.user_id` is UNIQUE. |
| `opportunities_company_id_fkey` | `opportunities.company_id` | `companies.company_id` | Each opportunity has exactly one company; a company can have zero or many opportunities. |
| `applications_student_id_fkey` | `applications.student_id` | `students.student_id` | Each application has exactly one student; a student can have zero or many applications. |
| `applications_opp_id_fkey` | `applications.opp_id` | `opportunities.opp_id` | Each application has exactly one opportunity; an opportunity can have zero or many applications. |
| `interviews_app_id_fkey` | `interviews.app_id` | `applications.app_id` | Each interview has exactly one application; an application can have zero or many interviews. |
| `offers_app_id_fkey` | `offers.app_id` | `applications.app_id` | Each offer has exactly one application; an application can have zero or one offer because `offers.app_id` is UNIQUE. |
| `placements_offer_id_fkey` | `placements.offer_id` | `offers.offer_id` | Each placement has exactly one offer; an offer can have zero or one placement because `placements.offer_id` is UNIQUE. |
| `opportunity_semantic_content_pkey` (FK) | `opportunity_semantic_content.opp_id` | `opportunities.opp_id` | Each opportunity has zero or one semantic content row; cascades on delete. |
| `opportunity_semantic_embeddings_pkey` (FK) | `opportunity_semantic_embeddings.opp_id` | `opportunities.opp_id` | Each opportunity has zero or one embedding row; cascades on delete. |
| `student_semantic_embeddings_pkey` (FK) | `student_semantic_embeddings.student_id` | `students.student_id` | Each student has zero or one cached embedding row; cascades on delete. |

Together, `applications.student_id` and `applications.opp_id` implement a
many-to-many student/opportunity association, limited to one application per
student-opportunity pair by a composite UNIQUE constraint.

## UNIQUE constraints

| Constraint | Columns | Effect |
|---|---|---|
| `applications_student_id_opp_id_key` | `applications(student_id, opp_id)` | Prevents duplicate applications for the same student and opportunity. |
| `companies_company_name_key` | `companies(company_name)` | Company names are unique. |
| `company_reps_user_id_key` | `company_reps(user_id)` | At most one representative row per user. |
| `departments_dept_name_key` | `departments(dept_name)` | Department names are unique. |
| `offers_app_id_key` | `offers(app_id)` | At most one offer per application. |
| `placements_offer_id_key` | `placements(offer_id)` | At most one placement per offer. |
| `students_user_id_key` | `students(user_id)` | At most one student row per user. |
| `users_username_key` | `users(username)` | Usernames are unique. |

Every table also has a primary-key constraint on its `*_id` column; these
primary keys are listed in the table definitions above.

## CHECK constraints

| Constraint | Rule |
|---|---|
| `applications_status_check` | Status is `Applied`, `Interviewing`, `Rejected`, or `Selected`. |
| `interviews_status_check` | Status is `Scheduled`, `Completed`, or `Cancelled`. |
| `offers_amount_check` | `amount >= 0`. |
| `offers_status_check` | Status is `Pending`, `Accepted`, or `Rejected`. |
| `opportunities_min_gpa_check` | `min_gpa` is between 0 and 10 when non-NULL. |
| `opportunities_salary_check` | `salary >= 0` when non-NULL. |
| `opportunities_type_check` | Type is `Placement` or `Internship`. |
| `placements_status_check` | Status is `Pending Joining`, `Joined`, or `Withdrawn`. |
| `students_gpa_check` | `gpa` is between 0 and 10. |
| `students_graduation_year_check` | `graduation_year >= 2000`. |
| `users_role_check` | Role is `Student`, `CompanyRep`, or `Admin`. |

The nullable `salary` and `min_gpa` columns remain nullable: their CHECK
expressions do not impose `NOT NULL`.

## Views

| View | Columns returned by the schema | Definition summary |
|---|---|---|
| `vw_interview_schedule` | `interview_id`, `interview_date`, `interview_type`, `interview_status`, `student_id`, `first_name`, `last_name`, `opportunity_title`, `feedback` | Joins interviews to applications, students, and opportunities. |
| `vw_placement_report` | `placement_id`, `joining_date`, `placement_status`, `student_id`, `first_name`, `last_name`, `company_name`, `opportunity_title`, `opportunity_type`, `offer_amount` | Joins placements to offers, applications, students, opportunities, and companies. |
| `vw_student_applications` | `student_id`, `first_name`, `last_name`, `username`, `dept_name`, `opp_id`, `opportunity_title`, `opportunity_type`, `app_id`, `applied_date`, `application_status` | Joins students to users, departments, applications, and opportunities. |

## Trigger functions and triggers

| Function | Trigger | Behavior defined in schema |
|---|---|---|
| `fn_validate_student_gpa()` | `trg_validate_student_gpa`: BEFORE INSERT or UPDATE OF `gpa` on `students` | Raises an exception if the new GPA is below 0 or above 10. The table also has `students_gpa_check`. |
| `fn_validate_placement_offer()` | `trg_validate_placement_offer`: BEFORE INSERT or UPDATE OF `offer_id` on `placements` | Raises an exception unless the referenced offer's status is `Accepted`. |

## Indexes

All 11 listed indexes use PostgreSQL B-tree indexing.

| Index name | Table and indexed column(s) |
|---|---|
| `idx_applications_opp_id` | `applications(opp_id)` |
| `idx_applications_status` | `applications(status)` |
| `idx_applications_student_id` | `applications(student_id)` |
| `idx_company_reps_company_id` | `company_reps(company_id)` |
| `idx_interviews_app_id` | `interviews(app_id)` |
| `idx_interviews_date` | `interviews(interview_date)` |
| `idx_offers_status` | `offers(status)` |
| `idx_opportunities_company_id` | `opportunities(company_id)` |
| `idx_opportunities_deadline` | `opportunities(deadline)` |
| `idx_placements_status` | `placements(status)` |
| `idx_students_dept_id` | `students(dept_id)` |

## Limitations and schema ambiguities

- The schema has no column or table comments. Descriptions above are inferred
  from names and constraints, not authoritative business definitions.
- The schema does not specify the currency or pay period for `salary` or
  `amount`, the precise meaning of interview `type`, or the semantics of
  `resume_url`.
- The schema does not constrain `users.role` to match whether the user has a
  corresponding row in `students` or `company_reps`.
- The export does not specify `ON DELETE` or `ON UPDATE` actions for foreign
  keys; PostgreSQL's default behavior applies.
- The schema-only export documents exported objects, but this document does
  not independently verify the live database.
