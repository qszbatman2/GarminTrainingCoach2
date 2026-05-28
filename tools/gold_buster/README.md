# Project Gold-Buster

Audit local Trae Solo work for gold-plating waste.

## Commands

```powershell
python -m tools.gold_buster probe
python -m tools.gold_buster audit --days 7 --no-ai
python -m tools.gold_buster audit --days 7
```

## Optional Setup

```powershell
pip install -r tools/gold_buster/requirements.txt
```

默认会自动读取 `web/.env` 或 `.env.local`，兼容下面这些变量名：

```env
ARK_API_KEY=your-api-key
ARK_MODEL=doubao-seed-2-0-pro-260215
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

也兼容旧变量名：

```env
GOLD_BUSTER_MODEL=doubao-seed-1-6-250615
GOLD_BUSTER_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

默认走火山 ARK 的 OpenAI 兼容接口：

```text
https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

如需覆盖地址，可设置：

```powershell
$env:GOLD_BUSTER_API_URL="https://ark.cn-beijing.volces.com/api/v3/chat/completions"
```

## Outputs

- `reports/gold_buster_YYYY-MM-DD.md`
- `reports/audit_history.json`

The CLI still works without `ARK_API_KEY`; it only skips AI classification.
