"""Run a target function in an instrumented subprocess and return the call trace."""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

TRACE_SCRIPT = Path(__file__).parent / "trace_script.py"


async def trace_function(
    project_path: str,
    module_file: str,   # relative path inside project, e.g. "app/service.py"
    function_name: str,
    args: list = None,
) -> dict:
    args = args or []
    abs_module = str(Path(project_path) / module_file)

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        output_path = tmp.name

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            str(TRACE_SCRIPT),
            abs_module,
            function_name,
            output_path,
            json.dumps(args),
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

        trace_data = []
        if Path(output_path).exists():
            with open(output_path) as f:
                trace_data = json.load(f)

        # Normalize timestamps relative to first call
        if trace_data:
            t0 = next((e["timestamp"] for e in trace_data if "timestamp" in e), 0)
            for e in trace_data:
                if "timestamp" in e:
                    e["elapsed_ms"] = round((e["timestamp"] - t0) * 1000, 2)
                    del e["timestamp"]

        return {
            "ok": proc.returncode == 0,
            "trace": trace_data,
            "stderr": stderr.decode(errors="ignore")[:2000] if stderr else "",
        }
    except asyncio.TimeoutError:
        return {"ok": False, "trace": [], "stderr": "Trace timed out after 30s"}
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass
