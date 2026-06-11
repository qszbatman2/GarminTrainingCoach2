# Garmin AI Coach 架构与实现方案

## 1. 整体技术栈与架构设计
- **前端 (跨端 PWA)**: Next.js 14+ (App Router), Tailwind CSS, Recharts (数据可视化), `next-pwa` (支持离线访问与多平台安装)。
- **后端 (BFF + 微服务)**: 
  - **Node.js (Next.js API Routes)**: 处理用户鉴权、数据库读写、调用 AI 大模型。
  - **Python (FastAPI)**: 作为微服务专门封装 `python-garminconnect`，独立处理复杂的登录会话与抓取逻辑（隔离 Python 依赖）。
- **数据库**: PostgreSQL (Prisma ORM) 存储核心业务与用户数据。Redis 负责高频会话与请求限制。
- **AI 分析引擎**: DeepSeek-V3 或 GPT-4o API，解析结构化的运动指标生成每日洞察。

## 2. 核心模块实现思路

### 2.1 账号与鉴权 (Auth)
- 接入 **Auth.js** (NextAuth)，支持邮箱及 OAuth 登录。
- Garmin 会话管理：用户在前端提交账号密码，Node.js 转发至 Python 节点换取 Session Token (或 Redis 持久化 Cookies)，避免长期存储明文密码。

### 2.2 数据拉取与同步 (Data Sync)
- **触发机制**: 每日定时任务 (Cron) 或前端手动点击“立即同步”。
- **抓取链路**:
  1. Next.js 发起拉取请求 -> Python FastAPI 接口。
  2. Python 通过 `python-garminconnect` 获取前一天的 `Daily Summary` (静息心率、睡眠分、HRV、压力) 以及 `Activities` (跑步配速、心率区间等)。
  3. 经过清洗为标准 JSON 格式，回传至 Node.js 服务并持久化至 PostgreSQL。

### 2.3 AI 洞察与分析 (AI Insight)
- **聚合指标**: 提取用户近 7 日的恢复 baseline（静息心率、HRV趋势）结合当天的训练负荷。
- **Prompt 设计**: 
  - 角色设定：专业马拉松/铁三数据分析师。
  - 数据注入：`{睡眠评分: 85, HRV: 42ms(下降), 今日跑步: 10km, 配速: 5:30, 平均心率: 155...}`
  - 期望输出：当前恢复状态评估，以及明日的结构化训练建议（如：低强度有氧 45 分钟 或 强制休息）。
- **展现形式**: Next.js API 通过 Server-Sent Events (SSE) 流式返回 Markdown，前端打字机效果渲染。

## 3. 数据库模型草案 (Schema Draft)
- `User`: 用户基础信息及偏好设置。
- `GarminSession`: 存储有效 Token 与 Cookie。
- `DailyMetrics`: 每日健康指标快照（睡眠分、HRV、压力值等）。
- `Activity`: 具体运动记录（类型、距离、心率、VO2Max 等摘要）。
- `AiReport`: 基于每日数据生成的 AI 恢复与训练建议归档。

## 5. 产品分阶段交付计划 (Milestones)

**Phase 1: MVP 基础数据链路 (V0.1)**
- **核心目标**: 跑通前后端架构、数据库存储与 Garmin **全量数据抓取**。
- **用户体验**: 
  - 注册并登录系统，录入 Garmin 账号密码。
  - 手动点击“同步数据”，系统拉取并存储所有可获取的指标（睡眠明细、全天心率、HRV、压力、血氧、训练负荷、所有运动记录明细）。
  - 在基础 Dashboard 上查看到个人的结构化数据（睡眠分、HRV、静息心率、近期运动列表）。

**Phase 2: 自动化与跨端体验 (V0.5)**
- **核心目标**: PWA 适配与 Serverless 定时任务 (Cron Job) 自动化。
- **用户体验**:
  - 在手机浏览器中点击“添加到主屏幕”，像原生 App 一样全屏沉浸式使用。
  - 每天早上醒来打开 App，系统已自动在凌晨拉取并存储好昨日全量数据，无需再手动点击同步。

**Phase 3: AI 教练接入 (V1.0)**
- **核心目标**: 引入大模型，基于全量历史数据实现深度业务价值转化。
- **用户体验**:
  - 首页展示打字机效果的“AI 教练今日简报”。
  - 明确知道今天的身体恢复状态（如：HRV 偏低，交感神经活跃）。
  - 获得具体的训练建议（如：建议今天把 10km 节奏跑改为 45 分钟轻松跑）。

**Phase 4: 长期数据追踪与深度洞察 (V2.0)**
- **核心目标**: 数据可视化进阶与长期趋势分析。
- **用户体验**:
  - 查看周报/月报，直观感受 VO2Max、静息心率、训练负荷的长期变化折线图。
  - 多用户支持：允许分享自己的状态给真实教练或其他跑友。
