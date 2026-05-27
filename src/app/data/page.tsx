import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataExplorer } from "@/components/data-explorer"
import { AppPage, PageHero } from "@/components/design-system"
import { getLatestSavedAnalysisReport } from "@/lib/analysis-report"
import prisma from "@/lib/prisma"

export default async function DataPage() {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      metrics: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          sleepScore: true,
          hrv: true,
          restingHr: true,
          stress: true,
          raw: true,
        },
      },
      activities: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          garminId: true,
          name: true,
          type: true,
          distance: true,
          duration: true,
          date: true,
          raw: true,
        },
      },
    },
  })

  if (!user) {
    return <AuthPanel />
  }

  let initialAnalysisReport = null
  if (user.metrics.length > 0) {
    try {
      initialAnalysisReport = await getLatestSavedAnalysisReport(user.id)
    } catch (error) {
      console.error("[Trae] Fix: failed to prefetch analysis report", error)
    }
  }

  return (
    <AppPage>
      <PageHero
        actions={
          <>
            <Link className="rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm text-slate-100 transition hover:bg-white/[0.08]" href="/data/sync">
              查看同步状态
            </Link>
            <Link className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15" href="/">
              返回首页
            </Link>
          </>
        }
        description="这里专门负责数据呈现和分析，集中查看 AI 结论、关键趋势、单日深度分析和原始字段核对。"
        eyebrow="Data Analysis"
        title="已同步数据分析"
      />
        <DataExplorer
          activities={user.activities.map((activity) => ({
            id: activity.id,
            garminId: activity.garminId,
            name: activity.name,
            type: activity.type,
            distance: activity.distance,
            duration: activity.duration,
            date: activity.date.toISOString().slice(0, 10),
            raw: activity.raw,
          }))}
          metrics={user.metrics.map((metric) => ({
            id: metric.id,
            date: metric.date.toISOString().slice(0, 10),
            sleepScore: metric.sleepScore,
            hrv: metric.hrv,
            restingHr: metric.restingHr,
            stress: metric.stress,
            raw: metric.raw,
          }))}
          userEmail={user.email}
          initialAnalysisReport={initialAnalysisReport}
        />
    </AppPage>
  )
}
