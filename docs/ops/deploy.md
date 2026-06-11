# 部署说明（Vercel + Render + Supabase）

## 1. 创建线上 PostgreSQL（Supabase）
1. 在 Supabase 创建项目。
2. 进入 `Project Settings -> Database`，准备两条连接串：
   - Session Pooler（端口通常为 `6543`），用于 `DATABASE_URL`
   - Direct connection（端口通常为 `5432`），用于 `DIRECT_URL`
3. 推荐配置：
   - `DATABASE_URL`：Pooler 连接串，并追加 `pgbouncer=true`
   - `DIRECT_URL`：Direct 连接串，用于 Prisma migration

## 2. 部署 Python 抓取服务（Render）
1. 将仓库推到 GitHub。
2. Render 新建 `Web Service`：
   - Runtime: `Docker`
   - Root Directory: `service`
3. 部署完成后获取服务 URL，例如 `https://garmin-scraper.onrender.com`。

## 3. 部署 Web（Vercel）
1. Vercel 导入 GitHub 仓库，选择 Root Directory 为 `web`。
2. 配置环境变量：
   - `DATABASE_URL`: Supabase Session Pooler 连接串，建议使用 `6543` 并带 `pgbouncer=true`
   - `DIRECT_URL`: Supabase Direct connection 连接串，通常是 `5432`
   - `GARMIN_SERVICE_URL`: Render 服务地址（例如 `https://garmin-scraper.onrender.com`）
   - `AUTH_SECRET`: 生成一个随机字符串（用于 NextAuth）
3. Build Command 建议改为：`npm run vercel-build`
3. 在 Vercel 部署后，访问首页完成注册、绑定 Garmin、同步。

## 4. Prisma 迁移（线上）
本项目已切换为 PostgreSQL 作为主数据源。首次上线前先在本地生成迁移并提交：
```bash
cd web
npx prisma migrate dev --name init
```
然后把 `web/prisma/migrations` 提交到仓库。

注意：当前 `npm run vercel-build` 只执行 `next build`，**不会**自动执行 `prisma migrate deploy`。线上迁移需要单独手动执行，或在独立发布流程里显式加入：

```bash
cd web
npm run db:migrate:deploy
```

如果构建阶段报 `P1001: Can't reach database server`，优先检查这 3 点：
1. `DATABASE_URL` 是否还在使用错误的直连地址，或缺少 `pgbouncer=true`
2. `DIRECT_URL` 是否未配置，导致 Prisma migration 仍然走错连接
3. Supabase 实例是否暂停、限流，或当前项目网络不可达
