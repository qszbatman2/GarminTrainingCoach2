from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from . import cli as legacy_cli


LEDGER_SUBDIR = "gold_buster"
TURN_LEDGER_NAME = "turns.jsonl"
COMMIT_LEDGER_NAME = "commits.jsonl"
REQUIREMENTS_SNAPSHOT_NAME = "requirements_snapshot.json"
AUDIT_CACHE_NAME = "audit_cache.json"
REPORT_FILE_PREFIX = "weekly_report"
MAX_CLUSTER_GAP_HOURS = 6

UI_KEYWORDS = (
    "样式",
    "布局",
    "动画",
    "hover",
    "交互",
    "视觉",
    "ui",
    "css",
    "美化",
    "前端",
    "首屏",
)
REFACTOR_KEYWORDS = ("重构", "抽象", "封装", "优化结构", "整理代码", "可扩展", "架构")
CORE_KEYWORDS = ("api", "route", "schema", "sync", "训练", "分析", "cron", "auth", "数据", "规则")
BUGFIX_KEYWORDS = ("fix", "bug", "修复", "报错", "异常", "崩溃", "失败", "构建")
UI_FILE_HINTS = ("component", ".css", ".scss", ".less", "page.tsx", "page.jsx")
CORE_FILE_HINTS = ("api/", "lib/", "prisma/", "route.ts", "sync", "analysis", "schema")
GENERIC_TITLE_RE = re.compile(r"^(trae task|需求|task)\b", re.IGNORECASE)


@dataclass
class TurnEvent:
    timestamp: str
    session_id: str
    workspace: str
    intent_hint: str
    active_files: list[str]
    user_text_hash: str
    assistant_text_hash: str
    user_chars: int
    assistant_chars: int
    estimated_prompt_tokens: int
    estimated_completion_tokens: int
    estimated_total_tokens: int
    source: str = "manual"

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": "turn",
            "timestamp": self.timestamp,
            "session_id": self.session_id,
            "workspace": self.workspace,
            "intent_hint": self.intent_hint,
            "active_files": self.active_files,
            "user_text_hash": self.user_text_hash,
            "assistant_text_hash": self.assistant_text_hash,
            "user_chars": self.user_chars,
            "assistant_chars": self.assistant_chars,
            "estimated_prompt_tokens": self.estimated_prompt_tokens,
            "estimated_completion_tokens": self.estimated_completion_tokens,
            "estimated_total_tokens": self.estimated_total_tokens,
            "source": self.source,
        }


@dataclass
class CommitEvent:
    timestamp: str
    commit_sha: str
    message: str
    changed_files: list[str]
    insertions: int
    deletions: int
    source: str = "manual"

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": "commit",
            "timestamp": self.timestamp,
            "commit_sha": self.commit_sha,
            "message": self.message,
            "changed_files": self.changed_files,
            "insertions": self.insertions,
            "deletions": self.deletions,
            "source": self.source,
        }


