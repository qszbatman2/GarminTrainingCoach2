# Project Gold-Buster Design

## Goal

Project Gold-Buster audits Trae Solo work after the fact. It extracts local task history, estimates conversation cost, asks a lightweight model whether each task was core work or gold-plating, and writes a Markdown report.

## MVP Scope

- Read local Trae memory files from `c:\Users\Admin\.trae-cn\memory\projects`.
- Group work by `session_memory_*.jsonl` files and `topics.md` summaries.
- Estimate user rounds from user-authored messages.
- Estimate tokens with `tiktoken` when installed, otherwise use a deterministic character fallback.
- Optionally call Volcengine ARK via the OpenAI-compatible Chat Completions API when `ARK_API_KEY` is configured.
- Write `reports/gold_buster_YYYY-MM-DD.md` and `reports/audit_history.json`.

## Non-Goals

- No web dashboard in the first version.
- No MCP server until the CLI proves useful.
- No exact billing reconstruction, because Trae does not expose official token accounting.
- No writes to the Garmin training database.

## Data Flow

1. `python -m tools.gold_buster probe` checks available local data sources.
2. `python -m tools.gold_buster audit --days 7` loads recent tasks.
3. The loader builds task records from session memory files and topic summaries.
4. The estimator calculates rounds and token volume.
5. The auditor uses cached results or calls Volcengine ARK.
6. The reporter writes a Markdown table and period summary.

## Operating Rules

- If no `ARK_API_KEY` exists, the tool still produces rounds and token estimates.
- If model output is invalid JSON, the task is marked `audit_failed` instead of blocking the report.
- Generated reports and audit history are local artifacts and should not be committed.
- Default model routing uses `https://ark.cn-beijing.volces.com/api/v3/chat/completions` and can be overridden through `GOLD_BUSTER_API_URL` and `GOLD_BUSTER_MODEL`.
