"""
Injected into a subprocess to record function call order via sys.settrace.
Usage:
    python trace_script.py <module_path> <function_name> <output_json> [args_json]
"""
import sys
import json
import importlib.util
import time
import os

call_stack: list[dict] = []
_depth = 0


def tracer(frame, event, arg):
    global _depth
    if event == "call":
        _depth += 1
        call_stack.append({
            "depth": _depth,
            "event": "call",
            "function": frame.f_code.co_name,
            "module": frame.f_globals.get("__name__", "?"),
            "file": frame.f_code.co_filename,
            "line": frame.f_lineno,
            "timestamp": time.monotonic(),
        })
    elif event == "return":
        call_stack.append({
            "depth": _depth,
            "event": "return",
            "function": frame.f_code.co_name,
            "module": frame.f_globals.get("__name__", "?"),
            "line": frame.f_lineno,
            "timestamp": time.monotonic(),
        })
        _depth = max(0, _depth - 1)
    return tracer


if __name__ == "__main__":
    module_path = sys.argv[1]   # absolute path to .py file
    func_name   = sys.argv[2]
    output_json = sys.argv[3]
    args_json   = sys.argv[4] if len(sys.argv) > 4 else "[]"

    func_args = json.loads(args_json)

    spec = importlib.util.spec_from_file_location("_traced_module", module_path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    func = getattr(mod, func_name)

    sys.settrace(tracer)
    try:
        func(*func_args)
    except Exception as exc:
        call_stack.append({"event": "error", "message": str(exc)})
    finally:
        sys.settrace(None)

    with open(output_json, "w") as f:
        json.dump(call_stack, f, indent=2)
