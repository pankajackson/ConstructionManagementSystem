# ConstructOS — Product Requirements Document

## Problem Statement
Multi-organization Construction Management Platform for Indian construction/building companies to replace spreadsheets and WhatsApp for site operations — tasks, daily logs, issues, and team coordination across multiple simultaneous projects. Reference UX: Onsite (Android app).

## Architecture (as delivered)

Three cleanly separated layers so any one can be maintained independently:

| Layer    | Tech |
|----------|------|
| Database | **MongoDB** via Motor (async). Every entity carries `organization_id`, soft-delete `deleted_at`, audit fields. Compound + partial unique indexes enforce relational-style constraints. |
| Backend  | **FastAPI** under `/api/v1/*`. `{ success, data, error, meta }` envelope. Auto OpenAPI at `/api/v1/docs`. RBAC enforced in the service layer via `require_roles(...)`. Multi-tenancy via `X-Org-Id` header. Rate-limited OTP endpoints. |
| Web      | **React (CRA) + Tailwind** — brutalist industrial theme (Barlow Condensed + IBM Plex), safety-yellow accents, sunlight-legible chips. Includes drag-and-drop **Kanban** view for tasks. |
| Mobile   | **Expo / React Native** under `/app/mobile/` — thin client over the same API. Camera + gallery, offline drafts for daily logs, deep-link ready via `constructos://` scheme. Builds via EAS. |

## Pluggable providers (config-only swap)

Both providers are selected via env vars; switching is a config change, not a code change.

### OTP delivery (`OTP_DELIVERY_TYPE`)
- **`console`** *(default)* — logs the OTP to backend stdout. When `DEV_MODE=true`, the OTP is also echoed in the `POST /auth/request-otp` response for testing. **Never** exposed with `sendgrid`.
- **`sendgrid`** — sends a real HTML+plaintext email via SendGrid. Requires `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` (verified sender) + optional `SENDGRID_FROM_NAME`. Startup fails fast with a clear error if any of these is missing.

### File storage (`STORAGE_TYPE`)
- **`filesystem`** *(default)* — writes to `UPLOAD_DIR`, served via backend route. URLs are built from `PUBLIC_BASE_URL` (falls back to request base) so they render on mobile/external clients.
- **`s3`** — uploads to a **private** S3 bucket, returns **pre-signed** GET URLs (default TTL 7 days, configurable via `S3_PRESIGNED_TTL_SECONDS`). If `AWS_S3_PUBLIC_URL_BASE` is set (CloudFront), that CDN URL is returned instead. Startup fails fast if `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_S3_REGION` are missing.

Both provider interfaces live in `/app/backend/core/email_provider.py` and `/app/backend/core/storage_provider.py`. Adding a Resend / R2 / GCS provider means adding a new class implementing the same interface and adding a switch case — no other code changes.

## Personas & roles (unchanged)
Admin · Project Manager · Site Engineer · Viewer — all enforced server-side.

## What's implemented (as of 2026-01-17, iterations 1 & 2)

### Backend
- Email + OTP auth (JWT + refresh + logout revocation)
- RBAC (4 roles) enforced in service layer + last-admin protection
- Organizations + members + invites (auto-provisions user on invite)
- Projects (CRUD, archive, stats, activity feed)
- Tasks (CRUD, status history, comments, filters/sort/pagination, CSV export, overdue detection)
- Daily Logs (draft + submitted, partial-unique index prevents duplicate submissions per date/user/project, admin unlock within 24h)
- Issues (CRUD, mandatory resolution note on resolve, admin/PM close, mandatory reopen reason, CSV export)
- Notifications (task/issue assignment, status changes, daily-log submissions, mark-read, unread-count)
- **Pluggable Email provider** (console / sendgrid) with startup validation
- **Pluggable Storage provider** (filesystem / s3 with pre-signed URLs)
- 49/49 backend tests passing (regression + new feature deltas)

### Web (React)
- Login (OTP + one-click demo signins for all 4 roles)
- Org setup / switcher
- Projects grid + search + status filter
- Project detail with Overview / Tasks / Logs / Issues tabs
- **Tasks: List view + drag-and-drop Kanban view** (To-Do / In Progress / Done). Server-side RBAC still applies to drag actions.
- Task, Log, Issue detail pages with full history / comments / photo lightbox / status transitions
- Team management (Admin can invite + activate/deactivate)
- Notifications inbox

### Mobile (Expo / React Native)
- Login screen (OTP + demo signins, matching web design system)
- Bottom-tab layout: Projects / Notifications / Profile
- Projects list, Project detail (Tasks / Logs / Issues)
- New Daily Log form with camera + gallery + offline-draft fallback
- Raise Issue form with camera
- Same `constructos://` deep-link scheme registered for push handling later
- Not yet: push notifications (dependencies wired, endpoint pending)

## Prioritized backlog

