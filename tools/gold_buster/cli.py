from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PROJECT_MEMORY_ROOT = Path.home() / ".trae-cn" / "memory" / "projects"
REPORTS_DIR = Path("reports")
HISTORY_PATH = REPORTS_DIR / "audit_history.json"
DEFAULT_PROJECT_HINT = "GarminTrainingCoach2"
TOPIC_RE = re.compile(
    r"\[session_id:\s*(?P<session_id>[^\s|]+)\s*\|\s*topic_summary_time:\s*(?P<time>[^\]]+)\](?P<summary>.*)"
)


@dataclass
class TaskRecord:
    session_id: str
    task_name: str
    created_at: str
    updated_at: str
    source_paths: list[str] = field(default_factory=list)
    summaries: list[str] = field(default_factory=list)
    messages: list[dict[str, Any]] = field(default_factory=list)
    conversation_rounds: int = 0
    estimated_tokens: int = 0
    content_hash: str = ""

    @property
    def task_id(self) -> str:
        return hashlib.md5(self.session_id.encode("utf-8")).hexdigest()

    def context_text(self, max_chars: int = 24000) -> str:
        chunks: list[str] = []
        if self.summaries:
            chunks.append("Topic summaries:\n" + "\n".join(self.summaries))
        for message in self.messages:
            chunks.append(json.dumps(message, ensure_ascii=False, sort_keys=True))
        text = "\n\n".join(chunks)
        return text[-max_chars:]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m tools.gold_buster",
        description="Audit local Trae Solo tasks for gold-plating waste.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    probe = subparsers.add_parser("probe", help="Inspect available local data sources.")
    probe.add_argument("--project", default=DEFAULT_PROJECT_HINT, help="Project name hint.")
    probe.add_argument("--memory-root", type=Path, default=PROJECT_MEMORY_ROOT)

    audit = subparsers.add_parser("audit", help="Generate a Markdown audit report.")
    audit.add_argument("--project", default=DEFAULT_PROJECT_HINT, help="Project name hint.")
    audit.add_argument("--memory-root", type=Path, default=PROJECT_MEMORY_ROOT)
    audit.add_argument("--days", type=int, default=7, help="Lookback window.")
    audit.add_argument("--refresh", action="store_true", help="Ignore cached AI audit results.")
    audit.add_argument("--no-ai", action="store_true", help="Skip external model calls.")
    audit.add_argument("--limit", type=int, default=0, help="Optional max task count.")
    audit.add_argument("--out-dir", type=Path, default=REPORTS_DIR)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.command == "probe":
        return run_probe(args)
    if args.command == "audit":
        return run_audit(args)
    return 1


def run_probe(args: argparse.Namespace) -> int:
    project_dir = find_project_memory_dir(args.memory_root, args.project)
    if project_dir is None:
        print(f"No Trae memory project found under {args.memory_root}")
        return 1

    session_files = sorted(project_dir.glob("**/session_memory_*.jsonl"))
    topic_files = sorted(project_dir.glob("**/topics.md"))
    workspace_storage = find_workspace_storage()

    print("# Gold-Buster Probe")
    print()
    print(f"- Project memory: `{project_dir}`")
    print(f"- Session files: {len(session_files)}")
    print(f"- Topic files: {len(topic_files)}")
    print(f"- Workspace storage: `{workspace_storage}`" if workspace_storage else "- Workspace storage: not found")
    if session_files:
        sample = read_jsonl(session_files[-1])
        sample_chars = sum(len(json.dumps(item, ensure_ascii=False)) for item in sample)
        print(f"- Latest sample: `{session_files[-1].name}` ({len(sample)} records, {sample_chars} chars)")
    return 0


