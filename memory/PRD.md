# ConstructOS — Product Requirements Document

## Problem Statement
Build a **multi-organization Construction Management Platform** for Indian construction and building companies to replace spreadsheets, WhatsApp, and manual paperwork for day-to-day site operations: task tracking, daily site logs, issue tracking, and team coordination across multiple simultaneous projects. Reference UX: the "Onsite" Android app.

## Architecture (as delivered in this iteration)

Because the Emergent preview environment cannot run PostgreSQL/Next.js/React-Native concurrently, we shipped the MVP on the fully-supported preview stack while preserving the 3-layer separation described in the brief. This is Option (a) that the user approved.

| Layer | Tech |
|---|---|
| Database | **MongoDB** via Motor (async). Every entity carries `organization_id`, soft-delete `deleted_at`, audit fields `created_at / updated_at / created_by`. Compound and partial unique indexes enforce relational-style constraints (e.g., one submitted daily-log per project/user/date). |
| Backend  | **FastAPI** (Python) under `/api/v1/*`. Consistent envelope `{ success, data, error, meta }`. Auto OpenAPI at `/api/v1/docs`. RBAC enforced in the service layer via FastAPI dependencies (`require_roles`), NOT in the frontend. Rate-limited OTP endpoints. |
| Frontend | **React (CRA) + Tailwind CSS**, brutalist industrial theme (Barlow Condensed + IBM Plex Sans/Mono), safety-yellow accent, sunlight-legible chips. |
| Mobile   | Deferred (per user selection: Option a). React Native/Expo scaffold to be added later. |
| Auth     | Email + OTP, no passwords. 6-digit code, 10-min expiry, single-use, rate-limited (10/hr per email, 5 wrong attempts). JWT access token (8h default) + refresh token (30d) in `refresh_tokens` collection with revocation on logout. In dev mode OTP is returned in the response and logged. |

## Personas
- **Admin** — full access, invites members, deactivates users, manages org settings.
- **Project Manager** — creates/edits projects, tasks, issues, logs; can close issues.
- **Site Engineer** — creates daily logs, tasks, issues; updates task status forward only.
- **Viewer** — read-only across the org.

## Core Requirements (static)
- Multi-tenant from day one; a user account can belong to multiple orgs via `memberships`; UI scopes to one org at a time via `X-Org-Id` header.
- All list endpoints paginated. All timestamps ISO 8601 UTC; UI renders DD/MM/YYYY IST.
- Every create/update/status-change writes an entry to `activity_log`.
- Uploads: only JPEG/PNG/WebP; ≤10 MB; magic-byte validated.

## What's been implemented (2026-01-17)
- **Auth** — request-OTP, verify-OTP, refresh, /me, logout with server-side token revocation.
- **Organizations** — create, list-my-orgs, get-current, update, list-members, invite (auto-provisions user), update role / activate-deactivate with last-admin protection.
- **Projects** — CRUD, archive/unarchive, per-project stats, activity feed, search + status filter, pagination.
- **Tasks** — CRUD, filter/sort/paginate, status history, append-only comments, image attachments, CSV export, overdue flag, forward-only status for engineers.
- **Daily Logs** — draft & submitted, unique-per-user-per-project-per-date (submitted), admin unlock within 24h grants 2h edit window, engineer sees only own logs, weather/date range filters, photo lightbox in detail view.
- **Issues** — CRUD, mandatory resolution note on resolve, admin/PM-only close, mandatory reopen reason, filters by status/priority/category/assignee/date, CSV export.
- **Notifications** — in-app: task/issue assigned, task status changed (notifies creator), daily log submitted (notifies admins+PMs of the org). Unread badge, mark-one/all-read.
- **Uploads** — local backend storage `/api/v1/uploads/image` + `/api/v1/uploads/file/{org}/{name}`.
- **Frontend UI** — Login (OTP + 4 one-click demo signins), Org setup, Org switcher, Projects grid, Project detail (Overview/Tasks/Logs/Issues tabs), Task detail with comments+history, Log detail with lightbox, Issue detail with status transitions, Team management (Admin), Notifications inbox.
- **Backend tests** — 47/47 passing (auth, RBAC, multi-tenancy isolation, all modules, uploads, CSV).

## Seed Data
On backend startup (lifespan), if the demo org is missing, we seed:
- Org "Demo Constructions Pvt Ltd" with 4 members (admin, PM, engineer, viewer).
- 2 projects (Skyline Residences — Tower B, Green Fields Warehousing).
- 5 tasks and 2 issues spanning both projects.

Credentials: see `/app/memory/test_credentials.md`.

## Prioritized backlog (P0 / P1 / P2)

### P0 (should ship next)
1. **Email delivery for OTP** — currently dev-only (OTP returned in response); wire SendGrid or Resend once a key is provided.
2. **Cloud object storage (S3 / R2 / Cloudinary)** — replace local backend storage for uploads.
3. **Full-text search** on tasks & issues.

### P1
1. **React Native / Expo mobile app** — camera integration, offline drafts, deep links to task/issue.
2. **Push notifications** (FCM Android, APNs iOS) + Email notifications.
3. **PostgreSQL migration** with Alembic — if scale requires it.
4. **Advanced RBAC** — project-scoped roles vs org-scoped roles; a custom-role UI.
5. **Task Kanban board** view (drag & drop columns).
6. **Log unlock audit trail** displayed in project activity.
7. **Bulk CSV import** for projects/tasks.

### P2 (roadmap — explicitly out-of-scope for MVP)
Document management, workforce attendance / geo-fence, material & inventory, financials, subcontractor portal, custom analytics, Gantt/scheduling, multi-org switching UI (data model supports it).

## Next tasks list
1. Ask user for email provider (SendGrid/Resend) API key → wire email OTP.
2. Ask user for image storage preference (S3/R2/Cloudinary) → migrate uploads.
3. Scaffold React Native (Expo) app pointing at same API.
4. Add search bar to task and issue lists.
