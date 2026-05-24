"""IONOS SMTP email service — daily digests and approval alerts."""
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from ..config import settings

log = logging.getLogger("nexus.email")


async def _send(subject: str, html: str, to: str | None = None) -> bool:
    """Send an HTML email via IONOS SMTP. Returns True on success."""
    recipient = to or settings.ionos_digest_recipient
    if not all([settings.ionos_smtp_email, settings.ionos_smtp_password, recipient]):
        log.debug("Email skipped — IONOS SMTP not configured")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.ionos_smtp_email
    msg["To"]      = recipient
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.ionos_smtp_host,
            port=settings.ionos_smtp_port,
            username=settings.ionos_smtp_email,
            password=settings.ionos_smtp_password,
            start_tls=True,
        )
        log.info("Email sent: %s → %s", subject, recipient)
        return True
    except Exception as e:
        log.error("Email failed: %s", e)
        return False


async def send_daily_digest(
    business_name: str,
    pending_approvals: int,
    briefing: dict,
    recent_tasks: list[dict],
) -> bool:
    """Send the morning AI briefing digest."""
    date_str = datetime.utcnow().strftime("%B %d, %Y")
    priority_actions = briefing.get("actions", []) if briefing else []
    risks = briefing.get("risks", []) if briefing else []
    summary = briefing.get("summary", "No briefing available — run AI Analysis to generate one.") if briefing else ""

    task_rows = ""
    for t in recent_tasks[:8]:
        status_color = {"completed": "#22c55e", "failed": "#ef4444", "running": "#7c3aed"}.get(t.get("status", ""), "#6b7280")
        task_rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#a0a0b8;font-size:12px;">{t.get('agent_name','')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#e0e0f0;font-size:12px;">{t.get('task','')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;font-size:11px;">
            <span style="color:{status_color};font-weight:600;">{t.get('status','').upper()}</span>
          </td>
        </tr>"""

    actions_html = "".join(
        f'<li style="margin:4px 0;color:#e0e0f0;font-size:13px;">{a}</li>'
        for a in priority_actions[:5]
    )
    risks_html = "".join(
        f'<li style="margin:4px 0;color:#fbbf24;font-size:13px;">⚠ {r}</li>'
        for r in risks[:3]
    )

    pending_color = "#f59e0b" if pending_approvals > 0 else "#22c55e"
    pending_label = f"{pending_approvals} awaiting decision" if pending_approvals > 0 else "None — all clear"

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#07070e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:28px;margin-bottom:8px;">🧠</div>
      <h1 style="color:#e0e0f0;font-size:20px;margin:0;">{business_name} — Daily AI Briefing</h1>
      <p style="color:#6b7280;font-size:13px;margin:4px 0 0;">{date_str} · NexusOS Autonomous Report</p>
    </div>

    <!-- Pending approvals alert -->
    <div style="background:#111122;border:1px solid {pending_color}40;border-left:3px solid {pending_color};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Pending Decisions</div>
      <div style="font-size:22px;font-weight:700;color:{pending_color};">{pending_label}</div>
      {'<p style="color:#a0a0b8;font-size:12px;margin:6px 0 0;">Open NexusOS to review and approve agent proposals.</p>' if pending_approvals > 0 else ''}
    </div>

    <!-- AI Summary -->
    {'<div style="background:#111122;border:1px solid #1e1e2e;border-radius:10px;padding:16px 20px;margin-bottom:20px;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">AI Summary</div><p style="color:#a0a0b8;font-size:13px;line-height:1.6;margin:0;">' + summary + '</p></div>' if summary else ''}

    <!-- Priority Actions -->
    {'<div style="background:#111122;border:1px solid #1e1e2e;border-radius:10px;padding:16px 20px;margin-bottom:20px;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Priority Actions</div><ul style="margin:0;padding-left:16px;">' + actions_html + '</ul></div>' if actions_html else ''}

    <!-- Risks -->
    {'<div style="background:#111122;border:1px solid #fbbf2420;border-radius:10px;padding:16px 20px;margin-bottom:20px;"><div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Watch</div><ul style="margin:0;padding-left:16px;">' + risks_html + '</ul></div>' if risks_html else ''}

    <!-- Recent Tasks -->
    {'<div style="background:#111122;border:1px solid #1e1e2e;border-radius:10px;padding:16px 20px;margin-bottom:20px;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Recent Agent Activity</div><table style="width:100%;border-collapse:collapse;"><thead><tr><td style="padding:6px 12px;font-size:10px;color:#6b7280;text-transform:uppercase;">Agent</td><td style="padding:6px 12px;font-size:10px;color:#6b7280;text-transform:uppercase;">Task</td><td style="padding:6px 12px;font-size:10px;color:#6b7280;text-transform:uppercase;">Status</td></tr></thead><tbody>' + task_rows + '</tbody></table></div>' if task_rows else ''}

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #1e1e2e;">
      <p style="color:#3b3b5a;font-size:11px;margin:0;">NexusOS · Autonomous Commerce Intelligence</p>
      <p style="color:#3b3b5a;font-size:11px;margin:4px 0 0;">Powered by local AI · No data leaves your machine</p>
    </div>
  </div>
</body>
</html>"""

    return await _send(f"[{business_name}] Daily AI Briefing — {date_str}", html)


