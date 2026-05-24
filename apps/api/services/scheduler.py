"""Autonomous scheduler — runs agents and flows on schedule without human trigger."""
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from ..database import AsyncSessionLocal
from ..models import Business

log = logging.getLogger("nexus.scheduler")
scheduler = AsyncIOScheduler(timezone="UTC")


def start(app=None):
    """Wire up all scheduled jobs and start the scheduler."""

    # Daily full AI analysis — 08:00 UTC every day
    scheduler.add_job(
        _run_all_flows,
        CronTrigger(hour=8, minute=0),
        id="daily_flow",
        name="Daily AI Analysis",
        replace_existing=True,
    )

    # Daily email digest — 08:30 UTC (after flow completes)
    scheduler.add_job(
        _send_daily_digests,
        CronTrigger(hour=8, minute=30),
        id="daily_digest",
        name="Daily Email Digest",
        replace_existing=True,
    )

    # CEO briefing refresh — every 6 hours
    scheduler.add_job(
        _refresh_all_briefings,
        IntervalTrigger(hours=6),
        id="briefing_refresh",
        name="CEO Briefing Refresh",
        replace_existing=True,
    )

    # System health check — every 30 minutes
    scheduler.add_job(
        _health_check,
        IntervalTrigger(minutes=30),
        id="health_check",
        name="System Health Check",
        replace_existing=True,
    )

    scheduler.start()
    log.info("Autonomous scheduler started — daily flow 08:00 UTC, digest 08:30 UTC, briefing every 6h, health every 30m")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        log.info("Scheduler stopped")


# ── Job implementations ───────────────────────────────────────────────────────

async def _run_all_flows():
    """Run full AI analysis for every active business."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Business))
        businesses = result.scalars().all()

    log.info("Scheduler: running daily flow for %d businesses", len(businesses))
    for biz in businesses:
        try:
            from ..routers.flow import _run_full_flow
            await _run_full_flow(biz.id, biz.name)
            log.info("Scheduler: flow complete for %s", biz.name)
        except Exception as e:
            log.error("Scheduler: flow failed for %s: %s", biz.name, e)


async def _refresh_all_briefings():
    """Refresh CEO briefing for every active business."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Business))
        businesses = result.scalars().all()

    for biz in businesses:
        try:
            from ..routers.tasks import _run_briefing
            await _run_briefing(biz.id, biz.name)
            log.info("Scheduler: briefing refreshed for %s", biz.name)
        except Exception as e:
            log.error("Scheduler: briefing failed for %s: %s", biz.name, e)


async def _health_check():
    """Check system health and reset any stuck agents."""
    from datetime import timedelta
    from sqlalchemy import update
    from ..models import Agent, Task

    async with AsyncSessionLocal() as db:
        # Reset agents stuck in "running" for > 10 minutes
        cutoff = datetime.utcnow() - timedelta(minutes=10)
        result = await db.execute(
            select(Agent).where(Agent.status == "running")
        )
        stuck = [a for a in result.scalars().all() if a.last_run and a.last_run < cutoff]
        for agent in stuck:
            agent.status = "idle"
            agent.load = 0
            log.warning("Health check: reset stuck agent %s", agent.agent_id)

        # Mark tasks running > 10 min as failed
        task_result = await db.execute(
            select(Task).where(Task.status == "running", Task.started_at < cutoff)
        )
        for task in task_result.scalars().all():
            task.status = "failed"
            task.error = "Timeout — reset by health check"
            log.warning("Health check: timed out task %d", task.id)

        await db.commit()
    log.debug("Health check complete at %s", datetime.utcnow().isoformat())


async def _send_daily_digests():
    """Send morning email digest for every active business."""
    from ..models import Task, Agent, Approval
    from .email import send_daily_digest

    async with AsyncSessionLocal() as db:
        businesses_r = await db.execute(select(Business))
        businesses = businesses_r.scalars().all()

    for biz in businesses:
        try:
            async with AsyncSessionLocal() as db:
                # Pending approvals count
                approvals_r = await db.execute(
                    select(Approval).where(Approval.business_id == biz.id, Approval.status == "pending")
                )
                pending_count = len(approvals_r.scalars().all())

                # Most recent briefing task result
                briefing_r = await db.execute(
                    select(Task)
                    .join(Agent, Task.agent_id == Agent.id)
                    .where(Agent.business_id == biz.id, Agent.agent_id == "ceo", Task.status == "completed")
                    .order_by(Task.completed_at.desc())
                    .limit(1)
                )
                briefing_task = briefing_r.scalar_one_or_none()
                briefing = briefing_task.result if briefing_task else {}

                # Recent tasks
                tasks_r = await db.execute(
                    select(Task, Agent)
                    .join(Agent, Task.agent_id == Agent.id)
                    .where(Agent.business_id == biz.id)
                    .order_by(Task.created_at.desc())
                    .limit(8)
                )
                recent = [
                    {"agent_name": a.name, "task": t.name, "status": t.status}
                    for t, a in tasks_r.all()
                ]

            sent = await send_daily_digest(biz.name, pending_count, briefing or {}, recent)
            if sent:
                log.info("Email digest sent for %s", biz.name)

            # Slack briefing
            try:
                from .slack import send_daily_briefing
                actions = (briefing or {}).get("actions", []) if briefing else []
                risks   = (briefing or {}).get("risks", []) if briefing else []
                summary = (briefing or {}).get("summary", "") if briefing else ""
                await send_daily_briefing(biz.name, pending_count, summary, actions, risks)
                log.info("Slack briefing sent for %s", biz.name)
            except Exception as _se:
                log.error("Slack briefing failed for %s: %s", biz.name, _se)

        except Exception as e:
            log.error("Digest failed for %s: %s", biz.name, e)
