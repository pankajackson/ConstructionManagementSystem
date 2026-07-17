# ConstructOS — Backend (FastAPI + MongoDB)

Async Python API service. All routes live under `/api/v1/*` and return the same envelope:

```json
{ "success": true, "data": { ... }, "error": null, "meta": { ... } }
```

Auto-generated OpenAPI is at **`/api/v1/docs`** (Swagger UI) and **`/api/v1/redoc`**.

---

## Run

### With Docker (from repo root)

```bash
docker compose up -d backend
docker compose logs -f backend
```

### Manually (Python 3.11+)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # then edit if needed
uvicorn server:app --reload --port 8001
```

The API is now at `http://localhost:8001/api/v1`.  
On first boot, the lifespan hook seeds a **"Demo Constructions Pvt Ltd"** org with 4 users + 2 projects + tasks + issues (idempotent — safe to restart).

---

## Env vars

Copy `.env.example` → `.env`. Groups:

### Core (always required)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=constructos_db
JWT_SECRET=<64+ char random string>
```

### Auth & sessions
```
ACCESS_TOKEN_MINUTES=480     # JWT lifetime (default 8h)
REFRESH_TOKEN_DAYS=30
OTP_EXPIRY_MINUTES=10
OTP_MAX_ATTEMPTS=5           # per-code; after this the OTP is invalidated
OTP_RATE_LIMIT_PER_HOUR=10   # per email
DEV_MODE=true                # true → return `dev_otp` in response when provider is console
```

### OTP delivery (pluggable)
```
OTP_DELIVERY_TYPE=console        # or: sendgrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=             # must be VERIFIED in SendGrid
SENDGRID_FROM_NAME=ConstructOS
```

### Storage (pluggable)
```
STORAGE_TYPE=filesystem          # or: s3
UPLOAD_DIR=/app/backend/uploads
PUBLIC_BASE_URL=                 # e.g. http://localhost:8001 in dev, https://api.your.co in prod
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_S3_REGION=ap-south-1
AWS_S3_PUBLIC_URL_BASE=          # optional CloudFront/CDN base
S3_PRESIGNED_TTL_SECONDS=604800  # 7 days (S3 SigV4 max)
```

Startup will **fail fast** with a clear message if `OTP_DELIVERY_TYPE=sendgrid` or `STORAGE_TYPE=s3` is chosen and required keys are missing.

---

## File layout

```
backend/
├── server.py              FastAPI app assembly + lifespan (indexes + seed)
├── core/
│   ├── config.py          env → Settings + validate_startup_config()
│   ├── db.py              Motor client + async index creation
│   ├── security.py        JWT, hash helpers, OTP generator
│   ├── deps.py            get_current_user, get_current_membership, require_roles
│   ├── response.py        envelope() / error_envelope() / paginate_meta()
│   ├── email_provider.py  Pluggable OTP delivery (Console / SendGrid)
│   └── storage_provider.py Pluggable file storage (Filesystem / S3)
├── models/
│   └── schemas.py         Pydantic request/response schemas + Literals
├── routers/
│   ├── auth.py            /auth/*   — OTP, verify, refresh, logout, me
│   ├── orgs.py            /organizations/* + members + invites
│   ├── projects.py        /projects/*   — CRUD, archive, activity
│   ├── tasks.py           /projects/{pid}/tasks/*  — history, comments, CSV
│   ├── logs.py            /projects/{pid}/logs/*   — draft/submitted, unlock
│   ├── issues.py          /projects/{pid}/issues/* — transitions, CSV
│   ├── notifications.py   /notifications/*
│   └── uploads.py         /uploads/image  +  /uploads/file/{org}/{name}
├── tests/
│   └── backend_test.py    pytest suite (49 tests, run via `pytest -v tests/`)
├── uploads/               local file storage (when STORAGE_TYPE=filesystem)
├── requirements.txt
└── .env / .env.example
```

---

## Domain rules (enforced in the service layer)

- **Multi-tenancy:** every write and every list is filtered by `organization_id` from `X-Org-Id`. Cross-org reads return 404 (indistinguishable from missing).
- **Roles:** `require_roles("admin", "project_manager")` etc. dependency is applied at each router endpoint.
- **Last-admin protection:** you can't demote or deactivate the sole admin of an org.
- **Task status:** linear `todo → in_progress → done`. Only Admin/PM can revert.
- **Daily logs:** partial unique index on `(project_id, submitted_by, date)` where `status="submitted"` — prevents duplicate submitted logs. Multiple drafts are OK. Admin can unlock a submitted log for 2h, only within 24h of submission.
- **Issues:** `resolved` requires a resolution note; `closed` requires Admin/PM; reopening requires a reason.
- **Uploads:** JPEG/PNG/WebP only, ≤ 10 MB, magic-byte validated.

---

## Testing

```bash
# with Docker:
docker compose exec backend pytest -v tests/

# without Docker:
cd backend && source .venv/bin/activate && pytest -v tests/
```

Latest run: **49/49 passing** (auth, RBAC, cross-tenant isolation, all modules, uploads, CSV, pluggable providers).

To hit the API directly:

```bash
API=http://localhost:8001/api/v1

# 1. request OTP
RESP=$(curl -s -X POST "$API/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com"}')

# 2. extract dev_otp (only present when OTP_DELIVERY_TYPE=console + DEV_MODE=true)
OTP=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['dev_otp'])")

# 3. verify → get JWT + refresh
LOGIN=$(curl -s -X POST "$API/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@demo.com\",\"code\":\"$OTP\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")
ORG=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['organizations'][0]['id'])")

# 4. call any org-scoped endpoint
curl -s "$API/projects" -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG"
```

---

## Adding a new provider

Add a new email or storage backend without touching any router:

1. Subclass `EmailProvider` (or `StorageProvider`) in the respective `core/*_provider.py`.
2. Implement `send_otp` / `upload` + `get_file_url`.
3. Add a switch case in the `get_*_provider()` factory + validate its env in `validate_startup_config()`.
4. Restart backend — done.

Example provider ideas: Resend, AWS SES, SMTP, GCS, Cloudflare R2, Azure Blob.