@dataclass
class RequirementCluster:
    requirement_id: str
    title: str
    start_at: dt.datetime
    end_at: dt.datetime
    turn_count: int = 0
    commit_count: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    insertions: int = 0
    deletions: int = 0
    session_ids: set[str] = field(default_factory=set)
    files: set[str] = field(default_factory=set)
    hints: list[str] = field(default_factory=list)
    commit_messages: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    risk_score: float = 0.0
    heuristic_label: str = "core_goal"
    heuristic_reason: str = ""
    final_label: str = "core_goal"
    final_reason: str = ""
    final_source: str = "heuristic"
    content_hash: str = ""

    def absorb_turn(self, event: TurnEvent) -> None:
        event_time = parse_iso_time(event.timestamp)
        self.start_at = min(self.start_at, event_time)
        self.end_at = max(self.end_at, event_time)
        self.turn_count += 1
        self.prompt_tokens += event.estimated_prompt_tokens
        self.completion_tokens += event.estimated_completion_tokens
        self.total_tokens += event.estimated_total_tokens
        self.files.update(filter(None, event.active_files))
        if event.session_id:
            self.session_ids.add(event.session_id)
        if event.intent_hint:
            self.hints.append(event.intent_hint)
        if event.source:
            self.sources.append(event.source)
        if should_replace_title(self.title, event.intent_hint):
            self.title = event.intent_hint

    def absorb_commit(self, event: CommitEvent) -> None:
        event_time = parse_iso_time(event.timestamp)
        self.start_at = min(self.start_at, event_time)
        self.end_at = max(self.end_at, event_time)
        self.commit_count += 1
        self.insertions += event.insertions
        self.deletions += event.deletions
        self.files.update(filter(None, event.changed_files))
        if event.message:
            self.commit_messages.append(event.message)
        if event.source:
            self.sources.append(event.source)
        if should_replace_title(self.title, event.message):
            self.title = event.message

    def to_dict(self) -> dict[str, Any]:
        return {
            "requirement_id": self.requirement_id,
            "title": self.title,
            "start_at": self.start_at.isoformat(timespec="seconds"),
            "end_at": self.end_at.isoformat(timespec="seconds"),
            "turn_count": self.turn_count,
            "commit_count": self.commit_count,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "insertions": self.insertions,
            "deletions": self.deletions,
            "session_ids": sorted(self.session_ids),
            "files": sorted(self.files),
            "hints": dedupe_preserve_order(self.hints)[:8],
            "commit_messages": dedupe_preserve_order(self.commit_messages)[:8],
            "risk_score": round(self.risk_score, 2),
            "heuristic_label": self.heuristic_label,
            "heuristic_reason": self.heuristic_reason,
            "final_label": self.final_label,
            "final_reason": self.final_reason,
            "final_source": self.final_source,
            "content_hash": self.content_hash,
        }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m tools.gold_buster",
        description="Low-cost gold-plating recorder and weekly auditor.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    probe = subparsers.add_parser("probe", help="Inspect legacy local Trae memory sources.")
    probe.add_argument("--project", default=legacy_cli.DEFAULT_PROJECT_HINT, help="Project name hint.")
    probe.add_argument("--memory-root", type=Path, default=legacy_cli.PROJECT_MEMORY_ROOT)

    audit = subparsers.add_parser("audit", help="Legacy memory-only backfill audit.")
    audit.add_argument("--project", default=legacy_cli.DEFAULT_PROJECT_HINT, help="Project name hint.")
    audit.add_argument("--memory-root", type=Path, default=legacy_cli.PROJECT_MEMORY_ROOT)
    audit.add_argument("--days", type=int, default=7, help="Lookback window.")
    audit.add_argument("--refresh", action="store_true", help="Ignore cached AI audit results.")
    audit.add_argument("--no-ai", action="store_true", help="Skip external model calls.")
    audit.add_argument("--limit", type=int, default=0, help="Optional max task count.")
    audit.add_argument("--out-dir", type=Path, default=legacy_cli.REPORTS_DIR)

    record_turn = subparsers.add_parser("record-turn", help="Append a lightweight turn event to local ledger.")
    record_turn.add_argument("--session-id", default="", help="Conversation session id if available.")
    record_turn.add_argument("--workspace", default=legacy_cli.DEFAULT_PROJECT_HINT)
    record_turn.add_argument("--intent-hint", default="", help="Short task hint for this turn.")
    record_turn.add_argument("--user-text", default="", help="User text for local token estimation.")
    record_turn.add_argument("--assistant-text", default="", help="Assistant text for local token estimation.")
    record_turn.add_argument("--user-chars", type=int, default=-1, help="User char count if raw text is omitted.")
    record_turn.add_argument(
        "--assistant-chars", type=int, default=-1, help="Assistant char count if raw text is omitted."
    )
    record_turn.add_argument("--prompt-tokens", type=int, default=-1, help="Known prompt token count if available.")
    record_turn.add_argument(
        "--completion-tokens", type=int, default=-1, help="Known completion token count if available."
    )
    record_turn.add_argument("--active-file", action="append", default=[], help="Relevant file path.")
    record_turn.add_argument("--timestamp", default="", help="ISO timestamp override.")
    record_turn.add_argument("--source", default="manual", help="Event source tag.")
    record_turn.add_argument("--out-dir", type=Path, default=legacy_cli.REPORTS_DIR)

    record_commit = subparsers.add_parser("record-commit", help="Append a commit event to local ledger.")
    record_commit.add_argument("--commit-sha", default="", help="Commit sha; defaults to HEAD.")
    record_commit.add_argument("--message", default="", help="Commit message; defaults to HEAD message.")
    record_commit.add_argument("--changed-file", action="append", default=[], help="Changed file path.")
    record_commit.add_argument("--insertions", type=int, default=-1)
    record_commit.add_argument("--deletions", type=int, default=-1)
    record_commit.add_argument("--timestamp", default="", help="ISO timestamp override.")
    record_commit.add_argument("--source", default="manual", help="Event source tag.")
    record_commit.add_argument("--from-hook", action="store_true", help="Called from post-commit hook.")
    record_commit.add_argument("--out-dir", type=Path, default=legacy_cli.REPORTS_DIR)

    install_hooks = subparsers.add_parser("install-hooks", help="Install local post-commit hook.")
    install_hooks.add_argument("--python-command", default="python", help="Python executable used by hook.")

    report = subparsers.add_parser("report", help="Generate low-cost weekly report from local ledgers.")
    report.add_argument("--days", type=int, default=7, help="Lookback window.")
    report.add_argument("--no-ai", action="store_true", help="Skip model auditing and use heuristics only.")
    report.add_argument("--refresh", action="store_true", help="Ignore cached AI audit results.")
    report.add_argument("--max-ai-audits", type=int, default=5, help="Max suspicious requirements sent to AI.")
    report.add_argument("--min-risk", type=float, default=6.0, help="Suspicious score threshold.")
    report.add_argument("--out-dir", type=Path, default=legacy_cli.REPORTS_DIR)

    serve = subparsers.add_parser("serve-recorder", help="Run lightweight local recorder service.")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--out-dir", type=Path, default=legacy_cli.REPORTS_DIR)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    legacy_cli.load_local_env()
    args = parse_args(argv or sys.argv[1:])

    if args.command == "probe":
        return legacy_cli.run_probe(args)
    if args.command == "audit":
        return legacy_cli.run_audit(args)
    if args.command == "record-turn":
        return run_record_turn(args)
    if args.command == "record-commit":
        return run_record_commit(args)
    if args.command == "install-hooks":
        return run_install_hooks(args)
    if args.command == "report":
        return run_report(args)
    if args.command == "serve-recorder":
        return run_recorder_service(args)
    return 1


