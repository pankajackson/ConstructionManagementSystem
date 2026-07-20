"""ConstructOS backend API test suite (first pytest run).

Covers:
- Auth (OTP request/verify/refresh/me/logout, rate limit, wrong-code attempts)
- Organizations & multi-tenancy (X-Org-Id enforcement, invites, last-admin protection)
- Projects (RBAC, list stats, patch, archive, search, cross-tenant isolation)
- Tasks (create/list/patch, status history, comments, viewer denied, site_engineer revert denied, CSV export)
- Daily logs (draft/submit, unique submitted per user/date, unlock flow)
- Issues (status transitions, resolve note required, close requires admin/PM, reopen reason required, CSV)
- Notifications (auto-generated on assign / status change / log submit; read + read-all + unread-count)
- Uploads (JPEG accepted, non-image MIME rejected, magic-byte enforced)
- Response envelope shape ({success,data,error,meta})
- Data scoping (org-B user cannot see/mutate org-A resources)
"""
import io
import os
import time
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://android-adb-debug.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/v1"

DEMO_EMAILS = {
    "admin": "admin@demo.com",
    "pm": "pm@demo.com",
    "engineer": "engineer@demo.com",
    "viewer": "viewer@demo.com",
}

TIMEOUT = 30


# ---------------- helpers ----------------
def _envelope_ok(js):
    assert isinstance(js, dict)
    assert "success" in js and "data" in js and "error" in js and "meta" in js
    return js


def _login(email: str) -> dict:
    """Returns { access_token, refresh_token, user, organizations } for demo email."""
    r = requests.post(f"{API}/auth/request-otp", json={"email": email}, timeout=TIMEOUT)
    assert r.status_code == 200, f"request-otp failed: {r.status_code} {r.text}"
    js = _envelope_ok(r.json())
    assert js["success"] is True
    otp = js["data"].get("dev_otp")
    assert otp, "dev_otp missing (DEV_MODE?)"
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "code": otp}, timeout=TIMEOUT)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    js = _envelope_ok(r.json())
    assert js["success"] is True
    return js["data"]


