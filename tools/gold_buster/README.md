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
$env:DEEPSEEK_API_KEY="your-api-key"
```

## Outputs

- `reports/gold_buster_YYYY-MM-DD.md`
- `reports/audit_history.json`

The CLI still works without `DEEPSEEK_API_KEY`; it only skips AI classification.
