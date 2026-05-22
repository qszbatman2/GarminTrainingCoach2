import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataSyncCenter } from "@/components/data-sync-center"
import prisma from "@/lib/prisma"

export default async function DataSyncPage() {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      garminEmail: true,
      metrics: {
        select: {
          date: true,
        },
        orderBy: { date: "desc" },
      },
      activities: {
        select: {
          date: true,
        },
        orderBy: { date: "desc" },
      },
      backfillJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  })

  if (!user) {
    return <AuthPanel />
  }

  const metricDates = user.metrics.map((item) => item.date.toISOString().slice(0, 10))
  const last30MetricDates = new Set(metricDates.slice(0, 30))
  const last30ActivityDays = new Set(
    user.activities.map((item) => item.date.toISOString().slice(0, 10)).filter((date) => last30MetricDates.has(date))
  ).size

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08101d_0%,#0d1526_28%,#edf2f8_28%,#f4f7fb_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(95,230,255,0.22),_transparent_30%),linear-gradient(135deg,#0f1a2e,#0b1018)] p-8 text-white shadow-[0_20px_80px_rgba(8,16,29,0.35)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Data Sync</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">同步状态与补拉任务</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                这里单独处理 Garmin 数据拉取、补拉和后台执行状态。数据分析与图表展示已经拆到独立的分析页。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                href="/data"
              >
                返回数据分析
              </Link>
              <Link
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                href="/"
              >
                返回首页
              </Link>
            </div>
          </div>
        </section>

        <DataSyncCenter
          activitiesCount={user.activities.length}
          garminEmail={user.garminEmail}
          initialBackfillJob={
            user.backfillJobs[0]
              ? {
                  id: user.backfillJobs[0].id,
                  status: user.backfillJobs[0].status,
                  totalDates: user.backfillJobs[0].totalDates,
                  currentIndex: user.backfillJobs[0].currentIndex,
                  targetDates: user.backfillJobs[0].targetDates,
                  syncedDates: user.backfillJobs[0].syncedDates,
                  skippedDates: user.backfillJobs[0].skippedDates,
                  failedDates: user.backfillJobs[0].failedDates,
                  message: user.backfillJobs[0].message,
                  lastError: user.backfillJobs[0].lastError,
                  createdAt: user.backfillJobs[0].createdAt.toISOString(),
                  updatedAt: user.backfillJobs[0].updatedAt.toISOString(),
                  startedAt: user.backfillJobs[0].startedAt?.toISOString() ?? null,
                  finishedAt: user.backfillJobs[0].finishedAt?.toISOString() ?? null,
                  heartbeatAt: user.backfillJobs[0].heartbeatAt?.toISOString() ?? null,
                }
              : null
          }
          last30ActivityDays={last30ActivityDays}
          last30MetricCount={Math.min(metricDates.length, 30)}
          latestMetricDate={metricDates[0] ?? null}
          metricsCount={user.metrics.length}
          userEmail={user.email}
        />
      </div>
    </main>
  )
}
