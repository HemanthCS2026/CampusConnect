# CampusConnect — Smart College Placement & Internship Management System

CampusConnect is a Next.js application for managing college placement and
internship opportunities, student applications, and placement outcomes. It
uses PostgreSQL for relational and transactional records, MongoDB for flexible
student skill profiles, and a separately hosted sentence-embedding worker for
semantic opportunity recommendations.

## Project status and evidence

The local development databases were checked read-only on 2026-11-20:

- PostgreSQL 18.6 contains the 10 base tables and the 3 semantic storage tables.
  Five opportunity embeddings and one student embedding were present; all were
  384-dimensional finite vectors with the expected model metadata. The five
  opportunity source hashes matched their current assembled source text.
- MongoDB was reachable at the configured `campusconnect` database. Its
  `student_skill_profiles` collection had a strict validator and the expected
  unique `studentId` index, but **zero documents**. Its read-only analytics
  aggregation therefore returned zero rows.
- The Student recommendation UI, lint, TypeScript check, semantic tests, Python
  worker tests, and production build are implemented or verified as described
  below. An authenticated UI-to-live-API recommendation session has not been
  demonstrated.

These are local audit observations, not a guarantee about another database or
deployment. Do not run setup or data-writing commands against a live database
without approval.

The student, company, and opportunity records in PostgreSQL were created as
project sample data for functional demonstration and testing. They are not
verified real student or recruitment records, and they were not acquired from an
external dataset or actual placement drives.

## Features

- Student registration and sign-in, signed sessions, and role checks for
  Student, CompanyRep, and Admin accounts.
- Opportunity browsing and PostgreSQL full-text search over title, type,
  company name, and industry. Search uses parameterized
  `websearch_to_tsquery`, `ts_rank`, and GIN expression indexes.
- Student application submission and a signed-in student's own application
  list, with duplicate-application prevention.
- MongoDB student skill profiles with a schema validator and unique owner
  index. An Admin-only aggregation groups profiles by normalized skill and
  proficiency without returning student identifiers.
- Student-facing semantic opportunity recommendations using
  `sentence-transformers/all-MiniLM-L6-v2`, 384-dimensional embeddings, and
  application-side cosine similarity.
- A dedicated Admin dashboard with opportunity overview, recent application
  records, skill analytics, and an explicit action to regenerate stale
  opportunity embeddings.
- A dedicated read-only CompanyRep dashboard that shows opportunities and
  applications associated with the authenticated representative's linked
  company. Opportunity creation and editing are not implemented.
- PostgreSQL views, constraints, indexes, trigger functions, and read-only
  query/verification examples.

## Technology and architecture

| Layer | Technology |
|---|---|
| Web application | Next.js 16.4.5, React 19.3.0, TypeScript |
| Relational database | PostgreSQL 18; `pg` Node driver |
| Flexible profile database | MongoDB; official Node.js driver |
| Embedding service | Python 3.12, PyTorch CPU, Transformers; pinned MiniLM model |
| Styling | Tailwind CSS 4 |

The browser uses the Next.js page in `app/page.tsx`, which renders separate
Student, Admin, and CompanyRep interfaces. Route handlers under
`app/api/` authenticate and validate requests, derive student identity from the
session, and access PostgreSQL through `lib/db.ts` and MongoDB through the
server-only `lib/mongodb.ts`. The Python embedding service runs separately on
loopback by default; the Next.js server sends it text and receives vectors.
PostgreSQL stores embeddings as `real[]`; it does not use pgvector or an ANN
index.

The base relational model is documented by
[`db/er-diagram.mmd`](db/er-diagram.mmd),
[`db/relational-schema.md`](db/relational-schema.md), and
[`db/data-dictionary.md`](db/data-dictionary.md). The MongoDB model is in
[`db/mongodb-design.md`](db/mongodb-design.md).

## Prerequisites