def _headers(token: str, org_id: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if org_id:
        h["X-Org-Id"] = org_id
    return h


@pytest.fixture(scope="session")
def sessions():
    """Login once for each demo user."""
    out = {}
    for k, email in DEMO_EMAILS.items():
        data = _login(email)
        out[k] = {
            "token": data["access_token"],
            "refresh": data["refresh_token"],
            "user": data["user"],
            "orgs": data["organizations"],
        }
    return out


@pytest.fixture(scope="session")
def admin_ctx(sessions):
    s = sessions["admin"]
    assert s["orgs"], "Admin should have at least one org"
    return {"token": s["token"], "org_id": s["orgs"][0]["id"], "user": s["user"], "refresh": s["refresh"]}


@pytest.fixture(scope="session")
def pm_ctx(sessions):
    s = sessions["pm"]
    return {"token": s["token"], "org_id": s["orgs"][0]["id"], "user": s["user"]}


@pytest.fixture(scope="session")
def eng_ctx(sessions):
    s = sessions["engineer"]
    return {"token": s["token"], "org_id": s["orgs"][0]["id"], "user": s["user"]}


@pytest.fixture(scope="session")
def viewer_ctx(sessions):
    s = sessions["viewer"]
    return {"token": s["token"], "org_id": s["orgs"][0]["id"], "user": s["user"]}


# ============================================================
# AUTH
# ============================================================
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        assert js["success"] is True and js["data"]["status"] == "ok"

    def test_request_otp_existing_demo_returns_dev_otp(self):
        r = requests.post(f"{API}/auth/request-otp", json={"email": "admin@demo.com"}, timeout=TIMEOUT)
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        assert js["data"]["dev_mode"] is True
        assert len(js["data"]["dev_otp"]) == 6
        assert js["data"]["dev_otp"].isdigit()
        # Iteration 2: delivery provider name is exposed in the envelope
        assert js["data"].get("delivery") == "console"

    def test_request_otp_delivery_field_present_and_verify_works(self):
        """The new delivery field must be present, and the dev_otp must still allow verification."""
        email = f"delivery_test_{uuid.uuid4().hex[:8]}@demo.com"
        r = requests.post(f"{API}/auth/request-otp", json={"email": email}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        js = _envelope_ok(r.json())
        assert js["data"].get("delivery") == "console"
        otp = js["data"].get("dev_otp")
        assert otp and len(otp) == 6
        v = requests.post(f"{API}/auth/verify-otp", json={"email": email, "code": otp}, timeout=TIMEOUT)
        assert v.status_code == 200, v.text
        assert v.json()["data"]["access_token"]

    def test_openapi_docs_loads(self):
        r = requests.get(f"{BASE_URL}/api/v1/docs", timeout=TIMEOUT)
        assert r.status_code == 200
        # It's an HTML swagger UI page
        assert "text/html" in r.headers.get("content-type", "").lower()
        r2 = requests.get(f"{BASE_URL}/api/v1/openapi.json", timeout=TIMEOUT)
        assert r2.status_code == 200
        spec = r2.json()
        assert "paths" in spec and "/api/v1/auth/request-otp" in spec["paths"]

    def test_verify_wrong_code_400(self):
        r = requests.post(f"{API}/auth/request-otp", json={"email": "pm@demo.com"}, timeout=TIMEOUT)
        assert r.status_code == 200
        r2 = requests.post(f"{API}/auth/verify-otp", json={"email": "pm@demo.com", "code": "000000"}, timeout=TIMEOUT)
        assert r2.status_code == 400
        js = r2.json()
        assert js["success"] is False and js["error"]["code"] == "HTTP_400"

    def test_verify_otp_success_returns_tokens_and_orgs(self, sessions):
        s = sessions["admin"]
        assert s["token"]
        assert s["refresh"]
        assert s["user"]["email"] == "admin@demo.com"
        assert isinstance(s["orgs"], list) and len(s["orgs"]) >= 1
        assert s["orgs"][0]["role"] == "admin"

    def test_refresh_returns_new_access(self, sessions):
        r = requests.post(f"{API}/auth/refresh", json={"refresh_token": sessions["viewer"]["refresh"]}, timeout=TIMEOUT)
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        assert js["data"]["access_token"]

    def test_me_returns_user_and_orgs(self, admin_ctx):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_ctx['token']}"}, timeout=TIMEOUT)
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        assert js["data"]["user"]["email"] == "admin@demo.com"
        assert isinstance(js["data"]["organizations"], list) and len(js["data"]["organizations"]) >= 1

    def test_me_requires_bearer(self):
        r = requests.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_rate_limit_10_per_hour(self):
        # Use a unique email so we don't collide with the shared demo users' quotas.
        email = f"rate_test_{uuid.uuid4().hex[:8]}@demo.com"
        hits = []
        for _ in range(12):
            rr = requests.post(f"{API}/auth/request-otp", json={"email": email}, timeout=TIMEOUT)
            hits.append(rr.status_code)
        assert 429 in hits, f"Expected 429 after 10 requests, got status codes: {hits}"

    def test_logout_revokes_refresh(self):
        # dedicated user to avoid interfering with shared session refresh tokens
        email = f"logout_test_{uuid.uuid4().hex[:8]}@demo.com"
        d = _login(email)
        # Logout without payload -> revokes all refresh tokens of this user
        r = requests.post(
            f"{API}/auth/logout",
            headers={"Authorization": f"Bearer {d['access_token']}", "Content-Type": "application/json"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        # Now refresh should fail
        r2 = requests.post(f"{API}/auth/refresh", json={"refresh_token": d["refresh_token"]}, timeout=TIMEOUT)
        assert r2.status_code == 401


# ============================================================
# MULTI-TENANCY / RBAC
# ============================================================
class TestOrgAndRBAC:
    def test_org_scoped_endpoint_needs_x_org_id(self, admin_ctx):
        r = requests.get(f"{API}/projects", headers={"Authorization": f"Bearer {admin_ctx['token']}"}, timeout=TIMEOUT)
        # deps.get_current_membership raises 400 when header missing
        assert r.status_code == 400

    def test_org_scoped_endpoint_rejects_non_member_org(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], "not-a-real-org-id"),
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_viewer_cannot_create_project(self, viewer_ctx):
        r = requests.post(
            f"{API}/projects",
            headers=_headers(viewer_ctx["token"], viewer_ctx["org_id"]),
            json={"name": "TEST_viewer_should_not_create"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_engineer_cannot_create_project(self, eng_ctx):
        r = requests.post(
            f"{API}/projects",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={"name": "TEST_eng_should_not_create"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_pm_can_create_project(self, pm_ctx):
        r = requests.post(
            f"{API}/projects",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"name": f"TEST_pm_created_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        assert js["data"]["name"].startswith("TEST_pm_created_")

    def test_pm_cannot_invite_member(self, pm_ctx):
        r = requests.post(
            f"{API}/organizations/current/invites",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"email": f"noone_{uuid.uuid4().hex[:6]}@demo.com", "role": "viewer"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_admin_can_invite_new_user(self, admin_ctx):
        email = f"invitee_{uuid.uuid4().hex[:6]}@demo.com"
        r = requests.post(
            f"{API}/organizations/current/invites",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            json={"email": email, "role": "viewer"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        js = _envelope_ok(r.json())
        assert js["data"]["status"] in ("invited", "added", "reactivated")

    def test_last_admin_cannot_demote_self(self, admin_ctx):
        # find own membership row
        r = requests.get(
            f"{API}/organizations/current/members",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        members = r.json()["data"]
        # Count active admins
        admins = [m for m in members if m["role"] == "admin" and m["is_active"]]
        my_row = next((m for m in members if m["user_id"] == admin_ctx["user"]["id"]), None)
        assert my_row is not None
        if len(admins) == 1:
            r2 = requests.patch(
                f"{API}/organizations/current/members/{my_row['membership_id']}",
                headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
                json={"role": "viewer"},
                timeout=TIMEOUT,
            )
            assert r2.status_code == 400
        else:
            pytest.skip(f"Not the last admin (count={len(admins)}); skipping last-admin protection assertion.")

    def test_admin_cannot_deactivate_self(self, admin_ctx):
        r = requests.get(
            f"{API}/organizations/current/members",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        members = r.json()["data"]
        my_row = next(m for m in members if m["user_id"] == admin_ctx["user"]["id"])
        r2 = requests.patch(
            f"{API}/organizations/current/members/{my_row['membership_id']}",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            json={"is_active": False},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 400


# ============================================================
# PROJECTS
# ============================================================
class TestProjects:
    def test_list_projects_returns_stats(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        assert isinstance(js["data"], list)
        assert js["meta"] and "total" in js["meta"]
        assert len(js["data"]) >= 2  # seeded
        for p in js["data"]:
            assert "stats" in p
            for k in ("tasks_total", "tasks_done", "progress_pct", "open_issues", "logs_this_week"):
                assert k in p["stats"]

    def test_project_detail_has_recent_activity(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        pid = r.json()["data"][0]["id"]
        r2 = requests.get(
            f"{API}/projects/{pid}",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        d = r2.json()["data"]
        assert "recent_activity" in d
        assert "stats" in d

    def test_patch_project_status_logged(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        pid = r.json()["data"][0]["id"]
        r2 = requests.patch(
            f"{API}/projects/{pid}",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            json={"status": "delayed"},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        assert r2.json()["data"]["status"] == "delayed"
        # revert to on_track
        requests.patch(
            f"{API}/projects/{pid}",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            json={"status": "on_track"},
            timeout=TIMEOUT,
        )

    def test_search_and_status_filter(self, admin_ctx):
        r = requests.get(
            f"{API}/projects?q=Skyline",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert any("Skyline" in p["name"] for p in r.json()["data"])

    def test_archive_project(self, admin_ctx):
        # create a throwaway project then archive
        cr = requests.post(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            json={"name": f"TEST_archive_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        pid = cr.json()["data"]["id"]
        r = requests.post(
            f"{API}/projects/{pid}/archive",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200 and r.json()["data"]["archived"] is True


# ============================================================
# TASKS
# ============================================================
class TestTasks:
    @pytest.fixture(scope="class")
    def project_id(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        return r.json()["data"][0]["id"]

    def test_create_task_and_persistence(self, admin_ctx, pm_ctx, eng_ctx, project_id):
        payload = {
            "title": f"TEST_task_{uuid.uuid4().hex[:6]}",
            "priority": "high",
            "assignee_id": eng_ctx["user"]["id"],
        }
        r = requests.post(
            f"{API}/projects/{project_id}/tasks",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json=payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["status"] == "todo"
        # GET back the task
        r2 = requests.get(
            f"{API}/projects/{project_id}/tasks/{data['id']}",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        assert r2.json()["data"]["title"] == payload["title"]

    def test_viewer_cannot_create_task(self, viewer_ctx, project_id):
        r = requests.post(
            f"{API}/projects/{project_id}/tasks",
            headers=_headers(viewer_ctx["token"], viewer_ctx["org_id"]),
            json={"title": "TEST_viewer_task"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_status_change_writes_history(self, admin_ctx, pm_ctx, project_id):
        cr = requests.post(
            f"{API}/projects/{project_id}/tasks",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"title": f"TEST_status_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        tid = cr.json()["data"]["id"]
        u = requests.patch(
            f"{API}/projects/{project_id}/tasks/{tid}",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "in_progress"},
            timeout=TIMEOUT,
        )
        assert u.status_code == 200
        assert u.json()["data"]["status"] == "in_progress"
        det = requests.get(
            f"{API}/projects/{project_id}/tasks/{tid}",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        hist = det.json()["data"]["history"]
        assert len(hist) >= 1
        assert hist[-1]["to_status"] == "in_progress"

    def test_site_engineer_cannot_revert_status(self, admin_ctx, pm_ctx, eng_ctx, project_id):
        # PM creates a task and moves it to done. Engineer tries to move it back.
        cr = requests.post(
            f"{API}/projects/{project_id}/tasks",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={
                "title": f"TEST_revert_{uuid.uuid4().hex[:6]}",
                "assignee_id": eng_ctx["user"]["id"],
            },
            timeout=TIMEOUT,
        )
        tid = cr.json()["data"]["id"]
        # move to in_progress then done as PM
        requests.patch(
            f"{API}/projects/{project_id}/tasks/{tid}",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "in_progress"},
            timeout=TIMEOUT,
        )
        requests.patch(
            f"{API}/projects/{project_id}/tasks/{tid}",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "done"},
            timeout=TIMEOUT,
        )
        r = requests.patch(
            f"{API}/projects/{project_id}/tasks/{tid}",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={"status": "in_progress"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_viewer_cannot_comment(self, viewer_ctx, pm_ctx, project_id):
        cr = requests.post(
            f"{API}/projects/{project_id}/tasks",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"title": f"TEST_view_comment_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        tid = cr.json()["data"]["id"]
        r = requests.post(
            f"{API}/projects/{project_id}/tasks/{tid}/comments",
            headers=_headers(viewer_ctx["token"], viewer_ctx["org_id"]),
            json={"text": "hi"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_engineer_comment_allowed(self, eng_ctx, pm_ctx, project_id):
        cr = requests.post(
            f"{API}/projects/{project_id}/tasks",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"title": f"TEST_eng_comment_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        tid = cr.json()["data"]["id"]
        r = requests.post(
            f"{API}/projects/{project_id}/tasks/{tid}/comments",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={"text": "starting work"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["text"] == "starting work"

    def test_csv_export_tasks(self, admin_ctx, project_id):
        r = requests.get(
            f"{API}/projects/{project_id}/tasks/export.csv",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Title" in r.text.splitlines()[0]

    def test_list_filters_and_pagination(self, admin_ctx, project_id):
        r = requests.get(
            f"{API}/projects/{project_id}/tasks?status=todo&page=1&page_size=5",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        js = _envelope_ok(r.json())
        for t in js["data"]:
            assert t["status"] == "todo"
        assert js["meta"]["page"] == 1


# ============================================================
# DAILY LOGS
# ============================================================
class TestDailyLogs:
    @pytest.fixture(scope="class")
    def project_id(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        return r.json()["data"][0]["id"]

    def test_create_draft_and_submitted(self, eng_ctx, project_id):
        d1 = f"2026-01-{(int(time.time()) % 27) + 1:02d}"
        # Use unique dates for each test to avoid conflicts
        unique_date = f"2025-12-{((int(time.time()) % 28) + 1):02d}"
        payload = {
            "date": unique_date,
            "labour_count": 25,
            "work_summary": "Slab work floors 18-20",
            "material_summary": "Cement 40 bags",
            "weather": "sunny",
            "remarks": "on schedule",
            "photos": [],
            "status": "draft",
        }
        r = requests.post(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json=payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "draft"

    def test_duplicate_submitted_rejected(self, eng_ctx, project_id):
        date = f"2025-11-{((int(time.time()) % 28) + 1):02d}"
        base = {
            "date": date,
            "labour_count": 10,
            "work_summary": "X",
            "material_summary": "",
            "weather": "cloudy",
            "photos": [],
            "status": "submitted",
        }
        r1 = requests.post(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json=base,
            timeout=TIMEOUT,
        )
        assert r1.status_code == 200, r1.text
        r2 = requests.post(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json=base,
            timeout=TIMEOUT,
        )
        assert r2.status_code == 409, f"expected 409 dup, got {r2.status_code} {r2.text}"

    def test_multiple_drafts_allowed(self, eng_ctx, project_id):
        date = f"2025-10-{((int(time.time()) % 28) + 1):02d}"
        base = {
            "date": date,
            "labour_count": 5,
            "work_summary": "draft1",
            "material_summary": "",
            "weather": "cloudy",
            "photos": [],
            "status": "draft",
        }
        r1 = requests.post(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json=base,
            timeout=TIMEOUT,
        )
        r2 = requests.post(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={**base, "work_summary": "draft2"},
            timeout=TIMEOUT,
        )
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)

    def test_engineer_sees_only_own_logs(self, eng_ctx, project_id):
        r = requests.get(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        for l in r.json()["data"]:
            assert l["submitted_by"] == eng_ctx["user"]["id"]

    def test_submitted_log_read_only_until_unlocked(self, eng_ctx, admin_ctx, project_id):
        date = f"2025-09-{((int(time.time()) % 28) + 1):02d}"
        cr = requests.post(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={
                "date": date,
                "labour_count": 8,
                "work_summary": "y",
                "material_summary": "",
                "weather": "sunny",
                "photos": [],
                "status": "submitted",
            },
            timeout=TIMEOUT,
        )
        assert cr.status_code == 200, cr.text
        lid = cr.json()["data"]["id"]
        # try edit as engineer -> should be 403
        r = requests.patch(
            f"{API}/projects/{project_id}/logs/{lid}",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={"work_summary": "edited"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403
        # admin unlocks
        u = requests.post(
            f"{API}/projects/{project_id}/logs/{lid}/unlock",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert u.status_code == 200, u.text
        # engineer edit now succeeds
        r2 = requests.patch(
            f"{API}/projects/{project_id}/logs/{lid}",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={"work_summary": "edited"},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200, r2.text

    def test_engineer_cannot_unlock(self, eng_ctx, project_id):
        # pick any log
        r = requests.get(
            f"{API}/projects/{project_id}/logs",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        docs = [l for l in r.json()["data"] if l["status"] == "submitted"]
        if not docs:
            pytest.skip("no submitted logs to attempt unlock on")
        lid = docs[0]["id"]
        u = requests.post(
            f"{API}/projects/{project_id}/logs/{lid}/unlock",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert u.status_code == 403


# ============================================================
# ISSUES
# ============================================================
class TestIssues:
    @pytest.fixture(scope="class")
    def project_id(self, admin_ctx):
        r = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        return r.json()["data"][0]["id"]

    def test_create_and_transitions(self, admin_ctx, pm_ctx, eng_ctx, project_id):
        cr = requests.post(
            f"{API}/projects/{project_id}/issues",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"title": f"TEST_issue_{uuid.uuid4().hex[:6]}", "category": "safety", "priority": "high"},
            timeout=TIMEOUT,
        )
        assert cr.status_code == 200, cr.text
        iid = cr.json()["data"]["id"]
        assert cr.json()["data"]["status"] == "open"

        # open -> in_progress (no note)
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "in_progress"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200

        # in_progress -> resolved WITHOUT note -> 400
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "resolved"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400

        # with note -> 200
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "resolved", "resolution_note": "Fixed with new brackets"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200

        # engineer cannot close
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            json={"status": "closed"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

        # PM can close
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "closed"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200

        # reopen without reason -> 400
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "open"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400

        # reopen with reason -> 200
        r = requests.post(
            f"{API}/projects/{project_id}/issues/{iid}/status",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"status": "open", "reopen_reason": "regression seen"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200

    def test_viewer_cannot_create_issue(self, viewer_ctx, project_id):
        r = requests.post(
            f"{API}/projects/{project_id}/issues",
            headers=_headers(viewer_ctx["token"], viewer_ctx["org_id"]),
            json={"title": "TEST_viewer_issue", "category": "safety", "priority": "high"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_issues_csv_export(self, admin_ctx, project_id):
        r = requests.get(
            f"{API}/projects/{project_id}/issues/export.csv",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")


# ============================================================
# NOTIFICATIONS
# ============================================================
class TestNotifications:
    def test_engineer_gets_task_assignment_notif(self, pm_ctx, eng_ctx, admin_ctx):
        # create task assigned to engineer as PM
        pr = requests.get(f"{API}/projects", headers=_headers(pm_ctx["token"], pm_ctx["org_id"]), timeout=TIMEOUT)
        pid = pr.json()["data"][0]["id"]
        requests.post(
            f"{API}/projects/{pid}/tasks",
            headers=_headers(pm_ctx["token"], pm_ctx["org_id"]),
            json={"title": f"TEST_notif_{uuid.uuid4().hex[:6]}", "assignee_id": eng_ctx["user"]["id"]},
            timeout=TIMEOUT,
        )
        # verify engineer has at least one notif
        r = requests.get(
            f"{API}/notifications",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert any(n["type"] == "task.assigned" for n in r.json()["data"])

    def test_unread_count_and_mark_read(self, eng_ctx):
        u = requests.get(
            f"{API}/notifications/unread-count",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert u.status_code == 200
        assert "unread" in u.json()["data"]

        # list and mark one read
        r = requests.get(
            f"{API}/notifications?unread_only=true",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        notifs = r.json()["data"]
        if notifs:
            nid = notifs[0]["id"]
            rr = requests.post(
                f"{API}/notifications/{nid}/read",
                headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
                timeout=TIMEOUT,
            )
            assert rr.status_code == 200

    def test_read_all(self, eng_ctx):
        r = requests.post(
            f"{API}/notifications/read-all",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        # After read-all unread should be 0
        u = requests.get(
            f"{API}/notifications/unread-count",
            headers=_headers(eng_ctx["token"], eng_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert u.json()["data"]["unread"] == 0


# ============================================================
# UPLOADS
# ============================================================
_PNG_1x1 = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x5b\xc8\xd0\xa9\x00\x00\x00\x00IEND\xaeB`\x82"


class TestUploads:
    def test_upload_image_success(self, admin_ctx):
        files = {"file": ("t.png", _PNG_1x1, "image/png")}
        r = requests.post(
            f"{API}/uploads/image",
            headers={"Authorization": f"Bearer {admin_ctx['token']}", "X-Org-Id": admin_ctx["org_id"]},
            files=files,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["url"].startswith("http")
        assert d["mime_type"] == "image/png"
        # Iteration 2: provider + key now in envelope
        assert d.get("provider") == "filesystem"
        assert d.get("key") and d["key"].startswith(f"{admin_ctx['org_id']}/")
        # Verify file is actually served back via the filesystem GET endpoint.
        # NOTE: `data.url` is built from request.base_url which resolves to the
        # internal cluster hostname behind the ingress and is not publicly
        # fetchable (pre-existing behavior from iteration_1). We therefore
        # verify serving through the canonical public BASE_URL + key.
        public_url = f"{BASE_URL}/api/v1/uploads/file/{d['key']}"
        get_r = requests.get(public_url, timeout=TIMEOUT)
        assert get_r.status_code == 200, f"{get_r.status_code} {get_r.text[:200]}"
        assert get_r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_upload_non_image_rejected(self, admin_ctx):
        files = {"file": ("t.txt", b"hello world", "text/plain")}
        r = requests.post(
            f"{API}/uploads/image",
            headers={"Authorization": f"Bearer {admin_ctx['token']}", "X-Org-Id": admin_ctx["org_id"]},
            files=files,
            timeout=TIMEOUT,
        )
        assert r.status_code == 400

    def test_upload_invalid_magic_bytes(self, admin_ctx):
        # advertised as image/png but content is not a real PNG
        files = {"file": ("fake.png", b"NOT_A_PNG_HEADER" * 10, "image/png")}
        r = requests.post(
            f"{API}/uploads/image",
            headers={"Authorization": f"Bearer {admin_ctx['token']}", "X-Org-Id": admin_ctx["org_id"]},
            files=files,
            timeout=TIMEOUT,
        )
        assert r.status_code == 400


# ============================================================
# CROSS-TENANT SCOPING
# ============================================================
class TestCrossTenant:
    def test_cross_org_isolation(self, admin_ctx):
        """A brand-new user creates their own org — should not see demo org resources."""
        # Register an isolated user
        new_email = f"crosstenant_{uuid.uuid4().hex[:8]}@demo.com"
        d = _login(new_email)
        token = d["access_token"]
        # Create a new org
        r = requests.post(
            f"{API}/organizations",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"name": f"TEST_org_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        new_org_id = r.json()["data"]["id"]

        # Try to fetch demo-org projects using this token & demo org header -> 403
        r2 = requests.get(
            f"{API}/projects",
            headers=_headers(token, admin_ctx["org_id"]),
            timeout=TIMEOUT,
        )
        assert r2.status_code == 403, f"Expected 403 cross-tenant, got {r2.status_code}"

        # Try to fetch a project by ID cross-tenant (using new org header but demo project id)
        demo_projects = requests.get(
            f"{API}/projects",
            headers=_headers(admin_ctx["token"], admin_ctx["org_id"]),
            timeout=TIMEOUT,
        ).json()["data"]
        demo_pid = demo_projects[0]["id"]
        r3 = requests.get(
            f"{API}/projects/{demo_pid}",
            headers=_headers(token, new_org_id),
            timeout=TIMEOUT,
        )
        # Since the project doesn't belong to new_org_id it should be 404 (route filters by org_id)
        assert r3.status_code == 404
