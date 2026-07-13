# Garmin Training Coach

基于 Garmin 数据的训练分析与 AI 教练应用。

## 目录结构

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

## 常用命令

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run verify
npm run repair:timezone
```

## 结构约定

- 页面和 API 入口放在 `src/app/`。
- 可复用 UI 放在 `src/components/`。
- Garmin 数据处理、训练规则、AI Agent 和测试放在 `src/lib/`。
- Python 抓取服务保留在 `service/`，因为 `service/render.yaml` 使用 `rootDir: service`。
- 维护脚本放在 `scripts/maintenance/`，避免和应用源码混在一起。
