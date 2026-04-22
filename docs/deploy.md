# 部署说明（Vercel + Render + Supabase）

## 1. 创建线上 PostgreSQL（Supabase）
1. 在 Supabase 创建项目。
2. 进入 `Project Settings -> Database`，复制 `Connection string`（`postgresql://...`）。
3. 记录为 `DATABASE_URL`。

## 2. 部署 Python 抓取服务（Render）
1. 将仓库推到 GitHub。
2. Render 新建 `Web Service`：
   - Runtime: `Docker`
   - Root Directory: `service`
3. 部署完成后获取服务 URL，例如 `https://garmin-scraper.onrender.com`。

## 3. 部署 Web（Vercel）
1. Vercel 导入 GitHub 仓库，选择 Root Directory 为 `web`。
2. 配置环境变量：
   - `DATABASE_URL`: Supabase 提供的连接串
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
然后把 `web/prisma/migrations` 提交到仓库。Vercel 部署时会执行 `npm run vercel-build`，其中包含 `prisma migrate deploy`。