### P0 (needs credentials from you, code is ready)
1. **Flip `OTP_DELIVERY_TYPE=sendgrid`** — add SendGrid API key + verified sender to `backend/.env`. Restart backend.
2. **Flip `STORAGE_TYPE=s3`** — add AWS keys + bucket + region to `backend/.env`. Restart backend. No code changes.
3. **Run `eas init`** in `/app/mobile/` to bind the Expo project to your Expo/EAS account, paste the printed `projectId` into `app.json`.

### P1
1. Push notifications — token registration endpoint + FCM/APNs via `expo-notifications`
2. Search bar on tasks/issues
3. Post-Kanban polish: swimlanes by assignee, WIP limits, keyboard drag
4. Task detail page in mobile app (currently list only)
5. Log unlock audit trail displayed in activity feed
6. Bulk CSV import for tasks/logs

### P2 (roadmap — out of scope for MVP)
Document management, workforce attendance/geo-fence, materials & inventory, financials, subcontractor portal, custom analytics, Gantt, custom roles UI, multi-org UI switcher (data model already supports it).

## Next tasks list
1. Paste SendGrid + AWS keys into `backend/.env` → sendgrid + s3 code paths activate automatically.
2. Run `eas init` in `/app/mobile/` and start test builds.
3. Prioritize any P1 item — I'd suggest **push notifications** next; the mobile shell is already deep-link ready.

## Iteration 3 — Mobile app upgrade (2026-01-20)
- Upgraded mobile app from **Expo SDK 51 → SDK 54** (React Native 0.81.5, React 19.1.0, expo-router v6, reanimated v4 with react-native-worklets).
- Fixed missing peer deps (`expo-font`, `expo-constants`, `react-native-worklets`) and pinned all SDK-54-compatible versions. `npx expo-doctor` now reports **18/18 checks passing**.
- Generated placeholder assets (`icon.png`, `adaptive-icon.png`, `splash.png`, `favicon.png`) under `mobile/assets/` — replaces the broken `./assets/icon.png` reference.
- Switched from `yarn` to **npm** per user preference: removed yarn.lock, added `.npmrc` with `legacy-peer-deps=true` (needed for SDK 54's react/react-dom peer graph), regenerated `package-lock.json`, and rewrote the README to use npm.
- Changed `npm run android` / `npm run ios` scripts from `expo run:*` (which requires a local Android SDK / Xcode) to `expo start --android` / `expo start --ios` so they work with **Expo Go** and don't fail on machines without native toolchains. `npm run build:android|ios|preview` still use EAS cloud builds.
- Removed the stale `react-native-reanimated/plugin` entry from `babel.config.js` — under RN reanimated 4, `babel-preset-expo` wires the correct `react-native-worklets/plugin` automatically.


## Iteration 4 — Per-project visibility, per-project roles & member profiles (2026-01-24)

### What shipped
- **Project visibility now enforced per-user.** Users see only projects they are assigned to; org admins see all. Non-members hit **403** on any `/projects/{id}/...` write route.
- **Per-project role assignments.** New `project_members` collection: `{project_id, user_id, roles[]}`. One user can hold multiple roles per project (e.g. `site_engineer` + `viewer`) so an admin can grant fine-grained access to different sections.
- **New "Members" tab on Project detail** — assign / edit-roles / remove flow with a multi-select role picker (chips). PM row is protected from removal; changing PM is done via Edit Project.
- **Enhanced `/organizations/current/members` list** — adds `projects_count`, `open_tasks_count`, `last_login_at`. Team page columns updated + search / role-filter / sort-by dropdown; rows are clickable.
- **New `/team/:userId` — Member Detail page** — profile hero, 5 KPI cards (Projects, Open tasks, Done, Total, Open issues), "Projects Assigned" list with per-project role badges + PM chip, "Recent Activity" feed.
- **`my_roles` on every project card** so users see at a glance what role they have in each project.
- **Backfill migration** at startup ensures every project's PM is a recorded `project_members` row (`project_manager` role) — idempotent, no data change if already present.

### Backend endpoints added
- `GET   /api/v1/projects/{id}/members`
- `POST  /api/v1/projects/{id}/members`         `{ user_id, roles[] }`
- `PATCH /api/v1/projects/{id}/members/{user}`  `{ roles[] }`
- `DELETE /api/v1/projects/{id}/members/{user}`  (PM protected → 400)
- `GET   /api/v1/organizations/current/members/{user_id}`

### RBAC change
- Project-scoped routes now depend on `require_project_roles(...)` / `project_ctx` instead of `require_roles(...)`. Effective role = highest of the user's project_member roles (org admin → always `admin`).

### Verified
70/70 backend pytest cases pass (49 existing + 21 new for iteration 4). Playwright verified: viewer sees only Skyline card with 'VIEWER' badge; Team list + Member Detail render correctly; Admin Members tab shows Assign / Edit / Remove flow with multi-role picker.

### Follow-ups (optional)
- Consider auto-creating an explicit `project_members` row for the PM on PM-change (removes the "implicit PM" edge case entirely).
- Add "recently active" leader-board / stale-user report on Team page.
