"""Pluggable email/OTP delivery providers.

Selected via `OTP_DELIVERY_TYPE` env var. Swapping providers is a config change,
not a code change. Every provider implements the `EmailProvider` interface.

Providers:
- ConsoleProvider — logs OTP to backend stdout. Also returns the OTP so the
  auth route can echo it back to the client in DEV_MODE.
- SendGridProvider — sends a real HTML+plain-text email via SendGrid.
"""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from core.config import get_settings

log = logging.getLogger("email")

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="email")


class EmailProvider(ABC):
    """Interface every provider implements."""

    provider_name: str = "base"

    @abstractmethod
    async def send_otp(self, *, to_email: str, code: str, expires_minutes: int) -> None: ...

    @property
    def exposes_dev_otp(self) -> bool:
        """If True, the API layer will include the OTP in the response body."""
        return False


class ConsoleProvider(EmailProvider):
    provider_name = "console"

    async def send_otp(self, *, to_email: str, code: str, expires_minutes: int) -> None:
        log.warning(
            "\n"
            "===================================================\n"
            " ConstructOS OTP (console delivery)\n"
            "  To      : %s\n"
            "  Code    : %s\n"
            "  Expires : %s minutes\n"
            "===================================================",
            to_email, code, expires_minutes,
        )

    @property
    def exposes_dev_otp(self) -> bool:
        # Only expose the OTP to the API response in DEV_MODE + console provider
        return get_settings().DEV_MODE


class SendGridProvider(EmailProvider):
    provider_name = "sendgrid"

    def __init__(self):
        from sendgrid import SendGridAPIClient  # deferred import
        self._client = SendGridAPIClient(get_settings().SENDGRID_API_KEY)

    def _build_message(self, to_email: str, code: str, expires_minutes: int):
        from sendgrid.helpers.mail import Mail
        s = get_settings()
        subject = f"Your ConstructOS verification code: {code}"
        plain = (
            f"Your ConstructOS verification code is {code}.\n"
            f"It expires in {expires_minutes} minutes. If you did not request this, ignore this email."
        )
        html = _render_otp_html(code=code, expires_minutes=expires_minutes)
        msg = Mail(
            from_email=(s.SENDGRID_FROM_EMAIL, s.SENDGRID_FROM_NAME or "ConstructOS"),
            to_emails=to_email,
            subject=subject,
            plain_text_content=plain,
            html_content=html,
        )
        return msg

    async def send_otp(self, *, to_email: str, code: str, expires_minutes: int) -> None:
        msg = self._build_message(to_email, code, expires_minutes)

        def _send():
            resp = self._client.send(msg)
            if resp.status_code >= 300:
                raise RuntimeError(
                    f"SendGrid returned HTTP {resp.status_code}: {getattr(resp, 'body', b'')!r}"
                )
            return resp.status_code

        loop = asyncio.get_running_loop()
        try:
            status = await loop.run_in_executor(_executor, _send)
            log.info("SendGrid OTP sent to %s (HTTP %s)", to_email, status)
        except Exception as e:
            log.exception("SendGrid failed to deliver OTP to %s: %s", to_email, e)
            raise


def _render_otp_html(*, code: str, expires_minutes: int) -> str:
    return f"""\
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
               background:#f4f4f5;padding:32px 0;margin:0;color:#09090b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
               style="background:#fff;border:2px solid #09090b;box-shadow:6px 6px 0 #09090b;">
          <tr><td style="background:#09090b;padding:20px 24px;">
            <div style="font-family:'Barlow Condensed',Impact,sans-serif;font-size:28px;
                        color:#fff;letter-spacing:-0.01em;line-height:1;text-transform:uppercase;">
              Construct<span style="color:#fbbf24;">OS</span>
            </div>
            <div style="color:#a1a1aa;font-size:11px;letter-spacing:.15em;text-transform:uppercase;margin-top:4px;">
              Site Operations Platform
            </div>
          </td></tr>
          <tr><td style="padding:32px 24px;">
            <p style="margin:0 0 8px 0;font-size:14px;letter-spacing:.15em;text-transform:uppercase;color:#71717a;">
              Sign-in code
            </p>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:42px;font-weight:700;
                        letter-spacing:.4em;color:#09090b;background:#fbbf24;border:2px solid #09090b;
                        padding:16px;text-align:center;margin:16px 0;">
              {code}
            </div>
            <p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;">
              Enter this 6-digit code in ConstructOS to complete sign-in.
              It expires in <strong>{expires_minutes} minutes</strong> and can be used only once.
            </p>
            <p style="margin:16px 0 0 0;font-size:12px;color:#71717a;">
              Didn't request this? You can safely ignore this email.
            </p>
          </td></tr>
          <tr><td style="border-top:2px solid #09090b;padding:12px 24px;background:#f4f4f5;
                          font-size:11px;color:#71717a;letter-spacing:.1em;text-transform:uppercase;">
            © ConstructOS · This is an automated message
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


@lru_cache
def get_email_provider() -> EmailProvider:
    """Instantiate the configured provider once, on first use."""
    s = get_settings()
    if s.OTP_DELIVERY_TYPE == "sendgrid":
        return SendGridProvider()
    return ConsoleProvider()
