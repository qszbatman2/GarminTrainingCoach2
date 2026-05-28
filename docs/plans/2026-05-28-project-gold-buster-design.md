# Project Gold-Buster Design

## Goal

Project Gold-Buster audits Trae Solo work with a low-cost ledger model. It records lightweight local events during daily work, aggregates them into requirements at report time, and only calls a model for a small suspicious subset.

## MVP Scope

- Keep a local JSONL ledger under `reports/gold_buster/`.
- Record lightweight `turn` events with token estimates, file hints, and hashed text fingerprints.
- Record `commit` events automatically through a Git hook installer.
- Aggregate events into requirements by time proximity, file overlap, and intent similarity.
- Score requirements with local heuristics first, then call Volcengine ARK only for the top suspicious subset.
- Keep the old memory-based audit path as a fallback for historical backfill.
- Write Markdown reports plus reusable snapshots and caches.

## Non-Goals

- No full-fidelity capture of Trae hidden prompts or provider-side billing.
- No real-time dashboard or streaming UI.
- No always-on heavy analysis during each user turn.
- No writes to the Garmin training database.

## Data Flow

1. `record-turn` appends a tiny event to `turns.jsonl`.
2. `install-hooks` installs `post-commit`, and each commit appends to `commits.jsonl`.
3. `report --days 7` loads ledgers, then merges nearby events into requirements.
4. The scorer computes local waste risk without any model call.
5. Only the top suspicious requirements go through Volcengine ARK auditing.
6. The reporter writes a Markdown table, snapshots, and caches.
7. `audit` still supports the older memory-only backfill mode for historical sessions.

## Operating Rules

- Daily recording must cost zero extra model tokens.
- Event payloads store hashes, lengths, and file hints instead of full raw transcripts by default.
- If no `ARK_API_KEY` exists, reports still run with heuristic-only classification.
- If model output is invalid JSON, the requirement falls back to the heuristic verdict instead of blocking the report.
- Generated reports, snapshots, caches, and ledgers are local artifacts and should not be committed.
- Default model routing uses `https://ark.cn-beijing.volces.com/api/v3/chat/completions` and can be overridden through `GOLD_BUSTER_API_URL`, `GOLD_BUSTER_MODEL`, or `ARK_MODEL`.

## Ledgers

- `turns.jsonl`: per-turn estimated token events.
- `commits.jsonl`: per-commit output events written by Git hook or manual command.
- `requirements_snapshot.json`: latest merged requirement view for debugging and reuse.
- `audit_cache.json`: cached model verdicts keyed by requirement hash.

## Resource Budget

- Per-turn logging: local file append only.
- Per-commit logging: local file append only.
- Report generation: local scoring across all requirements.
- Model calls: top `N` suspicious requirements only, configurable by CLI flag.