- Node.js 20.9 or later and npm (the verified local runtime was Node 24.18.0).
- PostgreSQL 18 for the documented local setup.
- A MongoDB server or compatible MongoDB deployment.
- Python 3.12 and the packages in `requirements-semantic-search.txt` to run
  semantic recommendations. The first worker start downloads the pinned public
  model if it is not already cached.

## Local setup

### 1. Install Node dependencies

From the repository root in PowerShell:

```powershell
npm ci
```

### 2. Configure server-side environment

Create an ignored local `.env.local` and configure only the names needed by
your local services. Do not commit this file or put secrets in `NEXT_PUBLIC_`
variables.

| Variable | Purpose |
|---|---|
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | PostgreSQL connection. The code defaults to `localhost:5432`, database `placement_management`, user `postgres`; set the password privately. |
| `MONGODB_URI`, `MONGODB_DATABASE` | Server-side MongoDB connection. The application expects database `campusconnect`. |
| `AUTH_SESSION_SECRET` | Required in production for signed sessions: provide a cryptographically random value of at least 32 bytes. Production rejects missing, short, low-diversity, repeated-character, and development-fallback values. Development alone has a fixed local fallback. |
| `SEMANTIC_EMBEDDING_URL` | Optional Next.js worker endpoint; defaults to `http://127.0.0.1:8008/embed`. |
| `SEMANTIC_EMBEDDING_TOKEN` | Optional for loopback; required for a remote HTTPS worker and must match its token. |
| `SEMANTIC_EMBEDDING_HOST`, `SEMANTIC_EMBEDDING_PORT` | Optional Python worker bind settings; defaults to loopback and port 8008. Non-loopback binding requires a token. |

`lib/db.ts` supplies PostgreSQL defaults if corresponding variables are not
set. `lib/mongodb.ts` requires both MongoDB variables. For `mongosh`, set
`MONGODB_URI` in the current PowerShell process; Next.js loading `.env.local`
does not export it to other processes.

### 3. Prepare databases

`db/schema.sql` is a PostgreSQL schema-only export, not an idempotent app
startup script. For a **new, empty development database only**, review it and
restore the base schema once:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_EMPTY_DEVELOPMENT_DATABASE --username=YOUR_DATABASE_ROLE --file=db\schema.sql
```

The two additive feature migrations require the base schema and should only be
applied to an approved development database:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DEVELOPMENT_DATABASE --username=YOUR_DATABASE_ROLE --file=db\postgresql-full-text-search.sql
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DEVELOPMENT_DATABASE --username=YOUR_DATABASE_ROLE --file=db\semantic-vector-search.sql
```

The migrations are already present in the verified local database. Do not
replay schema or migration files against a populated/live database as a
verification step. Read-only checks are available:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DATABASE --username=YOUR_READ_ONLY_ROLE --file=db\verification.sql
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DATABASE --username=YOUR_READ_ONLY_ROLE --file=db\advanced-features-verification.sql
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DATABASE --username=YOUR_READ_ONLY_ROLE --file=db\semantic-vector-verification.sql
```

`db/mongodb-setup.js` creates the expected collection/validator if the
collection is absent and ensures the unique owner index. It changes MongoDB;
run it only when provisioning an approved development database, not as a
read-only check:

```powershell
if ([string]::IsNullOrWhiteSpace($env:MONGODB_URI) -or $env:MONGODB_DATABASE -ne "campusconnect") {
  throw "Set MONGODB_URI and set MONGODB_DATABASE to campusconnect."
}
mongosh "$env:MONGODB_URI" --file db\mongodb-setup.js
```

The checked local collection already exists and has zero documents. The
synthetic aggregation demonstration script inserts and removes test documents;
use it only in a dedicated disposable development database.

### 4. Set up and start the embedding worker

The worker loads the model once and defaults to `127.0.0.1:8008`. If its Python
dependencies are not installed, the documented PowerShell setup is:

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\CampusConnect" | Out-Null
python -m venv "$env:LOCALAPPDATA\CampusConnect\.venv-semantic"
& "$env:LOCALAPPDATA\CampusConnect\.venv-semantic\Scripts\Activate.ps1"
python -m pip install --upgrade pip
python -m pip install -r requirements-semantic-search.txt
```

