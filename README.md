# ConstructOS

> **Multi-organization Construction Management Platform** — replace spreadsheets, WhatsApp and paper on the site with tasks, daily logs, issues, and team coordination. Built for the Indian construction industry.

[![Backend](https://img.shields.io/badge/backend-FastAPI-009688)](./backend)
[![Frontend](https://img.shields.io/badge/frontend-React_+_Tailwind-38bdf8)](./frontend)
[![Mobile](https://img.shields.io/badge/mobile-Expo_%2F_RN-000)](./mobile)
[![DB](https://img.shields.io/badge/db-MongoDB-13aa52)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/license-Private-lightgrey)](#)

---

## Table of contents

1. [What is this?](#what-is-this)
2. [Architecture at a glance](#architecture-at-a-glance)
3. [Repo layout](#repo-layout)
4. [Quickstart with Docker Compose (recommended)](#quickstart-with-docker-compose-recommended)
5. [Manual setup (without Docker)](#manual-setup-without-docker)
6. [Mobile app (Expo)](#mobile-app-expo)
7. [Demo accounts](#demo-accounts)
8. [Pluggable providers](#pluggable-providers)
9. [Common tasks](#common-tasks)
10. [Troubleshooting](#troubleshooting)

---

## What is this?

ConstructOS is a **multi-tenant SaaS** for construction / building companies. Every organization gets its own scoped workspace with:

- **Projects** — cards, statuses (On Track / Delayed / On Hold / Completed), activity feed
- **Tasks** — list + drag-and-drop **Kanban** board, comments, photo attachments, CSV export
- **Daily Logs** — labour count, work summary, materials, weather, photos, draft → submitted → admin unlock (24h window)
- **Issues** — Safety / Quality / Design / Material categories, mandatory resolution note, mandatory reopen reason
- **In-app Notifications** — task/issue assignment, status changes, daily-log submissions
- **4-role RBAC** — Admin, Project Manager, Site Engineer, Viewer (enforced server-side)
- **Email + OTP auth** — no passwords; JWT + refresh tokens
- **Mobile** — same API, native iOS + Android via Expo/React Native, camera + offline drafts

---

## Architecture at a glance

```
┌─────────────────────┐        ┌────────────────────────────────┐        ┌──────────────┐
│  Web (React + TW)   │        │   FastAPI (Python 3.11)        │        │   MongoDB    │
│  Kanban, dashboards │ ─────► │   /api/v1/*                    │ ─────► │   4.4+       │
│                     │        │   Response envelope            │        │              │
├─────────────────────┤        │   { success, data, error,      │        │  Compound &  │
│  Mobile (Expo/RN)   │ ─────► │     meta }                     │        │  partial     │
│  camera, offline    │        │   RBAC in service layer        │        │  unique idx  │
└─────────────────────┘        │   JWT + refresh                │        └──────────────┘
                               │                                │
                               │  Pluggable providers:          │
                               │  • Email (console | SendGrid)  │        ┌──────────────┐
                               │  • Storage (fs | S3 presigned) │ ─────► │   AWS S3     │
                               └────────────────────────────────┘        │  (optional)  │
                                                                         └──────────────┘
```

More detail:
- **Multi-tenancy:** every request must carry `Authorization: Bearer <jwt>` + `X-Org-Id: <org>`. All queries filter on `organization_id`.
- **Auth:** `POST /auth/request-otp` → OTP is either **logged to console** (`OTP_DELIVERY_TYPE=console`, default) or **emailed via SendGrid** (`OTP_DELIVERY_TYPE=sendgrid`).
- **File storage:** local disk (default) or **private S3 bucket with pre-signed URLs** (7-day TTL default). Config switch, no code change.

---

## Repo layout

```
constructos/
├── backend/                  FastAPI service (see backend/README.md)
├── frontend/                 React + Tailwind web app (see frontend/README.md)
├── mobile/                   Expo / React Native app (see mobile/README.md)
├── docker-compose.yml        One-command local dev environment
├── docker-compose.override.yml.example
├── .env.example              Sample env for `docker-compose` (root-level)
├── memory/
│   ├── PRD.md                Product requirements + roadmap
│   └── test_credentials.md   Seeded demo credentials
└── README.md                 (this file)
```

---

## Quickstart with Docker Compose (recommended)

**Prereqs:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 20.10 and Docker Compose v2 (bundled).

### 1. Clone

```bash
git clone <your-repo-url> constructos
cd constructos
```

### 2. Configure env

```bash
cp .env.example .env
# open .env in your editor — the defaults work out of the box.
# When ready for production, fill in SENDGRID_* / AWS_* placeholders.
```

### 3. Start everything

```bash
docker compose up -d --build
```

Wait ~60 seconds for the first build. This starts:

| Service   | Port | What                                  |
|-----------|------|----------------------------------------|
| mongo     | 27017 | MongoDB 6                              |
| backend   | 8001  | FastAPI + auto-seed demo org           |
| frontend  | 3000  | React dev server (hot reload)          |

### 4. Open the app

- **Web app:** http://localhost:3000
- **API docs (Swagger):** http://localhost:8001/api/v1/docs
- **Health:** http://localhost:8001/api/v1/health

### 5. Sign in

Click any of the **demo buttons** on the login screen (Admin / PM / Engineer / Viewer). The app auto-fetches the OTP and signs you in.

Or manually:
1. Enter `admin@demo.com` → Send OTP
2. The **OTP is shown in a yellow banner** on the next screen (dev mode) — also visible in `docker compose logs -f backend`
3. Enter the code → in.

### 6. Common Docker commands

```bash
docker compose logs -f backend      # tail backend logs
docker compose logs -f frontend
docker compose restart backend      # after editing backend/.env
docker compose down                 # stop everything (keeps data)
docker compose down -v              # stop + wipe MongoDB volume
```

---

## Manual setup (without Docker)

**Prereqs:** Python 3.11+, Node.js 20+, Yarn 1.x, MongoDB 5+ running locally on `mongodb://localhost:27017`.

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # keep defaults or customize
uvicorn server:app --reload --port 8001
```

Backend is now at http://localhost:8001 · Swagger at `/api/v1/docs`.

### Frontend

```bash
cd frontend
yarn install
cp .env.example .env
# Confirm REACT_APP_BACKEND_URL points to your backend
yarn start
```

Web app at http://localhost:3000.

### MongoDB (if not using Docker)

- **macOS:** `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`
- **Ubuntu:** [official install guide](https://www.mongodb.com/docs/manual/administration/install-on-linux/)
- **Windows:** [MongoDB Community MSI](https://www.mongodb.com/try/download/community)

Or just use the Docker service: `docker compose up -d mongo` and skip the rest.

---

## Mobile app (Expo)

See [`mobile/README.md`](./mobile/README.md) for the full flow. TL;DR:

```bash
cd mobile
yarn install
# Edit .env so EXPO_PUBLIC_API_URL points to your backend
# (use your LAN IP, e.g. http://192.168.1.100:8001, so the phone can reach it)
yarn start                # scan QR with Expo Go
yarn ios                  # macOS + Xcode simulator
yarn android              # Android Studio emulator
yarn build:preview        # EAS build → installable APK
```

> The mobile app is a **thin client** over the same `/api/v1` endpoints. No backend changes needed.

---

## Demo accounts

Pre-seeded on first backend boot into an org named **"Demo Constructions Pvt Ltd"**:

| Role            | Email                | Name         |
|-----------------|----------------------|--------------|
| Admin           | admin@demo.com       | Ravi Kumar   |
| Project Manager | pm@demo.com          | Anita Sharma |
| Site Engineer   | engineer@demo.com    | Sunil Patel  |
| Viewer          | viewer@demo.com      | Owner Sethi  |

Plus **2 projects, 5 tasks, and 2 issues** to explore. See [`memory/test_credentials.md`](./memory/test_credentials.md).

---

## Pluggable providers

Swap providers with an env change — **no code edits**.

### OTP delivery

| `OTP_DELIVERY_TYPE` | Behavior                                                        | Required env                                   |
|---------------------|------------------------------------------------------------------|------------------------------------------------|
| `console` *(default)* | Logs OTP to backend stdout; also returns `dev_otp` in the API response when `DEV_MODE=true`. | —                                          |
| `sendgrid`          | Sends a real HTML+plaintext email via SendGrid.                  | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (verified sender), `SENDGRID_FROM_NAME` |

Startup **fails fast** with a clear message if `sendgrid` is chosen and any key is empty.

### File storage

| `STORAGE_TYPE` | Behavior                                                                 | Required env                                                  |
|----------------|--------------------------------------------------------------------------|---------------------------------------------------------------|
| `filesystem` *(default)* | Writes to `UPLOAD_DIR`; backend serves at `/api/v1/uploads/file/{org}/{name}`. URLs built from `PUBLIC_BASE_URL` (fallbacks to request base). | `UPLOAD_DIR`, `PUBLIC_BASE_URL` (recommended) |
| `s3`           | Uploads to a **private** S3 bucket; returns **pre-signed** GET URLs.     | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_REGION`, optional `AWS_S3_PUBLIC_URL_BASE`, `S3_PRESIGNED_TTL_SECONDS` (default 604800 = 7 days) |

See the `.env.example` at each service for the full var list.

---

## Common tasks

### Run backend tests

```bash
# with Docker:
docker compose exec backend pytest -v tests/

# without Docker:
cd backend && source .venv/bin/activate && pytest -v tests/
```

### Reset the demo data

```bash
docker compose down -v      # wipes MongoDB volume
docker compose up -d        # re-seeds on next backend boot
```

### View backend OpenAPI

http://localhost:8001/api/v1/docs (Swagger UI)  ·  http://localhost:8001/api/v1/redoc (ReDoc)

### Rebuild after dep changes

```bash
docker compose build backend       # after editing backend/requirements.txt
docker compose build frontend      # after editing frontend/package.json
docker compose up -d
```

### Switch to SendGrid + S3 (production-ish)

1. Edit `.env`:
   ```
   OTP_DELIVERY_TYPE=sendgrid
   SENDGRID_API_KEY=SG.xxx
   SENDGRID_FROM_EMAIL=no-reply@yourdomain.com

   STORAGE_TYPE=s3
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_S3_BUCKET=constructos-uploads-prod
   AWS_S3_REGION=ap-south-1
   ```
2. `docker compose restart backend`
3. Watch logs — startup validation will yell loudly if anything is missing.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **`ECONNREFUSED` in frontend** on first run | Backend still booting — wait 20-30s; check `docker compose logs backend`. |
| **`E11000 duplicate key` from Mongo on seed** | The seed is idempotent — it's already been seeded once. Nothing to do. |
| **Photos in Kanban / logs show 403** | `PUBLIC_BASE_URL` in `.env` isn't pointing at a URL reachable by your browser. For local Docker: `http://localhost:8001`. |
| **OTP email never arrives** with `OTP_DELIVERY_TYPE=sendgrid` | Sender not verified in SendGrid, or API key lacks `mail.send` permission. Backend logs the SendGrid HTTP response body. |
| **Backend fails to start with `KeyError: 'MONGO_URL'`** | Copy `.env.example` → `.env` at the repo root before `docker compose up`. |
| **Frontend port already in use** | Change `frontend.ports` in `docker-compose.yml` from `3000:3000` to `3001:3000`. |
| **CORS error from mobile** | Backend `allow_origins=['*']` by default, so this should not happen. If it does, check the mobile `EXPO_PUBLIC_API_URL` — it must be the LAN IP of your dev machine, not `localhost`. |

---

## Contributing / handoff

This codebase is intentionally structured so any of the three tiers can be maintained independently by a different developer:

- **Backend** developer works only in `/backend/`. Contract is the OpenAPI at `/api/v1/docs`.
- **Web** developer works only in `/frontend/`. Consumes the same OpenAPI.
- **Mobile** developer works only in `/mobile/`. Also consumes the same OpenAPI.

The **domain rules** (RBAC, status transitions, unique constraints, notifications) all live in the backend service layer — the two clients are intentionally thin.

See `memory/PRD.md` for the current backlog and next tasks list.
