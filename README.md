# Garmin Training Coach

## 项目介绍 / Overview

Garmin Training Coach 是一个基于 Garmin 运动与健康数据的 AI 训练教练应用。项目会同步 Garmin 账号中的训练记录、身体状态和恢复指标，并结合规则引擎与多 Agent 分析工作流，生成更安全、个性化、可解释的每日训练建议。

Garmin Training Coach is an AI-powered training coach built on Garmin fitness and health data. It syncs workout records, body metrics, and recovery signals from a Garmin account, then combines a rule engine with a multi-agent analysis workflow to generate safer, personalized, and explainable daily training recommendations.

## 核心功能 / Core Features

- **Garmin 账号数据同步 / Garmin account data sync**
  同步 Garmin 运动记录、HRV、睡眠、静息心率、恢复时间、训练负荷等关键数据。
  Syncs Garmin activities, HRV, sleep, resting heart rate, recovery time, training load, and other key metrics.

- **身体状态与训练负荷分析 / Body status and training load analysis**
  基于近期训练、恢复窗口、疲劳程度、HRV 与静息心率波动，判断当前训练风险和适合强度。
  Evaluates training readiness and intensity tolerance using recent workouts, recovery windows, fatigue level, HRV, and resting heart rate trends.

- **多 Agent 训练计划分析 / Multi-agent training plan analysis**
  使用 LangGraph 编排多个 AI Agent，分别负责身体状态评估、训练计划调整、安全审核和最终教练建议生成。
  Uses LangGraph to orchestrate multiple AI agents for body assessment, plan adjustment, safety review, and final coaching advice.

- **规则引擎兜底 / Rule-engine guardrails**
  保留确定性的训练规则作为安全底线，防止 AI 给出过度激进或违背恢复原则的建议。
  Keeps deterministic training rules as safety guardrails to prevent overly aggressive or recovery-unsafe AI recommendations.

- **训练报告与链路追踪 / Training reports and traceability**
  生成每日训练建议，并记录 Agent 分析过程、审核结果和 fallback 原因，便于回溯判断依据。
  Generates daily recommendations while recording agent outputs, review results, and fallback reasons for traceable decision-making.

## 目录结构 / Project Structure

```text
web/
  src/                    Next.js 应用源码
    app/                  页面、路由和 API Routes
    components/           前端组件与设计系统
    lib/                  业务逻辑、Garmin 同步、AI 分析、测试
    types/                TypeScript 类型扩展
  prisma/                 Prisma schema 与数据库迁移
  service/                Garmin Python 抓取服务，Render 部署根目录
  docs/                   产品、架构、规则、运维与历史方案文档
  scripts/maintenance/    一次性维护脚本和数据修复脚本
  public/                 静态资源
```

更多文档分类见 `docs/README.md`。

For more documentation categories, see `docs/README.md`.

## 常用命令 / Common Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run verify
npm run repair:timezone
```

## 结构约定 / Structure Conventions

- 页面和 API 入口放在 `src/app/`。
  Pages and API routes live in `src/app/`.
- 可复用 UI 放在 `src/components/`。
  Reusable UI components live in `src/components/`.
- Garmin 数据处理、训练规则、AI Agent 和测试放在 `src/lib/`。
  Garmin data processing, training rules, AI agents, and tests live in `src/lib/`.
- Python 抓取服务保留在 `service/`，因为 `service/render.yaml` 使用 `rootDir: service`。
  The Python Garmin fetch service stays in `service/` because `service/render.yaml` uses `rootDir: service`.
- 维护脚本放在 `scripts/maintenance/`，避免和应用源码混在一起。
  Maintenance scripts live in `scripts/maintenance/` to keep one-off data fixes separate from application code.
