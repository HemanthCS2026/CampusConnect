# Database support files

This folder contains the schema export and read-only query examples for the
CampusConnect placement management database.

- `schema.sql` is the PostgreSQL schema-only export. It records the existing
  tables, views, constraints, indexes, sequences, trigger functions, and
  triggers; it is not an application migration script.
- `verification.sql` performs read-only catalog checks for tables,
  constraints, indexes, views, triggers, and functions, then selects rows from
  the three existing views.
- `queries.sql` contains DBMS query demonstrations based on the exported
  schema, including joins, sorting, grouping, aggregate functions, a `HAVING`
  filter, subqueries, and a parameterized application-query example. It also
  demonstrates `WHERE` filtering, `LIKE` pattern matching, `DISTINCT`,
  `UNION` and `EXCEPT` set operations, a `RANK()` window function, and
  read-only joins across the interviews, offers, placements, company_reps,
  and users tables.

## Schema export

The existing schema file was exported with `pg_dump --schema-only`. A typical
command for producing a schema-only export is:

```text
pg_dump --schema-only --dbname=placement_management --file=db/schema.sql
```

The export is for inspection and documentation. Do not execute it to verify
the current database; it contains statements that create or alter database
objects.

## Run the DDL demonstration

`ddl-demonstration.sql` demonstrates CREATE, ALTER, and DROP using a uniquely
named temporary table. The table and its index are session-local; the script
wraps all statements in a transaction and ends with `ROLLBACK`, which undoes
the DDL in PostgreSQL so no demonstration objects remain. It does not target
any existing CampusConnect table, view, or persistent schema.

Run it only against a disposable development or test database, using a role
that has permission to create temporary tables. From the repository root:

```text
psql -X --set=ON_ERROR_STOP=on --dbname=YOUR_DISPOSABLE_DATABASE --username=YOUR_ROLE_WITH_TEMP_PRIVILEGE --file=db/ddl-demonstration.sql
```

Replace the placeholders locally. Do not put a password in the command or in
the repository; use your normal local PostgreSQL authentication method. If an
error stops the script before its final `ROLLBACK` in an interactive session,
issue `ROLLBACK` or disconnect to abort the open transaction.

## Run the DML demonstration

`dml-demonstration.sql` demonstrates `INSERT`, `SELECT`, `UPDATE`, and
`DELETE` against a temporary table inside a transaction. It ends with
`ROLLBACK`, which undoes the DML and temporary-table creation so no
demonstration changes remain. Run it from the project root against a disposable
development or test database, using a role with permission to create
temporary tables.

In Windows PowerShell with PostgreSQL 18 installed in its default location:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DISPOSABLE_DATABASE --username=YOUR_ROLE_WITH_TEMP_PRIVILEGE --file=db\dml-demonstration.sql
```

Replace the placeholders locally. Do not put a password in the command or in
the repository; use your normal local PostgreSQL authentication method.

## Advanced database features

### PostgreSQL full-text search

`db/postgresql-full-text-search.sql` creates two GIN expression indexes for
the existing opportunity title/type and company name/industry columns. The
`GET /api/opportunities?q=...` route uses parameterized
`websearch_to_tsquery('english', $1)` and `ts_rank`, returning ranked results.
No description or skill-requirement fields exist in the exported schema, so
they are not searched. A blank query returns the normal list; malformed or
overlong queries are rejected; a query with no matches returns an empty list.

Apply the migration only in an approved PostgreSQL 18 development database:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DATABASE --username=YOUR_ROLE --file=db\postgresql-full-text-search.sql
```

Verify it with the read-only script:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=YOUR_DATABASE --username=YOUR_READ_ONLY_ROLE --file=db\advanced-features-verification.sql
```

Test a query from PowerShell or use the opportunity search form:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/opportunities?q=software%20internship"
```

The result contains `success`, `count`, an `opportunities` array, and a
`ranks` map keyed by opportunity ID.

### MongoDB aggregation

MongoDB stores flexible `student_skill_profiles` documents in the
`campusconnect` database. `MONGODB_URI` and `MONGODB_DATABASE` are server-only
settings; never use `NEXT_PUBLIC_` names. The driver helper is
`lib/mongodb.ts`. The collection setup creates a strict document validator
when the collection is new and ensures the unique `studentId` index. If the
collection already exists, the setup script deliberately leaves its validator
unchanged for manual review.

Set the environment names in the server's ignored `.env.local` or deployment
secret configuration, with `MONGODB_DATABASE` set to `campusconnect`. Keep the
MongoDB URI server-side and out of `NEXT_PUBLIC_` variables. Do not put
credential values in this documentation. `mongosh` also needs
`MONGODB_URI` in the current PowerShell process; setting it only in `.env.local`
does not populate the shell environment. From the repository root, run:

```powershell
if ([string]::IsNullOrWhiteSpace($env:MONGODB_URI) -or $env:MONGODB_DATABASE -ne "campusconnect") {
  throw "Set MONGODB_URI and set MONGODB_DATABASE to campusconnect before setup."
}
mongosh "$env:MONGODB_URI" --file db\mongodb-setup.js
```

The demonstration inserts synthetic profiles with unique MongoDB IDs, runs an
aggregation matching the API's shape, then removes only those inserted
documents:

```powershell
mongosh "$env:MONGODB_URI" --file db\mongodb-analytics-demonstration.js
```

`GET /api/analytics/skill-proficiency` is restricted to Admin sessions. It
counts distinct profiles by normalized skill and proficiency and does not
return student IDs. An empty collection returns an empty result array. Missing
configuration, a missing collection, or a connection failure returns HTTP 503.
The response shape is `{ success, count, results }`, where each result has
`skill`, `proficiency`, and `studentCount`.

Read-only verification on 2026-11-20 connected to the configured
`campusconnect` database and confirmed the expected collection, strict
validator, and unique `studentId` index. The collection had zero documents, so
the live aggregation returned zero rows; populated-profile results remain
unverified.

### Admin dashboard

The home page renders the Admin dashboard for an authenticated Admin account.
It reads opportunities from `GET /api/opportunities`, recent applications and
the total count from the Admin-only `GET /api/admin/applications` route, and
skill aggregates from the Admin-only
`GET /api/analytics/skill-proficiency` route. The dashboard shows an explicit
unavailable state when an endpoint fails; it does not substitute sample data.

The **Regenerate stale embeddings** button calls the existing Admin-only
`POST /api/admin/semantic-embeddings` route only after a manual click. The
route can write PostgreSQL embedding rows and requires the embedding worker
when vectors need regeneration. Use this action only with an approved
development database and worker; it is not part of page load.

For API testing, first sign in through the existing login route. This PowerShell
pattern prompts for the password without echoing it and retains the HttpOnly
session cookie in the web session:

```powershell
$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$adminUsername = Read-Host "Admin username"
$adminPasswordSecure = Read-Host "Admin password" -AsSecureString
$adminPassword = [System.Net.NetworkCredential]::new("", $adminPasswordSecure).Password
$adminBody = @{ username = $adminUsername; password = $adminPassword } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/login" -WebSession $adminSession -ContentType "application/json" -Body $adminBody
$adminPassword = $null
$adminPasswordSecure.Dispose()
Invoke-RestMethod -Uri "http://localhost:3000/api/analytics/skill-proficiency" -WebSession $adminSession
```

### Semantic embedding recommendations