Start the service from the project root in one PowerShell window:

```powershell
python services\semantic_embedding_service.py
```

### 5. Start the application

In another PowerShell window:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Supported workflows

### Student

1. Register through the public registration form (registration creates
   Student accounts only) and sign in. If the account has exactly one linked
   student profile, it is selected automatically and applications load for
   that profile.
2. Browse opportunities and search by title, company, industry, or type.
3. Use **Semantic Opportunity Recommendations** on the home page to enter
   interests and comma-separated career preferences. The server derives
   student identity and GPA from the signed session; the browser sends no
   student ID. Results show the returned opportunity fields and cosine score.
4. Apply to an opportunity and view the signed-in student's application list.
5. Manage your skills in the **Skill Profile** section on the home page:
   add skills with proficiencies (Beginner, Intermediate, Advanced), remove
   skills, and click **Save skill profile** to persist them to MongoDB via
   `/api/student/skills`. Saved skills feed directly into the student's
   semantic recommendations and Admin skill analytics.

To produce recommendations, assembled student text must be non-empty and
eligible opportunities must have current embeddings. PostgreSQL and the
configured MongoDB collection must be available; a student-vector cache miss
also requires the embedding worker. Empty student text returns an empty result.
Cache misses can persist a student embedding. If eligible opportunities exist
but none has a valid vector for the pinned model/revision, the API returns an
error requiring Admin generation. Vectors with stale source hashes are
excluded and can yield an empty successful result with a missing-vector
count. Use an approved development database for a first request or any request
expected to regenerate vectors. The live MongoDB collection currently has no
skill documents.

### Admin

The Admin dashboard displays the opportunity list, latest 50 applications
(with a total count), and skill-proficiency analytics. It uses
`GET /api/analytics/skill-proficiency` and the Admin-only
`GET /api/admin/applications` route. The **Regenerate stale embeddings**
button explicitly calls the Admin-only
`POST /api/admin/semantic-embeddings`; it is not automatic and can write
embedding rows. Run it only against an approved development database. The
verified local MongoDB collection contained zero documents, so its analytics
returned an empty result; an unavailable analytics service is shown as
unavailable, not replaced with sample values.

### Company representative

The `GET /api/company/dashboard` route requires an authenticated `CompanyRep`
session and resolves the linked company from the server-side session and
`company_reps` row. It shows that company's opportunities and applications
for those opportunities. It does not accept a client-supplied company or
student ID and does not return resume URLs or account identifiers. The
dashboard is implemented in
`app/components/company-representative-dashboard.tsx` and is read-only;
opportunity creation and editing are not implemented.

## Semantic recommendation details

- **Student text:** MongoDB skill names and proficiency plus the Student's
  request-scoped interests and career preferences. Names, GPA, user IDs, and
  student IDs are not embedded.
- **Opportunity text:** PostgreSQL title, job type, company name/industry, and
  optional description/required skills in
  `public.opportunity_semantic_content`. The base `opportunities` table does
  not contain description or required-skills columns.
