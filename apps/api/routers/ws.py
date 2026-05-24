"""WebSocket hub — broadcast real-time events to all connected clients."""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Any

router = APIRouter(tags=["websocket"])

_connections: list[WebSocket] = []


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _connections.append(ws)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        _connections.remove(ws)


async def broadcast(data: dict[str, Any]):
    msg = json.dumps(data)
    dead = []
    for ws in _connections:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _connections:
            _connections.remove(ws)