The semantic path uses the genuine `sentence-transformers/all-MiniLM-L6-v2`
sentence-embedding model. A small Python CPU service loads the model once and
stays outside the Next.js request process. The first run downloads the public
model to the local Hugging Face cache; no paid API, API key, GPU, or per-request
model download is required. The model was run locally with Python 3.12.10,
PyTorch 2.13.0 CPU, and Transformers 5.16.1. `requirements-semantic-search.txt`
records those tested package versions; these are separate from the Node
dependencies and are not installed by `npm install`.
The model revision is pinned to
`1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, so student and opportunity vectors
remain tied to the same downloaded weights.

The Student request embeds their MongoDB skill names and proficiency levels,
optional interests, and optional career preferences. It does not embed student
names, GPA, or account identifiers. The opportunity text embeds the title,
job type, company name and industry, plus description and required skills from
the additive `public.opportunity_semantic_content` table. The original
`public.opportunities` schema has no description or skill requirement fields;
the content table is the explicit source for those values and does not invent
content. Interests and career preferences are request-scoped and are not
stored as plaintext; PostgreSQL stores only the student-linked derived vector
and source hash. PostgreSQL applies the existing GPA and deadline eligibility filters
before similarity ranking.

The Python service tokenizes each text with the model tokenizer, runs
`sentence-transformers/all-MiniLM-L6-v2` on CPU, attention-mask mean-pools the
token hidden states, and L2-normalizes each resulting 384-number vector.
Student and opportunity vectors use the same model, preprocessing, dimension,
and cosine metric. Cosine is `dot(a,b) / (||a|| * ||b||)`; zero vectors score
zero and are omitted. Results are ordered by cosine score descending, with
`opp_id` as the deterministic tie-breaker. This is exact cosine ranking over
eligible stored vectors, not ANN/index-backed retrieval.

`db/semantic-vector-search.sql` creates three additive PostgreSQL tables:

- `opportunity_semantic_content`: optional description and required-skill
  source fields keyed by `opp_id`; columns are `opp_id integer` (PK/FK to
  `opportunities.opp_id`), nullable `description text`, `required_skills
  text[] NOT NULL DEFAULT ARRAY[]::text[]`, and `updated_at timestamptz NOT NULL`.
- `opportunity_semantic_embeddings`: `opp_id integer` (PK/FK),
  `model_name text`, `model_revision text`, `source_hash text`, `embedding
  real[]`, and `generated_at timestamptz`; all but the ID are NOT NULL. Checks
  pin the model/revision/hash format and enforce exactly 384 finite values.
- `student_semantic_embeddings`: `student_id integer` (PK/FK to
  `students.student_id`), and the same model name, revision, source hash,
  `real[]` embedding, and generation timestamp with equivalent NOT NULL and
  validation rules.

The embedding tables have primary-key/foreign-key ownership links and checks
for model, revision, hash, vector dimension, and finite values. Source hashes
are SHA-256 of `model_name@model_revision`, a newline, and the exact assembled
text. Student vectors are regenerated only
when the skills/interests/preferences or model version changes. Opportunity
vectors are regenerated only when their assembled title/type/company/
industry/description/skills or model version changes, when an Admin runs the
generation endpoint. Existing eligible opportunities require one initial
generation pass; later calls can update only changed rows. No pgvector or ANN
index is used: PostgreSQL persists vectors as arrays and the server computes
cosine similarity for retrieved eligible rows. The local PostgreSQL 18
installation was checked and does not include `vector.control` or `vector.dll`.

Run the local model demonstration (real model inference, not mocked vectors):

```powershell
python services\semantic_embedding_service.py --demo
```

In this environment, the real model emitted 384-dimensional vectors and
reported cosine 0.819415 for a backend/API/PostgreSQL internship versus a
related Python/PostgreSQL API role, and 0.244986 versus an unrelated graphic
design role. These values demonstrate one input pair; they are not universal
relevance thresholds or expected scores for other model/runtime versions.

To prepare a local CPU environment, review the impact first: PyTorch and model
dependencies are large, and the first model load downloads weights. This
workspace already has the pinned PyTorch/Transformers packages, so no install
was run. On a machine missing them, use a project virtual environment and
install only after confirming the supported Python/PyTorch wheels:

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\CampusConnect" | Out-Null
python -m venv "$env:LOCALAPPDATA\CampusConnect\.venv-semantic"
& "$env:LOCALAPPDATA\CampusConnect\.venv-semantic\Scripts\Activate.ps1"
python -m pip install --upgrade pip
python -m pip install -r requirements-semantic-search.txt
```

In one PowerShell window, start the worker; it binds only to loopback
`127.0.0.1:8008` and loads the model once:

```powershell
python services\semantic_embedding_service.py
```

For a separate private deployment host, configure `SEMANTIC_EMBEDDING_URL` to
an HTTPS endpoint implementing the same `/embed` JSON contract, and set
`SEMANTIC_EMBEDDING_TOKEN` in the Next.js server's secret configuration. Set
the same token in the embedding service secret store. The included Python
worker can bind to a private interface with
`SEMANTIC_EMBEDDING_HOST=0.0.0.0`, but only when that token is set; put it
behind a TLS reverse proxy and firewall rather than exposing its HTTP port
publicly. Do not use `NEXT_PUBLIC_` names. No remote worker is provisioned or
verified by this project.

In a second window, apply the additive migration only to an approved local
development database, using PostgreSQL 18:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=placement_management --username=YOUR_DEVELOPMENT_ROLE --file=db\semantic-vector-search.sql
```

Start the Next.js development server in another window:

```powershell
npm run dev
```

After signing in as an Admin, add genuine opportunity text and generate vectors
for that opportunity (repeat with the actual approved descriptions/skills for
each opportunity). No sample job content is silently inserted:

```powershell
$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$adminUsername = Read-Host "Admin username"
$adminPasswordSecure = Read-Host "Admin password" -AsSecureString
$adminPassword = [System.Net.NetworkCredential]::new("", $adminPasswordSecure).Password
$adminBody = @{ username = $adminUsername; password = $adminPassword } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/login" -WebSession $adminSession -ContentType "application/json" -Body $adminBody
$adminPassword = $null
$adminPasswordSecure.Dispose()