- **Model:** `sentence-transformers/all-MiniLM-L6-v2`, pinned revision
  `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, producing 384-dimensional
  mean-pooled, L2-normalized embeddings.
- **Storage:** PostgreSQL `real[]` in `student_semantic_embeddings` and
  `opportunity_semantic_embeddings`, with model revision, SHA-256 source hash,
  timestamps, dimension checks, and finite-value checks. This is not pgvector.
- **Retrieval:** PostgreSQL filters by deadline and minimum GPA, then the
  server verifies source hashes and ranks eligible embeddings with exact
  cosine similarity. Positive results are sorted descending, ties are stable,
  and up to 10 are returned. This is not ANN search.
- **Cache:** Matching student text/model hashes reuse the stored vector;
  cache misses call the worker and upsert a vector. Admin generation updates
  stale opportunity embeddings.

See [`db/README.md`](db/README.md) for SQL, MongoDB, worker, and API commands.

## Tests and checks

Run from the repository root:

```powershell
npm run lint
npx tsc --noEmit
npm run test:semantic
python -m unittest discover -s tests -p test_semantic_embedding_service.py
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/company-representative.test.mts
npm run build
```

The semantic tests use deterministic unit inputs; Python worker tests use a
fake model and loopback HTTP server. They do not prove authenticated
browser-to-live-database recommendation behavior. The most recent recorded
results are 9/9 TypeScript tests, 4/4 Python tests, successful lint/type-check,
and a successful production build. `tests/company-representative.test.mts`
contains 2 focused Node tests for CompanyRep role authorization and the
session-user-scoped SQL query parameters. These tests verify source helpers and
query scope; they do not exercise a live HTTP route or live database ownership
mapping.

## Documentation and submission evidence

- Detailed project report: [`PROJECT-REPORT.md`](PROJECT-REPORT.md).
- Requirement-by-requirement mapping for the available draft PDF is in the
  report's **Requirements compliance map** section.
- ER diagram: [`db/er-diagram.mmd`](db/er-diagram.mmd) (Mermaid source) and
  rendered PNG image [`evidence/er-diagram.png`](evidence/er-diagram.png).
- Database schema and dictionary: [`db/relational-schema.md`](db/relational-schema.md)
  and [`db/data-dictionary.md`](db/data-dictionary.md).
- Assignment PDF available in this repository:
  [`DBMS Level 3 Project Requirements draft.pdf`](DBMS%20Level%203%20Project%20Requirements%20draft.pdf).
  Other separately named guideline, deliverable, assessment/plagiarism,
  dataset-exploration, and model/training PDFs were not found.
- Existing screenshots are in [`evidence/`](evidence/):
  [`student-dashboard.png`](evidence/student-dashboard.png),
  [`student-application.png`](evidence/student-application.png), and
  [`semantic-recommendations.png`](evidence/semantic-recommendations.png).
  Their capture context and approval are not independently verified. They
  include visible student/application information and development UI chrome;
  review privacy, redact, and recapture clean versions before submission.

Member-specific contributions, instructor approval, screenshot privacy review,
and a fresh authenticated live end-to-end recommendation demonstration still
need manual completion or rehearsal. (Student, company, and opportunity
records are documented as project-created sample data).

## Final manual-demo checklist

Use an approved development database and real authorized test accounts. Do not
run write-capable workflows against production data.

- [ ] **Student workflow:**
  1. Sign in with an authorized student account (confirm automatic single-profile selection).
  2. Browse placement/internship opportunities and test PostgreSQL full-text search.
  3. In **Skill Profile**, view skills, add a new skill with proficiency (Beginner, Intermediate, Advanced), remove a skill, and click **Save skill profile** to persist to MongoDB.
  4. In **Semantic Recommendations**, enter interests and career preferences; verify returned cosine-ranked opportunities.
  5. Apply to an eligible opportunity and verify it appears in the student's application list.
- [ ] **CompanyRep workflow:**
  1. Sign in with an authorized CompanyRep account (e.g. `rep_001` or `company_demo`).
  2. Confirm the dashboard displays only opportunities and applications belonging to that representative's linked company.
  3. Confirm applicant resume URLs and student account identifiers are excluded. (Read-only; opportunity creation/editing is not implemented).
- [ ] **Admin workflow:**
  1. Sign in with an Admin account.
  2. Review overall placement opportunities, the latest 50 applications, and MongoDB skill-proficiency analytics (reflecting saved student skill profiles).
  3. Click **Regenerate stale embeddings** with the Python embedding worker running to demonstrate vector refresh.
- [ ] **Submission media:**
  - Recapture clean presentation screenshots of the Student dashboard (including skill editor and recommendations), CompanyRep view, and Admin analytics, ensuring credentials and dev overlays are redacted. (`evidence/er-diagram.png` is rendered from Mermaid).
