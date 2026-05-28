# Project Gold-Buster

Project Gold-Buster is a low-cost requirement audit tool.

- Daily workflow: record tiny local `turn` and `commit` events only.
- Periodic workflow: aggregate events into requirements, score them locally, and only audit the most suspicious subset with AI.

## Setup

```powershell
pip install -r tools/gold_buster/requirements.txt
```

The CLI auto-loads `web/.env` and `.env.local`.

```env
ARK_API_KEY=your-api-key
ARK_MODEL=doubao-seed-2-0-pro-260215
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

Compatible legacy names:

```env
GOLD_BUSTER_MODEL=doubao-seed-1-6-250615
GOLD_BUSTER_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

## Core Commands

Legacy memory-only backfill:

```powershell
python -m tools.gold_buster probe
python -m tools.gold_buster audit --days 7 --no-ai
python -m tools.gold_buster audit --days 7
```

Low-cost ledger workflow:

```powershell
python -m tools.gold_buster install-hooks
python -m tools.gold_buster record-turn --session-id demo --intent-hint "优化首页布局" --user-text "..." --assistant-text "..."
python -m tools.gold_buster record-commit --commit-sha demo123 --message "[Trae] Fix: 优化首页布局"
python -m tools.gold_buster report --days 7 --no-ai
python -m tools.gold_buster report --days 7
```

Optional local recorder service for future MCP/automation:

```powershell
python -m tools.gold_buster serve-recorder --host 127.0.0.1 --port 8765
```

Available endpoints:

- `POST /record-turn`
- `POST /record-commit`
- `GET /health`

## Outputs

All new ledgers and reports are stored under `reports/gold_buster/`.

- `turns.jsonl`
- `commits.jsonl`
- `requirements_snapshot.json`
- `audit_cache.json`
- `weekly_report_YYYY-MM-DD.md`

The old memory-only audit still writes to:

- `reports/gold_buster_YYYY-MM-DD.md`
- `reports/audit_history.json`

## Resource Budget

- Per-turn logging: local append only, zero extra model tokens.
- Per-commit logging: local append only.
- Weekly report: local heuristics across all requirements.
- AI audit: only the top suspicious requirements, bounded by `--max-ai-audits`.
