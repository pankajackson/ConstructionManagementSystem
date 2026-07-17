# ConstructOS — Test Credentials

## Overview
Authentication is **Email + OTP only (no passwords)**. The backend runs in `DEV_MODE=true`, so the 6-digit OTP is returned in the JSON response body of `POST /api/v1/auth/request-otp` under `data.dev_otp` and is also logged to the backend stdout.

The seeded demo organization is: **"Demo Constructions Pvt Ltd"**.

## Demo Users (pre-seeded on backend startup)

| Role            | Email                | Name         |
|-----------------|----------------------|--------------|
| Admin           | admin@demo.com       | Ravi Kumar   |
| Project Manager | pm@demo.com          | Anita Sharma |
| Site Engineer   | engineer@demo.com    | Sunil Patel  |
| Viewer          | viewer@demo.com      | Owner Sethi  |

All four are members of the "Demo Constructions Pvt Ltd" organization.

## How to sign in from the UI
1. Open `/login`.
2. Click one of the "Try the demo" buttons (Admin / PM / Engineer / Viewer) — this auto-requests + auto-verifies OTP in dev mode and signs you in directly.
   OR
3. Enter one of the demo emails → click **Send OTP** → copy the OTP shown in the "Dev mode OTP" yellow banner on the OTP step → paste and verify.

## How to sign in via API
```bash
API=https://<preview-host>/api/v1

# Step 1: request OTP
RESP=$(curl -s -X POST "$API/auth/request-otp" \
       -H "Content-Type: application/json" \
       -d '{"email":"admin@demo.com"}')
OTP=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['dev_otp'])")

# Step 2: verify OTP → get JWT + refresh
LOGIN=$(curl -s -X POST "$API/auth/verify-otp" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"admin@demo.com\",\"code\":\"$OTP\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")
ORG=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['organizations'][0]['id'])")

# Step 3: any org-scoped call requires BOTH headers
curl -s "$API/projects" -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG"
```

## Auth endpoints
- `POST /api/v1/auth/request-otp`  — `{ email, name? }` → `{ dev_otp?, expires_in }`
- `POST /api/v1/auth/verify-otp`   — `{ email, code }` → `{ access_token, refresh_token, user, organizations }`
- `POST /api/v1/auth/refresh`      — `{ refresh_token }` → `{ access_token }`
- `POST /api/v1/auth/logout`       — Bearer required
- `GET  /api/v1/auth/me`           — Bearer required

## Notes for testers
- Every org-scoped endpoint requires the `X-Org-Id` header. The org id comes from `data.organizations[i].id` in the verify-otp response.
- OTPs are single-use and expire in 10 min (configurable via `OTP_EXPIRY_MINUTES`).
- Rate limit: max 10 OTPs/hour per email; max 5 wrong-code attempts per OTP.
- All timestamps are ISO 8601 UTC on the wire; frontend renders in DD/MM/YYYY IST.
