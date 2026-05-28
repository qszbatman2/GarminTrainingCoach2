from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


SERVER_NAME = "gold-buster-recorder"
SERVER_VERSION = "0.1.0"
DEFAULT_RECORDER_URL = "http://127.0.0.1:8765"

TOOL_SCHEMA = {
    "name": "record_turn",
    "description": (
        "Record one lightweight conversation turn for Gold-Buster. "
        "Only use this for local bookkeeping; never send the full hidden prompt or large tool output."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "session_id": {
                "type": "string",
                "description": "Conversation or workspace session id if available.",
            },
            "intent_hint": {
                "type": "string",
                "description": "A short 10-60 char hint describing the current requirement.",
            },
            "user_text": {
                "type": "string",
                "description": "Current user-visible input text for this turn.",
            },
            "assistant_text": {
                "type": "string",
                "description": "Current assistant-visible reply text for this turn.",
            },
            "active_files": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Up to 5 relevant file paths.",
            },
            "workspace": {
                "type": "string",
                "description": "Current workspace or project name.",
            },
            "source": {
                "type": "string",
                "description": "Caller tag such as trae-mcp.",
            },
        },
        "required": [],
        "additionalProperties": False,
    },
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m tools.gold_buster.mcp_server",
        description="Minimal MCP bridge for Gold-Buster turn recording.",
    )
    parser.add_argument("--recorder-url", default=DEFAULT_RECORDER_URL)
    parser.add_argument("--timeout-ms", type=int, default=400)
    return parser.parse_args(argv)


class MCPServer:
    def __init__(self, recorder_url: str, timeout_ms: int) -> None:
        self.recorder_url = recorder_url.rstrip("/")
        self.timeout_seconds = max(timeout_ms, 50) / 1000

    def run(self) -> int:
        while True:
            message = read_message()
            if message is None:
                return 0
            self.handle_message(message)

    def handle_message(self, message: dict[str, Any]) -> None:
        method = message.get("method")
        message_id = message.get("id")
        params = message.get("params") or {}

        if method == "initialize":
            if message_id is not None:
                send_response(
                    message_id,
                    {
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                        "capabilities": {"tools": {}},
                    },
                )
            return

        if method == "notifications/initialized":
            return

        if method == "ping":
            if message_id is not None:
                send_response(message_id, {})
            return

        if method == "tools/list":
            if message_id is not None:
                send_response(message_id, {"tools": [TOOL_SCHEMA]})
            return

        if method == "tools/call":
            if message_id is None:
                return
            tool_name = params.get("name")
            arguments = params.get("arguments") or {}
            if tool_name != "record_turn":
                send_error(message_id, -32601, f"Unsupported tool: {tool_name}")
                return
            result = self.handle_record_turn(arguments)
            send_response(
                message_id,
                {
                    "content": [{"type": "text", "text": result["text"]}],
                    "isError": result["is_error"],
                },
            )
            return

        if message_id is not None:
            send_error(message_id, -32601, f"Unsupported method: {method}")

    def handle_record_turn(self, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = sanitize_turn_payload(arguments)
        request = urllib.request.Request(
            f"{self.recorder_url}/record-turn",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
            if not body.get("ok"):
                return {"is_error": True, "text": compact_text(f"record_turn failed: {body}", 180)}
            return {
                "is_error": False,
                "text": compact_text(
                    f"recorded turn intent={payload.get('intent_hint', '')} path={body.get('path', '')}",
                    180,
                ),
            }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            return {
                "is_error": True,
                "text": compact_text(f"record_turn failed: {error}", 180),
            }


def sanitize_turn_payload(arguments: dict[str, Any]) -> dict[str, Any]:
    active_files = arguments.get("active_files") or []
    if not isinstance(active_files, list):
        active_files = []

    return {
        "session_id": compact_text(str(arguments.get("session_id") or ""), 100),
        "intent_hint": compact_text(str(arguments.get("intent_hint") or ""), 120),
        "user_text": compact_text(str(arguments.get("user_text") or ""), 6000),
        "assistant_text": compact_text(str(arguments.get("assistant_text") or ""), 8000),
        "active_files": [compact_text(str(item), 200) for item in active_files[:5] if str(item).strip()],
        "workspace": compact_text(str(arguments.get("workspace") or ""), 120),
        "source": compact_text(str(arguments.get("source") or "trae-mcp"), 40),
    }


def compact_text(value: str, limit: int) -> str:
    cleaned = " ".join(value.split())
    return cleaned[:limit]


def read_message() -> dict[str, Any] | None:
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        decoded = line.decode("utf-8", errors="replace").strip()
        if not decoded:
            break
        if ":" in decoded:
            name, value = decoded.split(":", 1)
            headers[name.strip().lower()] = value.strip()

    content_length = int(headers.get("content-length", "0"))
    if content_length <= 0:
        return None
    body = sys.stdin.buffer.read(content_length)
    return json.loads(body.decode("utf-8"))


def send_response(message_id: Any, result: dict[str, Any]) -> None:
    send_message({"jsonrpc": "2.0", "id": message_id, "result": result})


def send_error(message_id: Any, code: int, message: str) -> None:
    send_message(
        {
            "jsonrpc": "2.0",
            "id": message_id,
            "error": {"code": code, "message": message},
        }
    )


def send_message(payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8")
    sys.stdout.buffer.write(header)
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    server = MCPServer(recorder_url=args.recorder_url, timeout_ms=args.timeout_ms)
    return server.run()


if __name__ == "__main__":
    raise SystemExit(main())
