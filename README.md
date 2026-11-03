# PermiTrack

Hierarchical permission management for universities. Students request access (lab equipment, facilities, data, travel, …), faculty and administrative authorities review it through a configurable approval chain, and administrators govern the catalogue, people and workflows.

The approval engine lives in PostgreSQL. Every state transition is a locked, transactional, `SECURITY DEFINER` function that re-checks the caller, validates the payload, writes revision/audit rows and notifies the next actor. The Next.js app is a thin, typed client over that engine.

---

## Contents

- [Feature tour](#feature-tour)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Demo data](#demo-data)
- [Testing](#testing)
- [Architecture](#architecture)
- [The workflow engine](#the-workflow-engine)
- [Security model](#security-model)
- [HTTP API](#http-api)
- [Project layout](#project-layout)
- [Deployment](#deployment)
- [Design notes & limits](#design-notes--limits)

---

## Feature tour

### Student portal

- Projects with team members, a faculty guide and a department.
- Dynamic permission forms generated from each permission type's JSON schema, including conditional fields.
- Required document upload with versioning and replacement (old versions retained for audit).
- Save draft → submit → follow the pinned approval chain stage by stage.
- Answer blocking queries, respond to change requests and resubmit without losing history.
- Withdraw a request while it is still in review.
- In-app notifications for every decision, question, delegation and re-approval trigger.
- Advisory AI helpers (writing suggestions, document checklist, query drafting) that never approve or reject.

### Authority portal

- Inbox of actionable stages, plus pending and overdue views.
- Full request detail: form snapshot, documents, approval chain, timeline, revisions and queries.
- Approve, reject, request changes, ask a query, edit permitted fields, forward or delegate a stage.
- Internal comments that students cannot see.
- Guard rails: an authority can only act on their own active stage, in order, and only while the request is in review.

### Administration

- Users, activation, role assignment with department scope.
- Department hierarchy with heads and parent links.
- Permission types with a form-schema editor, field-level material flags and required document types.
- Versioned workflow templates: build drafts, validate stage conditions, publish, deactivate. Published/referenced versions are immutable.
- Monitor every request, including “stalled” requests whose next approver is missing or inactive, and resume them by assigning an eligible approver.
- Analytics: status distribution, weekly volume, average stage duration and live bottlenecks.
- Audit log with filtering and CSV export; request CSV export too.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15.5 (App Router, Server Components, Server Actions) |
| UI | React 19, Tailwind CSS v4, shadcn-style primitives on Radix UI, lucide icons |
| Data | Supabase Postgres + Row Level Security + Storage |
| Auth | Supabase Auth (email/password), cookie sessions via `@supabase/ssr` |
| Validation | Zod at the edge, mirrored plpgsql validation in the engine |
| Engine tests | PGlite running the real migrations |
| Language | TypeScript (strict), SQL (plpgsql) |

---

## Quick start

### 1. Create a Supabase project

Use a hosted project or the Supabase CLI locally. You need the project URL, the anon key and the service role key.

### 2. Apply the migrations

Apply the SQL files in `supabase/migrations/` **in filename order**:

```
20260101000100_core_schema.sql
20260101000200_helpers.sql
20260101000300_engine.sql
20260101000400_admin.sql
20260101000500_rls.sql
20260101000600_storage.sql
20260101000700_seed_roles.sql
```

Either link the project and push:

```bash
npx supabase init          # first time only: creates supabase/config.toml
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

or paste each file into the SQL editor in order. Migration `0006` creates the private `private-documents` bucket and its policies; `0007` seeds the baseline roles (`student`, `faculty_guide`, `department_head`, `lab_manager`, `dean`, `admin`).

> Roles are required before sign-up: the `on_auth_user_created` trigger assigns the `student` role to every new account.

### 3. Configure the app

```bash
cp .env.example .env.local
```

Fill in the three Supabase values and (optionally) `DEMO_PASSWORD`. See [Environment variables](#environment-variables).

### 4. Install, seed, run

```bash
npm install
npm run seed:demo
npm run dev
```

Open <http://localhost:3000/login> and sign in with any demo account below.

### Local Supabase (optional)

If you use the Supabase CLI for local development, initialise it first (`npx supabase init`), start it (`npx supabase start`) and copy the printed URL/keys into `.env.local`. `supabase db reset` re-applies the migrations. Then run `npm run seed:demo`.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser/server client key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes on the server | Admin user management and seeding. **Never expose to the browser.** |
| `NEXT_PUBLIC_APP_URL` | recommended | Absolute links in emails and notifications |
| `RESEND_API_KEY` | no | Transactional email. Without it, in-app notifications still work. |
| `EMAIL_FROM` | no | From address for notification emails |
| `AI_BASE_URL` | no | OpenAI-compatible base URL for advisory features |
| `AI_API_KEY` | no | Enables the advisory AI routes |
| `AI_MODEL` | no | Model name (default `gpt-4o-mini`) |
| `DEMO_PASSWORD` | no | Password for `npm run seed:demo` (default `PermiTrack#2026`) |

Integrations degrade gracefully: email and AI calls are skipped when their keys are absent, and `/api/health` reports which are configured.

---

## Database migrations

| Migration | Contents |
| --- | --- |
| `core_schema` | Tables, constraints, indexes, timestamps, new-user trigger, workflow immutability triggers, status/action enums as check constraints |
| `helpers` | Authorization helpers (`require_active_user`, `require_admin`, `can_view_request`, …), form validation, approver resolution, notifications, audit, document requirement checks |
| `engine` | Request lifecycle: create draft, save, submit, approval actions, withdraw, document registration, queries, delegation/forwarding, admin stage recovery |
| `admin` | Projects, catalogue and workflow builder RPCs, user/department administration, search, analytics |
| `rls` | Row Level Security policies for every table, least-privilege grants (read-only tables for `authenticated`, RPC-only writes) |
| `storage` | Private `private-documents` bucket and path-scoped policies |
| `seed_roles` | Baseline roles, idempotent |

Migrations are additive: `0007` is safe to re-run via `on conflict`.

---

## Demo data

`npm run seed:demo` requires the service role key and anon key, then creates:

- Departments: **School of Engineering** → **Computer Science**, **Mechanical Engineering**.
- Permission type **Lab Equipment Access** with a conditional form (supervision notes appear only when supervision is required) and two required documents.
- Published workflow **v1**:
  1. Faculty guide review (SLA 72 h)
  2. Lab manager clearance (SLA 48 h)
  3. Department head approval (SLA 96 h)
  4. Dean review — only when `risk_level = high` (SLA 120 h)
- Project **Autonomous Drone Lab** with owner, faculty guide and a second student member.
- One submitted request with placeholder PDFs, so the faculty guide's inbox is not empty.

| Account | Role | Scope |
| --- | --- | --- |
| `admin@permitrack.demo` | admin | university-wide |
| `dean@permitrack.demo` | dean | university-wide |
| `head.cs@permitrack.demo` | department_head | Computer Science |
| `guide@permitrack.demo` | faculty_guide | Computer Science |
| `lab@permitrack.demo` | lab_manager | Computer Science |
| `student@permitrack.demo` | student | Computer Science |
| `priya@permitrack.demo` | student | Computer Science |

All use `DEMO_PASSWORD` (default `PermiTrack#2026`). The script is idempotent and never deletes data.

> The seeded request is submitted through the same public RPCs the UI uses. If the storage bucket is unavailable, the request remains a draft and the script prints a warning instead of failing.

---

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm run db:test     # engine scenarios against PGlite
npm run build       # production build
```

`tests/engine.test.ts` boots an in-memory Postgres (PGlite), applies every migration except storage, and exercises the real functions as different users. It covers:

- draft creation, dynamic validation and required documents
- approver authorization, stage locking and ordering
- authority edits, material-change invalidation and re-approval
- change requests, blocking queries and resubmission
- final approval, validity window and post-approval immutability
- withdrawal while in review
- delegation and forwarding
- conditional stage skipping
- missing/inactive approvers, admin notification and stage recovery
- workflow immutability and version pinning
- internal comments and RLS visibility
- analytics and admin-only guards
- multiple role assignments for one user

Tests are deterministic and need no network access.

---

## Architecture

```
Browser
  │  Server Components (read)        Server Actions / Route Handlers (write)
  ▼                                        │
Next.js (Node)                             │  Zod validation + session
  │  Supabase SSR client (RLS)            │  Supabase client as the signed-in user
  ▼                                        ▼
Postgres ── RLS read policies ── public.api_* SECURITY DEFINER functions
                                    │  row locks, authorization, validation
                                    ├─ engine_* / handle_* / notify_* internals
                                    ├─ approval_actions + request_revisions + audit_logs
                                    └─ notifications (+ optional email)
Storage ── private-documents bucket ── signed URLs (5 min) via server route
```

Key rules:

- **Reads** go through RLS. A user only sees projects they belong to, requests they can view, documents attached to visible requests, and their own notifications.
- **Writes** never touch tables directly. `authenticated` has `SELECT` only; all mutations call `api_*` functions.
- **Identity is never trusted from the client.** Functions derive the actor from `auth.uid()` and re-check roles, memberships and stage assignment.
- **The client is not the source of truth for status or stage.** Actions accept a request, an action name and optional payload; the engine computes the resulting state.
- Internal helpers (`engine_*`, `handle_*`, `notify_*`) are not executable by API roles.

---

## The workflow engine

### Version pinning

A request stores `workflow_template_id` when its draft is created. `request_stage_states` are materialized from that template. Publishing a new version only affects future drafts. Published versions and versions referenced by a request are locked by trigger: stages cannot be inserted/updated/deleted and identity fields cannot change.

### Stages and statuses

Request status: `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`.

Stage status: `PENDING`, `ACTIVE`, `WAITING_STUDENT`, `APPROVED`, `REJECTED`, `SKIPPED`, `INVALIDATED`.

Each stage resolves an approver from the project and department:

- `PROJECT_FACULTY_GUIDE` → the project's guide
- `DEPARTMENT_HEAD` → head of the project department (or ancestor scope)
- `LAB_MANAGER`, `DEAN`, `ROLE` → holder of that role in scope
- `USER` → a specific person
- `CUSTOM` → role or user

A stage can carry a condition (`{field, equals | not_equals | in | exists}`, plus `all`/`any`). Conditions are evaluated when the stage would activate; false stages are marked `SKIPPED`. This is how the demo's dean stage only runs for high-risk access.

### Approval actions

`api_perform_action(request_id, action, stage_state_id, comment, payload)` is the only entry point for decisions. Supported actions:

```
SUBMIT_REQUEST            APPROVE_STAGE            REJECT_REQUEST
REQUEST_CHANGES           ASK_QUERY                ANSWER_QUERY
RESUBMIT_REQUEST          EDIT_REQUEST_BY_AUTHORITY
UPLOAD_DOCUMENT           REPLACE_DOCUMENT         FORWARD_STAGE
DELEGATE_STAGE            WITHDRAW_REQUEST         ISSUE_FINAL_PERMISSION
```

Every action is one transaction: lock the request, verify status, verify actor authorization for the current stage, validate and apply the payload, update stage/request state, insert an `approval_actions` row, insert a `request_revisions` row when data changes, write `audit_logs`, and notify the right people.

### Authority edits and material changes

An authority may edit only fields listed in the current stage's `can_edit_fields` (administrators bypass this list). Every edit is stored as a before/after revision. When an edited field is **material**:

- earlier `APPROVED` stages are invalidated when their `invalidates_on` list is empty (meaning “any material change”) or intersects the changed fields;
- invalidated stages become `INVALIDATED` and the request restarts at the earliest invalidated sequence;
- affected approvers are notified that re-approval is required.

### Documents

- Required documents are checked at submission and after re-uploads.
- Files are private; downloads use a 5-minute signed URL issued by a server route after an RLS-checked lookup.
- MIME type, size limit and storage path prefix (`requests/{requestId}/`) are validated. Replacements increment `version` and link the old row via `replaced_by`.
- Uploads to approved requests are rejected.

### Stalled requests

If the next approver is missing or inactive:

- at submission, the request is refused with `MISSING_APPROVER` and administrators are notified;
- mid-flow, the request remains `UNDER_REVIEW` without a current stage so it is visibly stuck;
- administrators use `api_admin_assign_stage` to assign an eligible active approver. The function only accepts a `PENDING`/`INVALIDATED` stage whose earlier stages are all `APPROVED`/`SKIPPED`.

### Queries and changes

A blocking query moves the active stage to `WAITING_STUDENT`. The student answers; the stage returns to `ACTIVE`. Requesting changes moves the request to `CHANGES_REQUESTED`, returns it to the student for editing, and resubmission restarts at the stage that requested changes (or the earliest invalidated stage). All history is retained.

---

## Security model

- **RLS on every table**, with helper functions marked `SECURITY DEFINER` and a pinned `search_path`.
- **Least-privilege grants**: `authenticated` gets `SELECT`; mutations are revoked and exposed only through selected `api_*` RPCs.
- **Server-side authorization everywhere**: layouts call `requireActiveViewer` / `requireAdminViewer`; Server Actions and Route Handlers re-check the viewer, and the database re-checks again. Hiding a button is never the control.
- **No client-trusted role, stage or status.** Payloads contain only user data; the engine derives everything else.
- **Private documents.** The bucket is not public; signed URLs expire after 300 seconds; the download route resolves the row under RLS first.
- **Internal comments.** Stored with `is_internal`; the UI and API omit them for students, and RLS restricts access to admins, the faculty guide, stage assignees and staff actors.
- **Input validation.** Zod schemas at the edge and matching plpgsql validation inside the engine (form schema, form data, MIME/size, path prefix, enum values).
- **Auditability.** Privileged actions write `audit_logs`; data changes write `request_revisions`; approvals write `approval_actions`.
- **Workflow immutability.** Enforced by trigger, not convention.
- **Transactional decisions.** Row locks prevent double approvals and races between approvers/admins.

SQLSTATEs in the `PT4xx` range carry safe, human-readable messages and are mapped to HTTP statuses by `src/lib/errors.ts`:

`PT400` bad request · `PT401` unauthenticated · `PT403` forbidden · `PT404` not found · `PT409` conflict · `PT422` validation · `PT428` precondition.

---

## HTTP API

All routes require a session; admin routes additionally require the `admin` role.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness and configured integrations |
| `GET` | `/api/requests/[id]` | Request detail, filtered for internal comments |
| `GET` | `/api/documents/[id]/download` | RLS-checked 302 to a 5-minute signed URL |
| `GET`/`POST` | `/api/notifications` | List; mark one/all read |
| `GET` | `/api/analytics` | Admin analytics payload |
| `GET` | `/api/reports/requests` | Admin CSV export (status/search/stalled filters) |
| `GET` | `/api/reports/audit` | Admin CSV export (action/entity filters) |
| `POST` | `/api/ai/suggest` | Advisory writing suggestions |
| `POST` | `/api/ai/documents` | Advisory document checklist review |
| `POST` | `/api/ai/query` | Advisory draft answer to a query |

AI features are strictly advisory: they return text, never mutate a request, and are unavailable when `AI_API_KEY` is unset.

---

## Project layout

```
src/
  app/
    (auth)/            login, register
    (app)/             authenticated shell: dashboard, projects, requests,
                       approvals, notifications, admin/**
    actions/           Server Actions (auth, projects, requests, admin, notifications)
    api/               Route Handlers (health, requests, documents, reports, AI, …)
  components/
    ui/                shadcn-style primitives
    admin/             users, departments, catalogue, workflow editors
    requests/          dynamic form, chain, timeline, authority panel, documents
    projects/          project form and member manager
  lib/
    supabase/          browser, server, admin and middleware clients
    services/          typed reads and RPC calls
    validation/        Zod schemas
    forms/schema.ts    visibility/condition helpers shared with the UI
    auth.ts            viewer + guards
    errors.ts          AppError and SQLSTATE mapping
    constants.ts       labels, statuses, MIME types, roles
supabase/migrations/   schema, helpers, engine, admin, RLS, storage, roles
scripts/seed-demo.ts   idempotent demo data
tests/                 PGlite harness + engine scenarios
```

---

## Deployment

1. Apply migrations to the production Supabase project.
2. Set the environment variables in your host (Vercel, Fly, Docker, …). Keep the service role key server-only.
3. Set `NEXT_PUBLIC_APP_URL` to the public origin.
4. `npm run build && npm start` (or let the host build).
5. In Supabase Auth, configure the site URL, redirect URLs and email templates. For production, enable email confirmation and a real SMTP provider.
6. Optionally configure Resend and an AI provider. Without them, notifications stay in-app and AI panels are hidden/disabled.
7. Rotate the demo password or remove demo accounts before real use.

No cron jobs or background workers are required: SLAs are computed from `due_at` at read time, and notifications are written inside the transaction that causes them.

---

## Design notes & limits

- **SLAs are tracking, not enforcement.** Overdue stages are surfaced in the UI and analytics; they do not auto-reject or auto-escalate. Adding an escalation job would be an additive table + scheduled function.
- **Approver resolution is deterministic per stage.** If a role has multiple holders, the engine picks the configured/first eligible active holder. Use `USER` stages when a specific person must sign.
- **The form schema is per permission type, not versioned separately.** Existing requests keep their `form_data` and render against the schema they were submitted with; changing a field affects new requests. Workflow versions, by contrast, are pinned.
- **The seeded PDFs are placeholders** to demonstrate the document workflow; replace them in a real deployment.
- **PGlite tests skip the storage migration** because the storage schema is Supabase-managed. Storage behaviour is exercised through the app, not the engine tests.
- **AI output is never authoritative.** Prompts are constrained to advisory text; no AI route can call an approval RPC.
