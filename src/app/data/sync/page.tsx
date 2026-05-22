import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataSyncCenter } from "@/components/data-sync-center"
import { AppPage, PageHero } from "@/components/design-system"
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
    <AppPage>
      <PageHero
        actions={
          <>
            <Link className="rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm text-slate-100 transition hover:bg-white/[0.08]" href="/data">
              返回数据分析
            </Link>
            <Link className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15" href="/">
              返回首页
            </Link>
          </>
        }
        description="这里单独处理 Garmin 数据拉取、补拉和后台执行状态。数据分析与图表展示已经拆到独立的分析页。"
        eyebrow="Sync Control"
        title="同步状态与补拉任务"
      />
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
    </AppPage>
  )
}
