"""Slack notification service — sends real-time alerts and daily briefings.

Supports two auth methods (in priority order):
  1. Incoming Webhooks — simplest setup, one URL per channel
     Set SLACK_WEBHOOK_ALERTS and SLACK_WEBHOOK_BRIEFING in .env
     Get them: api.slack.com → Apps → NexusOS → Incoming Webhooks → Add to Slack

  2. Bot Token — more flexible, single token for all channels
     Set SLACK_BOT_TOKEN in .env
     Get it: api.slack.com → Your Apps → OAuth & Permissions → Bot User OAuth Token
"""
import logging
import httpx
from ..config import settings

log = logging.getLogger("nexus.slack")

SLACK_API = "https://slack.com/api/chat.postMessage"


async def _post(channel: str, text: str, blocks: list | None = None) -> bool:
    """Post a message to a Slack channel.

    Tries Incoming Webhook first (if configured for this channel),
    then falls back to Bot Token approach.
    """
    # ── Method 1: Incoming Webhook ─────────────────────────────────────────────
    webhook_url = None
    if channel == settings.slack_channel_alerts and settings.slack_webhook_alerts:
        webhook_url = settings.slack_webhook_alerts
    elif channel == settings.slack_channel_briefing and settings.slack_webhook_briefing:
        webhook_url = settings.slack_webhook_briefing

    if webhook_url:
        payload: dict = {"text": text}
        if blocks:
            payload["blocks"] = blocks
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(webhook_url, json=payload)
                if resp.status_code == 200 and resp.text.strip() == "ok":
                    return True
                log.error("Slack webhook error: HTTP %d — %s", resp.status_code, resp.text[:200])
                return False
        except Exception as e:
            log.error("Slack webhook failed: %s", e)
            return False

    # ── Method 2: Bot Token ────────────────────────────────────────────────────
    if not settings.slack_bot_token:
        log.debug("Slack skipped — no SLACK_WEBHOOK_* or SLACK_BOT_TOKEN configured")
        return False

    payload = {"channel": channel, "text": text}
    if blocks:
        payload["blocks"] = blocks
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                SLACK_API,
                json=payload,
                headers={"Authorization": f"Bearer {settings.slack_bot_token}"},
            )
            data = resp.json()
            if not data.get("ok"):
                log.error("Slack API error: %s", data.get("error"))
                return False
            return True
    except Exception as e:
        log.error("Slack send failed: %s", e)
        return False


async def alert_approval(
    business_name: str,
    title: str,
    action_type: str,
    risk_level: str,
    estimated_cost: str,
    forecast: str,
    approval_id: int,
) -> bool:
    """Send approval alert to #nexusos-alerts."""
    emoji = {"low": "🟢", "medium": "🟡", "high": "🔴", "critical": "🚨"}.get(risk_level, "🟡")
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{emoji} Action Required — {business_name}"}
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Action*\n{title}"},
                {"type": "mrkdwn", "text": f"*Type*\n{action_type.replace('_', ' ').title()}"},
                {"type": "mrkdwn", "text": f"*Risk*\n{risk_level.upper()}"},
                {"type": "mrkdwn", "text": f"*Cost*\n{estimated_cost}"},
            ]
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Forecast:* {forecast}"}
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"Approval ID #{approval_id} · Open NexusOS to approve or decline"}]
        }
    ]
    return await _post(settings.slack_channel_alerts, f"{emoji} {title} — {risk_level.upper()} RISK", blocks)


async def alert_execution(
    business_name: str,
    title: str,
    execution_status: str,
    result: dict,
) -> bool:
    """Send execution result to #nexusos-alerts."""
    emoji = {"success": "✅", "failed": "❌", "simulated": "🔵", "skipped": "⏭️"}.get(execution_status, "ℹ️")
    note = result.get("message") or result.get("error") or result.get("reason") or ""
    return await _post(
        settings.slack_channel_alerts,
        f"{emoji} *{title}* — {execution_status.upper()}\n{note}\n_{business_name}_"
    )


async def alert_flow_complete(business_name: str, pending_approvals: int, tasks_run: int) -> bool:
    """Send flow completion summary to #nexusos-alerts."""
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"⚡ AI Analysis Complete — {business_name}"}
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Tasks Run*\n{tasks_run}"},
                {"type": "mrkdwn", "text": f"*Pending Approvals*\n{'⚠️ ' + str(pending_approvals) if pending_approvals else '✅ None'}"},
            ]
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": "Open NexusOS → AI Tasks to review and approve"}]
        }
    ]
    return await _post(settings.slack_channel_alerts, f"⚡ AI flow complete — {pending_approvals} items need review", blocks)


async def send_daily_briefing(
    business_name: str,
    pending_approvals: int,
    summary: str,
    priority_actions: list[str],
    risks: list[str],
) -> bool:
    """Send daily AI briefing to #nexusos-daily-briefing."""
    from datetime import datetime
    date_str = datetime.utcnow().strftime("%B %d, %Y")

    actions_text = "\n".join(f"  {i+1}. {a}" for i, a in enumerate(priority_actions[:5])) if priority_actions else "  _No actions yet — run AI Analysis_"
    risks_text   = "\n".join(f"  ⚠️ {r}" for r in risks[:3]) if risks else "  _No risks flagged_"
    pending_text = f"⚠️ *{pending_approvals} items awaiting your decision*" if pending_approvals else "✅ No pending approvals"

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"🧠 Daily AI Briefing — {business_name}"}
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": date_str}]
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": pending_text}
        },
    ]
    if summary:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Summary*\n{summary}"}
        })
    blocks += [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Priority Actions*\n{actions_text}"}
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Watch*\n{risks_text}"}
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": "NexusOS · Autonomous Commerce Intelligence"}]
        }
    ]
    return await _post(settings.slack_channel_briefing, f"🧠 Daily Briefing — {business_name} — {date_str}", blocks)


async def alert_agent_error(business_name: str, agent_id: str, error: str) -> bool:
    """Send agent failure alert to #nexusos-alerts."""
    return await _post(
        settings.slack_channel_alerts,
        f"❌ *Agent failed* — `{agent_id}` in _{business_name}_\n```{error[:300]}```"
    )