def run_audit(args: argparse.Namespace) -> int:
    project_dir = find_project_memory_dir(args.memory_root, args.project)
    if project_dir is None:
        print(f"No Trae memory project found under {args.memory_root}", file=sys.stderr)
        return 1

    since = dt.datetime.now() - dt.timedelta(days=args.days)
    tasks = load_tasks(project_dir, since)
    if args.limit > 0:
        tasks = tasks[: args.limit]
    if not tasks:
        print("No tasks found in the selected period.", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    history_path = args.out_dir / "audit_history.json"
    history = load_history(history_path)
    audit_enabled = not args.no_ai and bool(os.getenv("DEEPSEEK_API_KEY"))

    rows = []
    for task in tasks:
        task.estimated_tokens = estimate_tokens(task.context_text())
        task.conversation_rounds = estimate_rounds(task)
        task.content_hash = hash_text(task.context_text())
        audit = get_audit(task, history, audit_enabled, args.refresh)
        rows.append((task, audit))

    save_history(history_path, history)
    report = render_report(rows, args.days, audit_enabled)
    report_path = args.out_dir / f"gold_buster_{dt.date.today().isoformat()}.md"
    report_path.write_text(report, encoding="utf-8")
    print(report)
    print()
    print(f"Report written: {report_path}")
    return 0


def find_project_memory_dir(memory_root: Path, project_hint: str) -> Path | None:
    if not memory_root.exists():
        return None
    normalized_hint = normalize_name(project_hint)
    candidates = [path for path in memory_root.iterdir() if path.is_dir()]
    for path in candidates:
        if normalized_hint in normalize_name(path.name):
            return path
    return candidates[0] if len(candidates) == 1 else None


def find_workspace_storage() -> Path | None:
    appdata = os.getenv("APPDATA")
    if appdata:
        candidate = Path(appdata) / "Trae" / "User" / "workspaceStorage"
        if candidate.exists():
            return candidate
    mac_candidate = Path.home() / "Library" / "Application Support" / "Trae" / "User" / "workspaceStorage"
    return mac_candidate if mac_candidate.exists() else None


def load_tasks(project_dir: Path, since: dt.datetime) -> list[TaskRecord]:
    topic_map = load_topic_map(project_dir)
    grouped: dict[str, TaskRecord] = {}

    for file_path in sorted(project_dir.glob("**/session_memory_*.jsonl")):
        folder_date = parse_folder_date(file_path.parent.name)
        if folder_date and folder_date < since.date():
            continue
        session_id = file_path.stem.replace("session_memory_", "")
        records = read_jsonl(file_path)
        if not records:
            continue

        task = grouped.get(session_id)
        if task is None:
            summaries = topic_map.get(session_id, [])
            task = TaskRecord(
                session_id=session_id,
                task_name=infer_task_name(records, summaries, session_id),
                created_at=infer_created_at(records, file_path),
                updated_at=infer_updated_at(records, file_path),
                summaries=summaries[:],
            )
            grouped[session_id] = task
        task.source_paths.append(str(file_path))
        task.messages.extend(records)
        task.created_at = min(task.created_at, infer_created_at(records, file_path))
        task.updated_at = max(task.updated_at, infer_updated_at(records, file_path))

    tasks = list(grouped.values())
    tasks.sort(key=lambda item: item.updated_at, reverse=True)
    return tasks


def load_topic_map(project_dir: Path) -> dict[str, list[str]]:
    topic_map: dict[str, list[str]] = {}
    for topic_file in project_dir.glob("**/topics.md"):
        for line in topic_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            match = TOPIC_RE.match(line)
            if not match:
                continue
            session_id = match.group("session_id")
            summary = match.group("summary").strip()
            if summary:
                topic_map.setdefault(session_id, []).append(summary)
    return topic_map


def read_jsonl(file_path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in file_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def parse_folder_date(name: str) -> dt.date | None:
    try:
        return dt.datetime.strptime(name, "%Y%m%d").date()
    except ValueError:
        return None


def infer_task_name(records: list[dict[str, Any]], summaries: list[str], session_id: str) -> str:
    source = ""
    if summaries:
        source = summaries[-1]
    elif records:
        source = str(records[0].get("intent") or records[0].get("outcome") or "")
    source = re.sub(r"^(User requested|用户提出了新需求[:：]?|用户实现了)", "", source).strip()
    source = re.sub(r"\s+", " ", source)
    return source[:60] or f"Trae task {session_id[:8]}"


def infer_created_at(records: list[dict[str, Any]], file_path: Path) -> str:
    times = [str(item.get("message_summary_time")) for item in records if item.get("message_summary_time")]
    if times:
        return min(times)
    return dt.datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(timespec="seconds")


def infer_updated_at(records: list[dict[str, Any]], file_path: Path) -> str:
    times = [str(item.get("message_summary_time")) for item in records if item.get("message_summary_time")]
    if times:
        return max(times)
    return dt.datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(timespec="seconds")


def estimate_rounds(task: TaskRecord) -> int:
    if task.messages:
        return len(task.messages)
    return max(1, len(task.summaries))


def estimate_tokens(text: str) -> int:
    try:
        import tiktoken  # type: ignore

        try:
            encoding = tiktoken.get_encoding("o200k_base")
        except Exception:
            encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        ascii_chars = sum(1 for char in text if ord(char) < 128)
        cjk_chars = len(text) - ascii_chars
        return max(1, int(ascii_chars / 4 + cjk_chars * 1.8))


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_history(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def save_history(path: Path, history: dict[str, Any]) -> None:
    path.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")


def get_audit(task: TaskRecord, history: dict[str, Any], audit_enabled: bool, refresh: bool) -> dict[str, Any]:
    cached = history.get(task.task_id)
    cached_has_ai_result = cached and cached.get("is_gold_plating") is not None
    cached_is_usable = cached and (cached_has_ai_result or not audit_enabled)
    if cached_is_usable and not refresh and cached.get("content_hash") == task.content_hash:
        return cached

    if not audit_enabled:
        audit = {
            "task_id": task.task_id,
            "task_name": task.task_name,
            "content_hash": task.content_hash,
            "is_gold_plating": None,
            "reason": "未配置 DEEPSEEK_API_KEY，仅完成本地轮次与 Token 估算。",
            "confidence": 0.0,
            "audited_at": now_iso(),
        }
    else:
        audit = call_deepseek(task)
    history[task.task_id] = audit
    return audit


def call_deepseek(task: TaskRecord) -> dict[str, Any]:
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    model = os.getenv("GOLD_BUSTER_MODEL", "deepseek-chat")
    url = os.getenv("GOLD_BUSTER_API_URL", "https://api.deepseek.com/chat/completions")
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": "Return strict JSON only. No markdown.",
            },
            {
                "role": "user",
                "content": build_audit_prompt(task),
            },
        ],
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(strip_json_fence(content))
        return {
            "task_id": task.task_id,
            "task_name": task.task_name,
            "content_hash": task.content_hash,
            "is_gold_plating": bool(parsed.get("is_gold_plating")),
            "reason": str(parsed.get("reason") or "模型未给出理由。"),
            "confidence": float(parsed.get("confidence") or 0.0),
            "audited_at": now_iso(),
        }
    except (urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError) as error:
        return {
            "task_id": task.task_id,
            "task_name": task.task_name,
            "content_hash": task.content_hash,
            "is_gold_plating": None,
            "reason": f"AI 审计失败：{error}",
            "confidence": 0.0,
            "audited_at": now_iso(),
        }


def build_audit_prompt(task: TaskRecord) -> str:
    return f"""你是一位极其严苛的敏捷项目管理专家与架构师。
请审计以下 Trae Solo 研发任务上下文，判断它是否属于镀金需求。

判定标准：
- 核心目标：业务闭环、MVP 必需、用户可感知价值、硬性 Bug 修复、上线阻断问题。
- 镀金需求：边缘 UI 动画、过度抽象、未验证的扩展性、低频场景优化、为了“看起来专业”的复杂化。

任务名称：{task.task_name}
对话轮次：{task.conversation_rounds}
估算 Token：{task.estimated_tokens}

完整上下文：
{task.context_text()}

只返回 JSON，不要 Markdown：
{{
  "is_gold_plating": true,
  "reason": "一句话毒舌点评，指出它浪费了什么。",
  "confidence": 0.0
}}
"""


def strip_json_fence(text: str) -> str:
    return text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def render_report(rows: list[tuple[TaskRecord, dict[str, Any]]], days: int, audit_enabled: bool) -> str:
    total_tokens = sum(task.estimated_tokens for task, _ in rows)
    gold_tokens = sum(
        task.estimated_tokens for task, audit in rows if audit.get("is_gold_plating") is True
    )
    gold_percent = (gold_tokens / total_tokens * 100) if total_tokens else 0
    mode = "AI 审计" if audit_enabled else "本地估算（未配置 API Key）"

    lines = [
        "# Project Gold-Buster 审计报告",
        "",
        f"- 周期：最近 {days} 天",
        f"- 模式：{mode}",
        f"- 任务数：{len(rows)}",
        f"- 总 Token：{total_tokens}",
        f"- 镀金 Token：{gold_tokens}",
        f"- 镀金浪费占比：{gold_percent:.1f}%",
        "",
        "| 任务 | 更新时间 | 轮次 | 估算 Token | 分类 | 点评 |",
        "|---|---:|---:|---:|---|---|",
    ]
    for task, audit in rows:
        verdict = format_verdict(audit.get("is_gold_plating"))
        reason = escape_table(str(audit.get("reason") or ""))
        lines.append(
            f"| {escape_table(task.task_name)} | {task.updated_at} | {task.conversation_rounds} | "
            f"{task.estimated_tokens} | {verdict} | {reason} |"
        )
    return "\n".join(lines)


def format_verdict(value: Any) -> str:
    if value is True:
        return "镀金需求"
    if value is False:
        return "核心目标"
    return "未审计"


def escape_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")[:180]


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def now_iso() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")