def run_record_turn(args: argparse.Namespace) -> int:
    event = build_turn_event(
        session_id=args.session_id,
        workspace=args.workspace,
        intent_hint=args.intent_hint,
        user_text=args.user_text,
        assistant_text=args.assistant_text,
        user_chars=args.user_chars,
        assistant_chars=args.assistant_chars,
        prompt_tokens=args.prompt_tokens,
        completion_tokens=args.completion_tokens,
        active_files=args.active_file,
        timestamp=args.timestamp,
        source=args.source,
    )
    ledger_paths = get_ledger_paths(args.out_dir)
    append_jsonl(ledger_paths["turns"], event.to_dict())
    print(f"Turn recorded: {ledger_paths['turns']}")
    return 0


def run_record_commit(args: argparse.Namespace) -> int:
    try:
        event = build_commit_event(
            commit_sha=args.commit_sha,
            message=args.message,
            changed_files=args.changed_file,
            insertions=args.insertions,
            deletions=args.deletions,
            timestamp=args.timestamp,
            source="git-hook" if args.from_hook else args.source,
        )
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    ledger_paths = get_ledger_paths(args.out_dir)
    append_jsonl(ledger_paths["commits"], event.to_dict())
    if not args.from_hook:
        print(f"Commit recorded: {ledger_paths['commits']}")
    return 0


def run_install_hooks(args: argparse.Namespace) -> int:
    repo_root = get_git_root()
    if repo_root is None:
        print("Git repository not found. Run this command inside the repo.", file=sys.stderr)
        return 1

    hooks_dir = repo_root / ".git" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_path = hooks_dir / "post-commit"
    hook_body = (
        "#!/bin/sh\n"
        "ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null)\" || exit 0\n"
        "cd \"$ROOT\" || exit 0\n"
        f"PYTHON_BIN=\"${{GOLD_BUSTER_PYTHON:-{args.python_command}}}\"\n"
        "\"$PYTHON_BIN\" -m tools.gold_buster record-commit --from-hook >/dev/null 2>&1 || exit 0\n"
    )
    hook_path.write_text(hook_body, encoding="utf-8")
    make_executable(hook_path)
    print(f"Hook installed: {hook_path}")
    return 0


def run_report(args: argparse.Namespace) -> int:
    ledger_paths = get_ledger_paths(args.out_dir)
    since = dt.datetime.now() - dt.timedelta(days=args.days)
    turn_events = load_turn_events(ledger_paths["turns"], since)
    commit_events = load_commit_events(ledger_paths["commits"], since)

    if not turn_events and not commit_events:
        print("No ledger events found in the selected period.", file=sys.stderr)
        return 1

    requirements = aggregate_requirements(turn_events, commit_events)
    scored_requirements = [score_requirement(requirement) for requirement in requirements]

    provider = legacy_cli.get_model_provider()
    audit_enabled = not args.no_ai and bool(provider["api_key"])
    audit_cache = legacy_cli.load_history(ledger_paths["audit_cache"])
    audited_requirements = apply_audits(
        scored_requirements,
        audit_cache=audit_cache,
        audit_enabled=audit_enabled,
        refresh=args.refresh,
        max_ai_audits=args.max_ai_audits,
        min_risk=args.min_risk,
    )

    legacy_cli.save_history(ledger_paths["audit_cache"], audit_cache)
    save_json(ledger_paths["requirements_snapshot"], [item.to_dict() for item in audited_requirements])
    report_text = render_requirement_report(audited_requirements, args.days, audit_enabled, provider["name"])
    report_path = ledger_paths["report_dir"] / f"{REPORT_FILE_PREFIX}_{dt.date.today().isoformat()}.md"
    report_path.write_text(report_text, encoding="utf-8")
    print(report_text)
    print()
    print(f"Report written: {report_path}")
    return 0


