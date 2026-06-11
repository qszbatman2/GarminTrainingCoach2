# Coze Agent 每日 Garmin AI 报告推送指引

目标：每天让 Coze Agent 自动读取 Garmin AI Coach 的最新日报，并推送到已绑定 Coze 的微信 ClawBot。

## 1. 项目侧接口

生产接口：

```text
GET https://garmin-training-coach2.vercel.app/api/coze/daily-report
```

鉴权方式二选一：

```text
Authorization: Bearer <COZE_REPORT_TOKEN>
```

或：

```text
https://garmin-training-coach2.vercel.app/api/coze/daily-report?token=<COZE_REPORT_TOKEN>
```

建议使用 Header，不要把 token 暴露在日志和截图里。

当前固定配置：

```text
APP_BASE_URL=https://garmin-training-coach2.vercel.app
COZE_REPORT_USER_EMAIL=qszbatman2@gmail.com
```

安全说明：

- `COZE_REPORT_TOKEN` 和 `CRON_SECRET` 是密钥，只配置到 Vercel/Coze，不写入 GitHub 文档。
- 如果密钥已经被截图、转发或公开，需要重新生成并替换。

接口返回字段：

```json
{
  "ok": true,
  "source": "garmin-ai-coach",
  "userEmail": "qszbatman2@gmail.com",
  "date": "2026-06-11",
  "generatedAt": "2026-06-11T06:30:00.000Z",
  "updatedAt": "2026-06-11T06:30:00.000Z",
  "shouldTrain": "可训",
  "todayAdvice": "耐力骑行 45-60 分钟",
  "weeklyConclusion": "训练合理",
  "weeklyAdvice": "继续保持分布均衡。",
  "reasonAnalysis": "恢复良好，ATL/CTL 在安全范围。",
  "metrics": {
    "sleepScore": 79,
    "hrv": 68,
    "restingHr": 51,
    "stress": 22,
    "bodyBatteryHigh": 86,
    "bodyBatteryLow": 32,
    "loadRatio": 1.05,
    "recoveryHours": 6
  },
  "pushText": "Garmin AI Coach 2026-06-11\n结论: 可训\n建议: 耐力骑行 45-60 分钟\n本周: 训练合理\n原因: 恢复良好，ATL/CTL 在安全范围。",
  "markdown": "## Garmin AI Coach 每日报告\n..."
}
```

## 2. 项目环境变量

在 Vercel 或部署平台配置：

```text
COZE_REPORT_TOKEN=<在 Vercel 中填写真实密钥>
COZE_REPORT_USER_EMAIL=qszbatman2@gmail.com
CRON_SECRET=<在 Vercel 中填写真实密钥>
```

说明：

- `COZE_REPORT_TOKEN`：Coze 拉取日报专用密钥。
- `COZE_REPORT_USER_EMAIL`：指定生成和读取哪个用户的日报。单用户项目也建议填写。
- `CRON_SECRET`：Vercel Cron 和内部定时接口使用。

## 3. 每日生成机制

项目已经新增 Vercel Cron：

```text
03:00 /api/cron/garmin-reconcile
03:30 /api/cron/daily-analysis
```

含义：

- `03:00` 先同步 Garmin 今天和昨天的数据。
- `03:30` 强制刷新 AI 分析日报。
- Coze 建议在 `07:30-09:00` 之间拉取，确保数据已经生成。

## 4. Coze Agent 工作流

创建一个 Workflow，命名：

```text
每日 Garmin AI Coach 推送
```

节点顺序：

```text
定时触发器 -> HTTP 请求 -> 条件判断 -> 文案整理 -> ClawBot/微信消息发送
```

### 节点 1：定时触发器

配置：

```text
触发频率：每天
时间：08:00
时区：Asia/Shanghai
```

### 节点 2：HTTP 请求

配置：

```text
方法：GET
URL：https://garmin-training-coach2.vercel.app/api/coze/daily-report
Headers:
  Authorization: Bearer <COZE_REPORT_TOKEN>
```

如果 Coze 当前 HTTP 节点不方便配置 Header，则使用：

```text
https://garmin-training-coach2.vercel.app/api/coze/daily-report?token=<COZE_REPORT_TOKEN>
```

### 节点 3：条件判断

判断条件：

```text
response.body.ok == true
```

成功分支进入文案整理。

失败分支发送：

```text
Garmin AI Coach 日报获取失败：{{response.body.error}}
```

### 节点 4：文案整理

推荐直接使用接口返回的 `pushText`：

```text
{{response.body.pushText}}
```

如果需要更完整版本，使用：

```text
{{response.body.markdown}}
```

如果要让 Agent 稍微润色，使用这个提示词：

```text
你是我的 Garmin 训练助理。请把以下 JSON 整理成微信短消息。
要求：
1. 不重新判断训练结论，只复述 shouldTrain、todayAdvice、weeklyConclusion。
2. 保留关键指标：sleepScore、hrv、restingHr、bodyBatteryHigh/bodyBatteryLow、loadRatio、recoveryHours。
3. 控制在 300 字以内。
4. 语气直接，不要鸡汤。

JSON:
{{response.body}}
```

### 节点 5：微信 ClawBot 推送

选择已绑定的 Coze 微信 ClawBot 消息发送能力。

发送内容：

```text
{{文案整理节点.output}}
```

如果没有文案整理节点，直接发送：

```text
{{response.body.pushText}}
```

## 5. Coze Agent 可执行任务描述

把下面这段直接交给 Coze Agent：

```text
你每天 08:00 Asia/Shanghai 自动执行一次。

执行步骤：
1. 调用 HTTP GET：https://garmin-training-coach2.vercel.app/api/coze/daily-report
2. 请求头添加 Authorization: Bearer <COZE_REPORT_TOKEN>
3. 如果返回 JSON 的 ok 为 true，把 pushText 原样推送到我绑定的微信 ClawBot。
4. 如果 pushText 为空，就使用 markdown 字段推送。
5. 如果 ok 不为 true，推送“Garmin AI Coach 日报获取失败：{error}”。
6. 不要重新分析训练数据，不要改写训练结论，只负责拉取和推送。
```

## 6. 手动验证

本地或线上验证：

```bash
curl -H "Authorization: Bearer <COZE_REPORT_TOKEN>" https://garmin-training-coach2.vercel.app/api/coze/daily-report
```

期望：

```json
{
  "ok": true,
  "pushText": "Garmin AI Coach ..."
}
```

强制刷新：

```bash
curl -H "Authorization: Bearer <COZE_REPORT_TOKEN>" "https://garmin-training-coach2.vercel.app/api/coze/daily-report?refresh=1"
```
