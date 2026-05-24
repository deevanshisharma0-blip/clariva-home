from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..agents.orchestrator import run_agent_task
from .ws import broadcast

router = APIRouter(prefix="/workflows", tags=["workflows"])

WORKFLOW_TEMPLATES = [
    {
        "id": "product-discovery",
        "name": "Product Discovery → Import",
        "description": "Research → Score → Supplier validate → Propose import",
        "status": "ready",
        "steps": [
            {"id": 1, "name": "Demand Scout",     "agent": "product_research", "status": "idle"},
            {"id": 2, "name": "Supplier Validate", "agent": "supplier",         "status": "idle"},
            {"id": 3, "name": "Score & Rank",      "agent": "analytics",        "status": "idle"},
            {"id": 4, "name": "Propose Import",    "agent": "ceo",              "status": "idle"},
        ],
        "trigger": "manual",
        "last_run": None,
        "runs": 0,
    },
    {
        "id": "creative-to-ad",
        "name": "Creative Generation → Ad Proposal",
        "description": "Hook writing → Image gen → Video gen → Campaign propose",
        "status": "ready",
        "steps": [
            {"id": 1, "name": "Write Hooks",       "agent": "content",      "status": "idle"},
            {"id": 2, "name": "Generate Images",   "agent": "image_gen",    "status": "idle"},
            {"id": 3, "name": "Generate Video",    "agent": "video_gen",    "status": "idle"},
            {"id": 4, "name": "Propose Campaign",  "agent": "marketing",    "status": "idle"},
        ],
        "trigger": "schedule:tue_fri_09",
        "last_run": None,
        "runs": 0,
    },
    {
        "id": "store-optimise",
        "name": "Store Optimisation Loop",
        "description": "Analytics review → UX improvements → Theme propose → Deploy",
        "status": "ready",
        "steps": [
            {"id": 1, "name": "Analytics Review",  "agent": "analytics",      "status": "idle"},
            {"id": 2, "name": "UX Recommendations","agent": "store_designer",  "status": "idle"},
            {"id": 3, "name": "Propose Theme",      "agent": "ceo",            "status": "idle"},
        ],
        "trigger": "schedule:weekly",
        "last_run": None,
        "runs": 0,
    },
    {
        "id": "daily-intelligence",
        "name": "Daily Intelligence Brief",
        "description": "Finance → Analytics → CEO summary → Alerts",
        "status": "ready",
        "steps": [
            {"id": 1, "name": "Finance Ledger",    "agent": "finance",    "status": "idle"},
            {"id": 2, "name": "KPI Digest",         "agent": "analytics",  "status": "idle"},
            {"id": 3, "name": "CEO Brief",          "agent": "ceo",        "status": "idle"},
            {"id": 4, "name": "Compliance Check",   "agent": "compliance", "status": "idle"},
        ],
        "trigger": "schedule:daily_03",
        "last_run": None,
        "runs": 0,
    },
    {
        "id": "fulfilment-monitor",
        "name": "Fulfilment Monitor",
        "description": "Order sync → CJ status check → Support alerts",
        "status": "ready",
        "steps": [
            {"id": 1, "name": "Sync Orders",        "agent": "supplier",         "status": "idle"},
            {"id": 2, "name": "Check Fulfilment",   "agent": "supplier",         "status": "idle"},
            {"id": 3, "name": "Customer Alerts",    "agent": "customer_support", "status": "idle"},
        ],
        "trigger": "schedule:hourly",
        "last_run": None,
        "runs": 0,
    },
]


@router.get("/{business_id}")
async def list_workflows(business_id: int):
    return WORKFLOW_TEMPLATES


@router.post("/{business_id}/{workflow_id}/trigger")
async def trigger_workflow(business_id: int, workflow_id: str, background_tasks: BackgroundTasks):
    wf = next((w for w in WORKFLOW_TEMPLATES if w["id"] == workflow_id), None)
    if not wf:
        from fastapi import HTTPException
        raise HTTPException(404, "Workflow not found")
    background_tasks.add_task(_run_workflow, business_id, wf)
    return {"status": "triggered", "workflow": wf["name"]}


async def _run_workflow(business_id: int, wf: dict):
    await broadcast({"event": "workflow.started", "workflow_id": wf["id"], "name": wf["name"]})
    for step in wf["steps"]:
        await broadcast({"event": "workflow.step", "step": step["name"], "agent": step["agent"]})
        await run_agent_task(step["agent"], step["name"], {"business_id": business_id, "workflow": wf["id"]})
    await broadcast({"event": "workflow.completed", "workflow_id": wf["id"], "name": wf["name"]})