def run_recorder_service(args: argparse.Namespace) -> int:
    ledger_paths = get_ledger_paths(args.out_dir)
    server = ThreadingHTTPServer((args.host, args.port), build_handler(ledger_paths))
    print(f"Recorder listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nRecorder stopped.")
    finally:
        server.server_close()
    return 0


def build_handler(ledger_paths: dict[str, Path]) -> type[BaseHTTPRequestHandler]:
    class RecorderHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._json_response({"ok": True})
                return
            self._json_response({"ok": False, "error": "Not found"}, status=404)

        def do_POST(self) -> None:  # noqa: N802
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._json_response({"ok": False, "error": "Invalid JSON"}, status=400)
                return

            try:
                if self.path == "/record-turn":
                    event = build_turn_event_from_payload(payload)
                    append_jsonl(ledger_paths["turns"], event.to_dict())
                    self._json_response({"ok": True, "path": str(ledger_paths["turns"])})
                    return
                if self.path == "/record-commit":
                    event = build_commit_event_from_payload(payload)
                    append_jsonl(ledger_paths["commits"], event.to_dict())
                    self._json_response({"ok": True, "path": str(ledger_paths["commits"])})
                    return
            except RuntimeError as error:
                self._json_response({"ok": False, "error": str(error)}, status=400)
                return

            self._json_response({"ok": False, "error": "Not found"}, status=404)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            return

        def _json_response(self, payload: dict[str, Any], status: int = 200) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return RecorderHandler


def build_turn_event_from_payload(payload: dict[str, Any]) -> TurnEvent:
    active_files = payload.get("active_files") or payload.get("activeFiles") or []
    return build_turn_event(
        session_id=str(payload.get("session_id") or payload.get("sessionId") or ""),
        workspace=str(payload.get("workspace") or legacy_cli.DEFAULT_PROJECT_HINT),
        intent_hint=str(payload.get("intent_hint") or payload.get("intentHint") or ""),
        user_text=str(payload.get("user_text") or payload.get("userText") or ""),
        assistant_text=str(payload.get("assistant_text") or payload.get("assistantText") or ""),
        user_chars=int(payload.get("user_chars") or payload.get("userChars") or -1),
        assistant_chars=int(payload.get("assistant_chars") or payload.get("assistantChars") or -1),
        prompt_tokens=int(payload.get("prompt_tokens") or payload.get("promptTokens") or -1),
        completion_tokens=int(payload.get("completion_tokens") or payload.get("completionTokens") or -1),
        active_files=[str(item) for item in active_files],
        timestamp=str(payload.get("timestamp") or ""),
        source=str(payload.get("source") or "mcp-recorder"),
    )


def build_commit_event_from_payload(payload: dict[str, Any]) -> CommitEvent:
    changed_files = payload.get("changed_files") or payload.get("changedFiles") or []
    return build_commit_event(
        commit_sha=str(payload.get("commit_sha") or payload.get("commitSha") or ""),
        message=str(payload.get("message") or ""),
        changed_files=[str(item) for item in changed_files],
        insertions=int(payload.get("insertions") or -1),
        deletions=int(payload.get("deletions") or -1),
        timestamp=str(payload.get("timestamp") or ""),
        source=str(payload.get("source") or "mcp-recorder"),
    )


def build_turn_event(
    *,
    session_id: str,
    workspace: str,
    intent_hint: str,
    user_text: str,
    assistant_text: str,
    user_chars: int,
    assistant_chars: int,
    prompt_tokens: int,
    completion_tokens: int,
    active_files: list[str],
    timestamp: str,
    source: str,
) -> TurnEvent:
    if user_chars < 0:
        user_chars = len(user_text)
    if assistant_chars < 0:
        assistant_chars = len(assistant_text)
    if prompt_tokens < 0:
        prompt_tokens = legacy_cli.estimate_tokens(user_text) if user_text else estimate_tokens_from_chars(user_chars)
    if completion_tokens < 0:
        completion_tokens = (
            legacy_cli.estimate_tokens(assistant_text)
            if assistant_text
            else estimate_tokens_from_chars(assistant_chars)
        )
    total_tokens = max(0, prompt_tokens) + max(0, completion_tokens)
    return TurnEvent(
        timestamp=timestamp or now_iso(),
        session_id=session_id,
        workspace=workspace,
        intent_hint=compact_text(intent_hint, 120),
        active_files=normalize_files(active_files),
        user_text_hash=legacy_cli.hash_text(user_text) if user_text else "",
        assistant_text_hash=legacy_cli.hash_text(assistant_text) if assistant_text else "",
        user_chars=max(0, user_chars),
        assistant_chars=max(0, assistant_chars),
        estimated_prompt_tokens=max(0, prompt_tokens),
        estimated_completion_tokens=max(0, completion_tokens),
        estimated_total_tokens=total_tokens,
        source=source,
    )


