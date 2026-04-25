"""open_ui MCP tool — launches the web UI server in a background process."""
import asyncio
import os
import subprocess
import sys
from pathlib import Path

from ..config import UI_HOST, UI_PORT

_ui_proc: subprocess.Popen | None = None


async def open_ui(project_path: str = None) -> dict:
    global _ui_proc

    server_script = Path(__file__).parent.parent.parent / "web_ui" / "server.py"

    env = os.environ.copy()
    if project_path:
        env["MENTAL_MODEL_PROJECT"] = str(Path(project_path).resolve())

    if _ui_proc and _ui_proc.poll() is None:
        return {
            "ok": True,
            "url": f"http://{UI_HOST}:{UI_PORT}",
            "message": "UI already running",
        }

    _ui_proc = subprocess.Popen(
        [sys.executable, str(server_script)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    await asyncio.sleep(1.5)

    if _ui_proc.poll() is not None:
        return {"ok": False, "error": "UI server failed to start"}

    return {
        "ok": True,
        "url": f"http://{UI_HOST}:{UI_PORT}",
        "message": f"Mental Model UI is running. Open http://{UI_HOST}:{UI_PORT} in your browser.",
    }
