"""Shared fixtures for backend tests: session-scoped logins to avoid OTP rate limits."""
import os
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


def _do_login(email):
    r = requests.post(f"{API}/auth/request-otp", json={"email": email}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    otp = r.json()["data"]["dev_otp"]
    v = requests.post(f"{API}/auth/verify-otp", json={"email": email, "code": otp}, timeout=TIMEOUT)
    assert v.status_code == 200, v.text
    return v.json()["data"]


@pytest.fixture(scope="session")
def demo_sessions():
    return {k: _do_login(e) for k, e in DEMO_EMAILS.items()}