def build_commit_event(
    *,
    commit_sha: str,
    message: str,
    changed_files: list[str],
    insertions: int,
    deletions: int,
    timestamp: str,
    source: str,
) -> CommitEvent:
    if not commit_sha:
        commit_sha = git_output(["rev-parse", "HEAD"])
    if not message:
        message = git_output(["log", "-1", "--pretty=%s"])
    if not changed_files or insertions < 0 or deletions < 0:
        stats = get_head_commit_stats()
        if not changed_files:
            changed_files = stats["changed_files"]
        if insertions < 0:
            insertions = stats["insertions"]
        if deletions < 0:
            deletions = stats["deletions"]
    commit_time = timestamp or git_output(["log", "-1", "--date=iso-strict", "--pretty=%cd"])
    return CommitEvent(
        timestamp=commit_time or now_iso(),
        commit_sha=commit_sha,
        message=compact_text(message, 160),
        changed_files=normalize_files(changed_files),
        insertions=max(0, insertions),
        deletions=max(0, deletions),
        source=source,
    )


def get_head_commit_stats() -> dict[str, Any]:
    try:
        output = subprocess.run(
            ["git", "show", "--numstat", "--format=", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        ).stdout
    except subprocess.CalledProcessError as error:
        raise RuntimeError("Unable to inspect HEAD commit.") from error

    changed_files: list[str] = []
    insertions = 0
    deletions = 0
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        ins, dele, file_path = parts
        changed_files.append(file_path)
        if ins.isdigit():
            insertions += int(ins)
        if dele.isdigit():
            deletions += int(dele)
    return {
        "changed_files": changed_files,
        "insertions": insertions,
        "deletions": deletions,
    }


def aggregate_requirements(turn_events: list[TurnEvent], commit_events: list[CommitEvent]) -> list[RequirementCluster]:
    timeline: list[dict[str, Any]] = []
    for event in turn_events:
        timeline.append({"kind": "turn", "time": parse_iso_time(event.timestamp), "payload": event})
    for event in commit_events:
        timeline.append({"kind": "commit", "time": parse_iso_time(event.timestamp), "payload": event})
    timeline.sort(key=lambda item: item["time"])

    requirements: list[RequirementCluster] = []
    for item in timeline:
        cluster = find_best_cluster(requirements, item["payload"], item["kind"], item["time"])
        if cluster is None:
            cluster = create_cluster(item["payload"], item["kind"], item["time"])
            requirements.append(cluster)
        else:
            if item["kind"] == "turn":
                cluster.absorb_turn(item["payload"])
            else:
                cluster.absorb_commit(item["payload"])
    requirements.sort(key=lambda item: item.end_at, reverse=True)
    return requirements


def find_best_cluster(
    requirements: list[RequirementCluster], event: TurnEvent | CommitEvent, kind: str, event_time: dt.datetime
) -> RequirementCluster | None:
    best_cluster: RequirementCluster | None = None
    best_score = 0.0
    for cluster in requirements[-8:]:
        gap_hours = abs((event_time - cluster.end_at).total_seconds()) / 3600
        session_match = False
        if kind == "turn" and isinstance(event, TurnEvent) and event.session_id:
            session_match = event.session_id in cluster.session_ids
        if gap_hours > MAX_CLUSTER_GAP_HOURS and not session_match:
            continue

        event_files = set(event.active_files if kind == "turn" else event.changed_files)
        file_overlap = jaccard_similarity(event_files, cluster.files)
        text_signal = extract_keywords(event.intent_hint if kind == "turn" else event.message)
        cluster_signal = extract_keywords(" ".join([cluster.title] + cluster.hints + cluster.commit_messages))
        text_overlap = jaccard_similarity(text_signal, cluster_signal)

        score = 0.0
        if session_match:
            score += 4.0
        score += file_overlap * 4.0
        score += text_overlap * 3.0
        if gap_hours <= 1:
            score += 1.0
        if kind == "commit" and cluster.commit_count == 0 and file_overlap > 0:
            score += 0.8

        if score > best_score and score >= 1.5:
            best_score = score
            best_cluster = cluster
    return best_cluster


def create_cluster(
    event: TurnEvent | CommitEvent, kind: str, event_time: dt.datetime
) -> RequirementCluster:
    title = event.intent_hint if kind == "turn" else event.message
    cluster = RequirementCluster(
        requirement_id=hashlib.md5(f"{kind}:{event_time.isoformat()}:{title}".encode("utf-8")).hexdigest(),
        title=compact_text(title or "未命名需求", 80),
        start_at=event_time,
        end_at=event_time,
    )
    if kind == "turn":
        cluster.absorb_turn(event)  # type: ignore[arg-type]
    else:
        cluster.absorb_commit(event)  # type: ignore[arg-type]
    return cluster


def score_requirement(requirement: RequirementCluster) -> RequirementCluster:
    corpus = " ".join(
        [requirement.title]
        + requirement.hints
        + requirement.commit_messages
        + list(requirement.files)
    ).lower()

    ui_hits = keyword_hits(corpus, UI_KEYWORDS)
    refactor_hits = keyword_hits(corpus, REFACTOR_KEYWORDS)
    core_hits = keyword_hits(corpus, CORE_KEYWORDS)
    bugfix_hits = keyword_hits(corpus, BUGFIX_KEYWORDS)
    ui_file_hits = sum(1 for file_path in requirement.files if any(hint in file_path.lower() for hint in UI_FILE_HINTS))
    core_file_hits = sum(
        1 for file_path in requirement.files if any(hint in file_path.lower() for hint in CORE_FILE_HINTS)
    )
    output_gap = max(requirement.turn_count - requirement.commit_count, 0)

    risk_score = (
        requirement.total_tokens / 1200
        + requirement.turn_count * 0.8
        + output_gap * 0.4
        + ui_hits * 1.2
        + refactor_hits * 1.1
        + ui_file_hits * 0.7
        - core_hits * 1.4
        - bugfix_hits * 1.2
        - core_file_hits * 0.8
        - min(requirement.commit_count, 5) * 0.3
    )
    if requirement.commit_count == 0 and requirement.turn_count >= 3:
        risk_score += 2.0

    if risk_score >= 6:
        heuristic_label = "gold_plating"
        heuristic_reason = build_gold_reason(
            requirement=requirement,
            ui_hits=ui_hits,
            refactor_hits=refactor_hits,
            output_gap=output_gap,
        )
    else:
        heuristic_label = "core_goal"
        heuristic_reason = build_core_reason(
            requirement=requirement,
            core_hits=core_hits,
            bugfix_hits=bugfix_hits,
            core_file_hits=core_file_hits,
        )

    requirement.risk_score = round(risk_score, 2)
    requirement.heuristic_label = heuristic_label
    requirement.heuristic_reason = heuristic_reason
    requirement.final_label = heuristic_label
    requirement.final_reason = heuristic_reason
    requirement.final_source = "heuristic"
    requirement.content_hash = legacy_cli.hash_text(build_requirement_summary(requirement))
    return requirement


def apply_audits(
    requirements: list[RequirementCluster],
    *,
    audit_cache: dict[str, Any],
    audit_enabled: bool,
    refresh: bool,
    max_ai_audits: int,
    min_risk: float,
) -> list[RequirementCluster]:
    suspicious = [
        item
        for item in requirements
        if item.risk_score >= min_risk or item.heuristic_label == "gold_plating"
    ]
    suspicious.sort(key=lambda item: (item.risk_score, item.total_tokens), reverse=True)
    suspicious = suspicious[: max(0, max_ai_audits)]

    suspicious_ids = {item.requirement_id for item in suspicious}
    for requirement in requirements:
        cached = audit_cache.get(requirement.content_hash)
        if requirement.requirement_id not in suspicious_ids or not audit_enabled:
            if cached and not refresh and cached.get("final_label"):
                requirement.final_label = cached.get("final_label", requirement.final_label)
                requirement.final_reason = cached.get("final_reason", requirement.final_reason)
                requirement.final_source = cached.get("final_source", requirement.final_source)
            continue

        if cached and not refresh and cached.get("final_label"):
            requirement.final_label = cached.get("final_label", requirement.final_label)
            requirement.final_reason = cached.get("final_reason", requirement.final_reason)
            requirement.final_source = cached.get("final_source", requirement.final_source)
            continue

        audit_result = call_model_for_requirement(requirement)
        requirement.final_label = audit_result["final_label"]
        requirement.final_reason = audit_result["final_reason"]
        requirement.final_source = audit_result["final_source"]
        audit_cache[requirement.content_hash] = audit_result
    return requirements


def call_model_for_requirement(requirement: RequirementCluster) -> dict[str, Any]:
    provider = legacy_cli.get_model_provider()
    payload = {
        "model": provider["model"],
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": "Return strict JSON only. No markdown."},
            {"role": "user", "content": build_requirement_audit_prompt(requirement)},
        ],
    }
    request = urllib.request.Request(
        provider["api_url"],
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {provider['api_key']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(legacy_cli.strip_json_fence(content))
        is_gold = bool(parsed.get("is_gold_plating"))
        reason = str(parsed.get("reason") or requirement.heuristic_reason)
        return {
            "final_label": "gold_plating" if is_gold else "core_goal",
            "final_reason": compact_text(reason, 180),
            "final_source": "ai",
        }
    except (urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError) as error:
        return {
            "final_label": requirement.heuristic_label,
            "final_reason": compact_text(
                f"AI 审计失败，已回退到启发式判断：{requirement.heuristic_reason}（{error}）",
                180,
            ),
            "final_source": "heuristic_fallback",
        }


def build_requirement_audit_prompt(requirement: RequirementCluster) -> str:
    return f"""你是一位极其严苛的敏捷项目管理专家与架构师。
请审计下面这个按周期聚合出的研发需求摘要，判断它是否属于镀金需求。

判定标准：
- 核心目标：业务闭环、MVP 必需、用户可感知价值、硬性 Bug 修复、上线阻断问题。
- 镀金需求：边缘 UI 动画、过度抽象、未验证的扩展性、低频场景优化、为了“看起来专业”的复杂化。

需求摘要：
{build_requirement_summary(requirement)}

当前启发式判断：{requirement.heuristic_label}
当前启发式原因：{requirement.heuristic_reason}

只返回 JSON，不要 Markdown：
{{
  "is_gold_plating": true,
  "reason": "一句话一针见血，指出它为何是核心需求或镀金需求。"
}}
"""


def build_requirement_summary(requirement: RequirementCluster) -> str:
    summary = {
        "title": requirement.title,
        "turn_count": requirement.turn_count,
        "commit_count": requirement.commit_count,
        "total_tokens": requirement.total_tokens,
        "insertions": requirement.insertions,
        "deletions": requirement.deletions,
        "files": sorted(requirement.files)[:10],
        "intent_hints": dedupe_preserve_order(requirement.hints)[:6],
        "commit_messages": dedupe_preserve_order(requirement.commit_messages)[:6],
        "sessions": sorted(requirement.session_ids)[:4],
    }
    return json.dumps(summary, ensure_ascii=False, indent=2)


def render_requirement_report(
    requirements: list[RequirementCluster], days: int, audit_enabled: bool, provider_name: str
) -> str:
    total_tokens = sum(item.total_tokens for item in requirements)
    gold_tokens = sum(item.total_tokens for item in requirements if item.final_label == "gold_plating")
    gold_percent = (gold_tokens / total_tokens * 100) if total_tokens else 0
    mode = f"启发式 + AI 审计（{provider_name}）" if audit_enabled else "启发式本地审计"
    lines = [
        "# Project Gold-Buster 周报",
        "",
        f"- 周期：最近 {days} 天",
        f"- 模式：{mode}",
        f"- 需求数：{len(requirements)}",
        f"- 总 Token：{total_tokens}",
        f"- 镀金 Token：{gold_tokens}",
        f"- 镀金浪费占比：{gold_percent:.1f}%",
        "",
        "| 需求 | 提交 | 对话 | 估算 Token | 风险分 | 分类 | 点评 |",
        "|---|---:|---:|---:|---:|---|---|",
    ]
    for requirement in requirements:
        lines.append(
            "| {title} | {commit_count} | {turn_count} | {total_tokens} | {risk_score:.1f} | {label} | {reason} |".format(
                title=escape_md_table(compact_text(requirement.title, 48)),
                commit_count=requirement.commit_count,
                turn_count=requirement.turn_count,
                total_tokens=requirement.total_tokens,
                risk_score=requirement.risk_score,
                label="镀金需求" if requirement.final_label == "gold_plating" else "核心目标",
                reason=escape_md_table(requirement.final_reason),
            )
        )
    return "\n".join(lines)


def load_turn_events(path: Path, since: dt.datetime) -> list[TurnEvent]:
    events: list[TurnEvent] = []
    for item in read_jsonl(path):
        if item.get("event_type") != "turn":
            continue
        timestamp = parse_iso_time(str(item.get("timestamp") or now_iso()))
        if timestamp < since:
            continue
        events.append(
            TurnEvent(
                timestamp=timestamp.isoformat(timespec="seconds"),
                session_id=str(item.get("session_id") or ""),
                workspace=str(item.get("workspace") or legacy_cli.DEFAULT_PROJECT_HINT),
                intent_hint=str(item.get("intent_hint") or ""),
                active_files=[str(value) for value in item.get("active_files") or []],
                user_text_hash=str(item.get("user_text_hash") or ""),
                assistant_text_hash=str(item.get("assistant_text_hash") or ""),
                user_chars=int(item.get("user_chars") or 0),
                assistant_chars=int(item.get("assistant_chars") or 0),
                estimated_prompt_tokens=int(item.get("estimated_prompt_tokens") or 0),
                estimated_completion_tokens=int(item.get("estimated_completion_tokens") or 0),
                estimated_total_tokens=int(item.get("estimated_total_tokens") or 0),
                source=str(item.get("source") or "manual"),
            )
        )
    return events


def load_commit_events(path: Path, since: dt.datetime) -> list[CommitEvent]:
    events: list[CommitEvent] = []
    for item in read_jsonl(path):
        if item.get("event_type") != "commit":
            continue
        timestamp = parse_iso_time(str(item.get("timestamp") or now_iso()))
        if timestamp < since:
            continue
        events.append(
            CommitEvent(
                timestamp=timestamp.isoformat(timespec="seconds"),
                commit_sha=str(item.get("commit_sha") or ""),
                message=str(item.get("message") or ""),
                changed_files=[str(value) for value in item.get("changed_files") or []],
                insertions=int(item.get("insertions") or 0),
                deletions=int(item.get("deletions") or 0),
                source=str(item.get("source") or "manual"),
            )
        )
    return events


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            rows.append(value)
    return rows


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def get_ledger_paths(out_dir: Path) -> dict[str, Path]:
    report_dir = out_dir / LEDGER_SUBDIR
    report_dir.mkdir(parents=True, exist_ok=True)
    return {
        "report_dir": report_dir,
        "turns": report_dir / TURN_LEDGER_NAME,
        "commits": report_dir / COMMIT_LEDGER_NAME,
        "requirements_snapshot": report_dir / REQUIREMENTS_SNAPSHOT_NAME,
        "audit_cache": report_dir / AUDIT_CACHE_NAME,
    }


def git_output(args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except subprocess.CalledProcessError as error:
        raise RuntimeError("Git metadata is unavailable.") from error
    return result.stdout.strip()


def get_git_root() -> Path | None:
    try:
        return Path(git_output(["rev-parse", "--show-toplevel"]))
    except RuntimeError:
        return None


def make_executable(path: Path) -> None:
    try:
        mode = path.stat().st_mode
        path.chmod(mode | 0o111)
    except OSError:
        return


def parse_iso_time(value: str) -> dt.datetime:
    if not value:
        return dt.datetime.now()
    try:
        parsed = dt.datetime.fromisoformat(value)
    except ValueError:
        return dt.datetime.now()
    if parsed.tzinfo is not None:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def estimate_tokens_from_chars(char_count: int) -> int:
    if char_count <= 0:
        return 0
    return max(1, int(char_count / 3.5))


def compact_text(value: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned[:limit]


def normalize_files(files: list[str]) -> list[str]:
    normalized: list[str] = []
    for file_path in files:
        file_path = str(file_path).strip().replace("\\", "/")
        if file_path:
            normalized.append(file_path)
    return dedupe_preserve_order(normalized)


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def extract_keywords(value: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", value.lower())
    return {token for token in tokens if len(token) >= 2}


def jaccard_similarity(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    intersection = len(left & right)
    union = len(left | right)
    return intersection / union if union else 0.0


def should_replace_title(current: str, candidate: str) -> bool:
    if not candidate:
        return False
    if not current:
        return True
    if GENERIC_TITLE_RE.search(current):
        return True
    return len(candidate) < len(current) and len(candidate) >= 6


def keyword_hits(corpus: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword in corpus)


def build_gold_reason(
    *, requirement: RequirementCluster, ui_hits: int, refactor_hits: int, output_gap: int
) -> str:
    if requirement.commit_count == 0 and requirement.turn_count >= 3:
        return "对话投入明显高于代码产出，存在空转和需求边界漂移风险。"
    if ui_hits > 0:
        return "高 token 主要消耗在界面/布局类修改，业务闭环信号偏弱。"
    if refactor_hits > 0:
        return "大量投入集中在抽象与结构整理，产出边界不足，疑似过度设计。"
    if output_gap >= 2:
        return "对话轮次明显高于提交数量，投入产出比偏低。"
    return "投入规模较高，但提交闭环和核心逻辑信号不足，偏向镀金需求。"


def build_core_reason(
    *, requirement: RequirementCluster, core_hits: int, bugfix_hits: int, core_file_hits: int
) -> str:
    if bugfix_hits > 0:
        return "提交和语义都指向修复类工作，属于必要投入。"
    if core_hits > 0 or core_file_hits > 0:
        return "改动集中在数据、接口或核心规则逻辑，更接近业务闭环需求。"
    if requirement.commit_count > 0:
        return "虽然有一定沟通成本，但已形成稳定代码产出，偏核心目标。"
    return "风险分较低，暂不认定为镀金需求。"


def escape_md_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")[:180]


def now_iso() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")