async def send_approval_alert(
    business_name: str,
    approval_title: str,
    action_type: str,
    risk_level: str,
    estimated_cost: str,
    forecast: str,
) -> bool:
    """Send an instant alert when a high-risk approval is created."""
    risk_color = {"low": "#22c55e", "medium": "#f59e0b", "high": "#ef4444", "critical": "#dc2626"}.get(risk_level, "#f59e0b")

    html = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#07070e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:32px 16px;">
    <div style="background:#111122;border:1px solid {risk_color}40;border-left:3px solid {risk_color};border-radius:10px;padding:20px 24px;">
      <div style="font-size:11px;color:{risk_color};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        {risk_level.upper()} RISK · Action Required
      </div>
      <h2 style="color:#e0e0f0;font-size:16px;margin:0 0 8px;">{approval_title}</h2>
      <p style="color:#6b7280;font-size:12px;margin:0 0 16px;">{action_type.replace('_',' ').title()} · {business_name}</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div><div style="font-size:10px;color:#6b7280;margin-bottom:2px;">ESTIMATED COST</div>
          <div style="color:#e0e0f0;font-size:13px;font-weight:600;">{estimated_cost}</div></div>
        <div><div style="font-size:10px;color:#6b7280;margin-bottom:2px;">FORECAST</div>
          <div style="color:#e0e0f0;font-size:13px;">{forecast}</div></div>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Open NexusOS to review and approve or decline this proposal.</p>
    </div>
    <p style="text-align:center;color:#3b3b5a;font-size:11px;margin-top:24px;">NexusOS · Autonomous Commerce Intelligence</p>
  </div>
</body>
</html>"""

    return await _send(f"[{risk_level.upper()} RISK] {approval_title} — {business_name}", html)


async def test_connection() -> dict:
    """Test IONOS SMTP credentials."""
    if not all([settings.ionos_smtp_email, settings.ionos_smtp_password]):
        return {"ok": False, "error": "IONOS email credentials not configured"}
    try:
        conn = aiosmtplib.SMTP(
            hostname=settings.ionos_smtp_host,
            port=settings.ionos_smtp_port,
        )
        await conn.connect()
        await conn.starttls()
        await conn.login(settings.ionos_smtp_email, settings.ionos_smtp_password)
        await conn.quit()
        return {"ok": True, "message": f"Connected to {settings.ionos_smtp_host}:{settings.ionos_smtp_port} as {settings.ionos_smtp_email}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