$opportunityContent = @{
  opp_id = 42
  description = "Use the approved real opportunity description here."
  required_skills = @("Python", "PostgreSQL")
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/admin/semantic-embeddings" -WebSession $adminSession -ContentType "application/json" -Body $opportunityContent
```

The request must include `opp_id`, `description` (a string or `null`), and
`required_skills` (an array; use an empty array when none are specified).

To generate or refresh embeddings for all opportunity rows after reviewing and
populating their descriptions/skills, call the Admin-only endpoint with no
body:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/admin/semantic-embeddings" -WebSession $adminSession
```

Sign in as a Student in PowerShell (password input is not echoed); this
establishes the `$studentSession` used for profile and recommendation calls:

```powershell
$studentSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$studentUsername = Read-Host "Student username"
$studentPasswordSecure = Read-Host "Student password" -AsSecureString
$studentPassword = [System.Net.NetworkCredential]::new("", $studentPasswordSecure).Password
$studentLoginBody = @{ username = $studentUsername; password = $studentPassword } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/login" -WebSession $studentSession -ContentType "application/json" -Body $studentLoginBody
$studentPassword = $null
$studentPasswordSecure.Dispose()

$skillsBody = @{
  skills = @(
    @{ name = "Python"; proficiency = "advanced" },
    @{ name = "PostgreSQL"; proficiency = "intermediate" }
  )
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Put -Uri "http://localhost:3000/api/student/skills" -WebSession $studentSession -ContentType "application/json" -Body $skillsBody
```

Students request semantic recommendations from the existing Student-owned
endpoint. It resolves the student's PostgreSQL identity and GPA from the
verified session; clients cannot choose the student ID:

```powershell
$studentBody = @{
  interests = "backend systems and data platforms"
  careerPreferences = @("platform engineering", "backend development")
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/vector-recommendations" -WebSession $studentSession -ContentType "application/json" -Body $studentBody
```

The home page now exposes this request through a Student-only
**Semantic Opportunity Recommendations** panel. It sends `mode: "semantic"`,
interests, and a comma-separated career-preference list to the same endpoint;
it never sends a student ID. The panel displays actual response fields,
similarity scores, loading/errors, empty results, and missing-embedding
notices. An authenticated interactive browser-to-database session has not
been verified. A semantic cache miss may call the worker and persist a student
vector, so demonstrate the UI against an approved development database.

Semantic mode is the default. If the student text is empty, the route returns
an empty semantic result without invoking the worker. Otherwise it first
checks the matching student-vector cache; a cache miss requires the running
worker and persists the generated vector. Opportunity storage is then read
from PostgreSQL, and GPA/deadline eligibility is applied. If eligible rows
exist but none has a valid vector joined for the pinned model/revision, the
API returns HTTP 503. Missing or stale-source vectors are excluded; a
stale-only set of otherwise valid arrays can return an empty successful
response with a missing-vector count. The route never silently switches to
lexical matching. To explicitly use the older lexical TF-IDF fallback for comparison, send
`mode = "lexical"` in the request body. The response declares
`mode: "semantic-embedding-cosine"` or `mode: "lexical-tfidf-cosine"` so the
two approaches are not conflated.

Run deterministic TypeScript ranking/input tests and Python mocked-model/service
tests with:

```powershell
npm run test:semantic
npm run test:semantic:python
```

The TypeScript tests cover vector shape, cosine ranking, eligibility boundary
cases, empty profiles, and client-supplied identity rejection. Python unit
tests use a fake model output and verify the service contract; only the
`--demo` command runs the real downloaded model. Read-only verification of the
local PostgreSQL database on 2026-11-20 found five opportunity vectors and one
student vector. All six had the expected 384 dimensions, finite numeric
values, expected model metadata, and valid hash format; the five opportunity
source hashes matched current assembled text. Four opportunities were eligible
for the student linked to the stored vector and all four had current-model
vectors. The student source hash could not be reconstructed because the MongoDB
collection was empty and recommendation preferences are request-scoped. The
authenticated recommendation API and browser flow have not been tested
end-to-end. Use the read-only script to inspect an approved development DB:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X --set=ON_ERROR_STOP=on --dbname=placement_management --username=YOUR_READ_ONLY_ROLE --file=db\semantic-vector-verification.sql
```

`lib/vector-search.ts` remains the explicitly lexical TF-IDF fallback. It is
not the semantic embedding implementation. The full-text search endpoint and
its GIN indexes remain unchanged.

Student profile access continues to require a Student session and resolves
`student_id` from PostgreSQL; Admin opportunity content and vector generation
requires an Admin session and a same-origin request. MongoDB retains flexible
student skills; PostgreSQL remains authoritative for student identity, GPA,
opportunities, and persistent embeddings.

## Run read-only verification safely

Use a PostgreSQL role that has permission to read the relevant catalogs and
view data but no permission to modify database objects or rows. The
verification script also opens a read-only transaction, so PostgreSQL rejects
any accidental write statement in that script.

From the repository root, run:

```text
psql -X --set=ON_ERROR_STOP=on --dbname=placement_management --username=YOUR_READ_ONLY_ROLE --file=db/verification.sql
```

Provide authentication through your normal local PostgreSQL configuration or
prompt; do not put passwords in this command or in the repository. The
verification script does not connect to a database on its own and should only
be run when you intentionally want to inspect a database.

`queries.sql` is an educational query collection. Its parameterized example
uses PostgreSQL `$1` bind-parameter syntax and is intended to be executed by an
application with a bound parameter, not pasted directly into `psql`.
