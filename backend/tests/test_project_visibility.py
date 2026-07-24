"""Iteration 3 — project visibility & members endpoints tests.

Covers:
- GET /projects filtering by user (viewer sees only assigned, admin sees all)
- my_roles / my_role fields
- GET /projects/{id} 403 for non-assigned users
- Project members CRUD (list, assign, patch, delete, cannot remove PM)
- Enhanced org members list (projects_count, open_tasks_count, last_login_at)
- GET /organizations/current/members/{user_id} (member detail)
- RBAC for project-scoped writes with per-project roles
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://project-assignment-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/v1"
TIMEOUT = 30

DEMO_EMAILS = {
    "admin": "admin@demo.com",
    "pm": "pm@demo.com",
    "engineer": "engineer@demo.com",
    "viewer": "viewer@demo.com",
}


def _login(email: str) -> dict:
    r = requests.post(f"{API}/auth/request-otp", json={"email": email}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    otp = r.json()["data"]["dev_otp"]
    v = requests.post(f"{API}/auth/verify-otp", json={"email": email, "code": otp}, timeout=TIMEOUT)
    assert v.status_code == 200, v.text
    return v.json()["data"]


def _h(token, org=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if org:
        h["X-Org-Id"] = org
    return h


@pytest.fixture(scope="module")
def ctx(demo_sessions):
    out = {}
    for k in DEMO_EMAILS:
        d = demo_sessions[k]
        out[k] = {
            "token": d["access_token"],
            "org_id": d["organizations"][0]["id"],
            "user": d["user"],
        }
    # Also get project IDs by name via admin
    r = requests.get(f"{API}/projects", headers=_h(out["admin"]["token"], out["admin"]["org_id"]), timeout=TIMEOUT)
    projects = r.json()["data"]
    skyline = next(p for p in projects if "Skyline" in p["name"])
    green = next(p for p in projects if "Green" in p["name"])
    out["skyline_id"] = skyline["id"]
    out["green_id"] = green["id"]
    return out


# ---------- Visibility filtering ----------
class TestProjectVisibility:
    def test_viewer_sees_only_assigned(self, ctx):
        r = requests.get(f"{API}/projects", headers=_h(ctx["viewer"]["token"], ctx["viewer"]["org_id"]), timeout=TIMEOUT)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()["data"]]
        # Should include Skyline
        assert any("Skyline" in n for n in names), f"Skyline missing from viewer list: {names}"
        # Should NOT include Green Fields
        assert not any("Green" in n for n in names), f"Green should be hidden from viewer: {names}"

    def test_engineer_sees_both(self, ctx):
        r = requests.get(f"{API}/projects", headers=_h(ctx["engineer"]["token"], ctx["engineer"]["org_id"]), timeout=TIMEOUT)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()["data"]]
        assert any("Skyline" in n for n in names)
        assert any("Green" in n for n in names)

    def test_admin_sees_all(self, ctx):
        r = requests.get(f"{API}/projects", headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]), timeout=TIMEOUT)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()["data"]]
        assert any("Skyline" in n for n in names)
        assert any("Green" in n for n in names)

    def test_my_roles_field_present(self, ctx):
        r = requests.get(f"{API}/projects", headers=_h(ctx["viewer"]["token"], ctx["viewer"]["org_id"]), timeout=TIMEOUT)
        data = r.json()["data"]
        for p in data:
            assert "my_roles" in p
        sky = next(p for p in data if "Skyline" in p["name"])
        assert "viewer" in sky["my_roles"], f"viewer expected in viewer's my_roles: {sky['my_roles']}"

    def test_admin_my_roles_admin(self, ctx):
        r = requests.get(f"{API}/projects", headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]), timeout=TIMEOUT)
        for p in r.json()["data"]:
            assert p["my_roles"] == ["admin"]

    def test_engineer_my_roles_site_engineer(self, ctx):
        r = requests.get(f"{API}/projects", headers=_h(ctx["engineer"]["token"], ctx["engineer"]["org_id"]), timeout=TIMEOUT)
        for p in r.json()["data"]:
            assert "site_engineer" in p["my_roles"]


# ---------- Direct access enforcement ----------
class TestDirectAccess:
    def test_viewer_403_on_green_fields(self, ctx):
        r = requests.get(
            f"{API}/projects/{ctx['green_id']}",
            headers=_h(ctx["viewer"]["token"], ctx["viewer"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 403, f"Expected 403 got {r.status_code}: {r.text[:200]}"

    def test_viewer_200_on_skyline(self, ctx):
        r = requests.get(
            f"{API}/projects/{ctx['skyline_id']}",
            headers=_h(ctx["viewer"]["token"], ctx["viewer"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        d = r.json()["data"]
        assert d["my_role"] == "viewer"
        assert "viewer" in d["my_roles"]

    def test_engineer_200_on_both(self, ctx):
        for pid in (ctx["skyline_id"], ctx["green_id"]):
            r = requests.get(f"{API}/projects/{pid}", headers=_h(ctx["engineer"]["token"], ctx["engineer"]["org_id"]), timeout=TIMEOUT)
            assert r.status_code == 200, f"{pid}: {r.status_code}"
            assert "site_engineer" in r.json()["data"]["my_roles"]


# ---------- Project members endpoints ----------
class TestProjectMembers:
    def test_list_skyline_members(self, ctx):
        r = requests.get(
            f"{API}/projects/{ctx['skyline_id']}/members",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        members = r.json()["data"]
        emails = {m["email"] for m in members}
        assert "pm@demo.com" in emails
        assert "engineer@demo.com" in emails
        assert "viewer@demo.com" in emails
        # PM flagged
        pm_row = next(m for m in members if m["email"] == "pm@demo.com")
        assert pm_row["is_project_manager"] is True

    def test_assign_and_update_and_remove_member(self, ctx):
        # Create ephemeral user
        invite_email = f"pmember_{uuid.uuid4().hex[:6]}@demo.com"
        inv = requests.post(
            f"{API}/organizations/current/invites",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            json={"email": invite_email, "role": "site_engineer"},
            timeout=TIMEOUT,
        )
        assert inv.status_code == 200, inv.text
        # Find the new user id
        members = requests.get(
            f"{API}/organizations/current/members",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        ).json()["data"]
        new_user = next(m for m in members if m["email"] == invite_email)
        uid = new_user["user_id"]

        # Assign to green fields
        r = requests.post(
            f"{API}/projects/{ctx['green_id']}/members",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            json={"user_id": uid, "roles": ["site_engineer", "viewer"]},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert set(r.json()["data"]["roles"]) == {"site_engineer", "viewer"}

        # Duplicate assign -> 409
        r2 = requests.post(
            f"{API}/projects/{ctx['green_id']}/members",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            json={"user_id": uid, "roles": ["viewer"]},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 409

        # Update roles
        u = requests.patch(
            f"{API}/projects/{ctx['green_id']}/members/{uid}",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            json={"roles": ["viewer"]},
            timeout=TIMEOUT,
        )
        assert u.status_code == 200
        assert u.json()["data"]["roles"] == ["viewer"]

        # List and confirm
        lst = requests.get(
            f"{API}/projects/{ctx['green_id']}/members",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        ).json()["data"]
        row = next(m for m in lst if m["user_id"] == uid)
        assert row["roles"] == ["viewer"]

        # Delete
        d = requests.delete(
            f"{API}/projects/{ctx['green_id']}/members/{uid}",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert d.status_code == 200

    def test_cannot_remove_project_manager(self, ctx):
        # Skyline PM is pm@demo.com
        pm_uid = ctx["pm"]["user"]["id"]
        r = requests.delete(
            f"{API}/projects/{ctx['skyline_id']}/members/{pm_uid}",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text[:200]}"


# ---------- Org members enhanced list ----------
class TestOrgMembersEnhanced:
    def test_enhanced_fields_present(self, ctx):
        r = requests.get(
            f"{API}/organizations/current/members",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        members = r.json()["data"]
        assert len(members) >= 4
        for m in members:
            for k in ("projects_count", "open_tasks_count", "last_login_at"):
                assert k in m, f"Missing field {k} in member row"
        # PM should have projects_count >= 2 (assigned to both Skyline+Green as PM)
        pm_row = next(m for m in members if m["email"] == "pm@demo.com")
        assert pm_row["projects_count"] >= 2

        # Viewer has projects_count == 1
        v_row = next(m for m in members if m["email"] == "viewer@demo.com")
        assert v_row["projects_count"] == 1


# ---------- Member detail endpoint ----------
class TestMemberDetail:
    def test_member_detail_shape(self, ctx):
        target_uid = ctx["pm"]["user"]["id"]
        r = requests.get(
            f"{API}/organizations/current/members/{target_uid}",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        for k in ("user", "membership", "projects", "task_stats", "open_issues", "recent_activity"):
            assert k in d
        assert d["user"]["email"] == "pm@demo.com"
        assert isinstance(d["projects"], list) and len(d["projects"]) >= 2
        # PM's projects list must show is_project_manager=True for at least one
        assert any(p["is_project_manager"] for p in d["projects"])
        # task_stats keys
        for k in ("todo", "in_progress", "done", "total", "open"):
            assert k in d["task_stats"]

    def test_viewer_member_detail_shows_only_skyline(self, ctx):
        target_uid = ctx["viewer"]["user"]["id"]
        r = requests.get(
            f"{API}/organizations/current/members/{target_uid}",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        d = r.json()["data"]
        assert len(d["projects"]) == 1
        assert "Skyline" in d["projects"][0]["name"]
        assert "viewer" in d["projects"][0]["roles"]

    def test_member_detail_404_bad_user(self, ctx):
        r = requests.get(
            f"{API}/organizations/current/members/nonexistent-user-id",
            headers=_h(ctx["admin"]["token"], ctx["admin"]["org_id"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 404


# ---------- Project-scoped RBAC via per-project roles ----------
class TestProjectRBAC:
    def test_viewer_cannot_create_task_on_assigned_project(self, ctx):
        # Owner Sethi is a viewer on Skyline
        r = requests.post(
            f"{API}/projects/{ctx['skyline_id']}/tasks",
            headers=_h(ctx["viewer"]["token"], ctx["viewer"]["org_id"]),
            json={"title": "TEST_viewer_no_task"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_engineer_can_create_task(self, ctx):
        r = requests.post(
            f"{API}/projects/{ctx['skyline_id']}/tasks",
            headers=_h(ctx["engineer"]["token"], ctx["engineer"]["org_id"]),
            json={"title": f"TEST_eng_task_{uuid.uuid4().hex[:6]}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text

    def test_viewer_cannot_write_to_unassigned_project(self, ctx):
        # viewer not a member of Green Fields at all
        r = requests.post(
            f"{API}/projects/{ctx['green_id']}/tasks",
            headers=_h(ctx["viewer"]["token"], ctx["viewer"]["org_id"]),
            json={"title": "TEST_no_access_task"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_pm_can_update_project(self, ctx):
        # PM of Skyline can PATCH
        r = requests.patch(
            f"{API}/projects/{ctx['skyline_id']}",
            headers=_h(ctx["pm"]["token"], ctx["pm"]["org_id"]),
            json={"description": f"updated by test {uuid.uuid4().hex[:4]}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text

    def test_engineer_cannot_update_project(self, ctx):
        r = requests.patch(
            f"{API}/projects/{ctx['skyline_id']}",
            headers=_h(ctx["engineer"]["token"], ctx["engineer"]["org_id"]),
            json={"description": "nope"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403
