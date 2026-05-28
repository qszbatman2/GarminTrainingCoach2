import type { Metadata } from "next"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataExplorer } from "@/components/data-explorer"
import { AppPage } from "@/components/design-system"
import { getLatestSavedAnalysisReport } from "@/lib/analysis-report"
import prisma from "@/lib/prisma"
import { formatShanghaiDateKey } from "@/lib/shanghai-time"

const INITIAL_METRICS_LIMIT = 21
const INITIAL_ACTIVITIES_LIMIT = 12

export const metadata: Metadata = {
  title: "数据",
}

export default async function DataPage() {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      trainingGoal: true,
      _count: {
        select: {
          metrics: true,
          activities: true,
        },
      },
      metrics: {
        orderBy: { date: "desc" },
        take: INITIAL_METRICS_LIMIT,
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
        take: INITIAL_ACTIVITIES_LIMIT,
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
      <DataExplorer
        activityTotal={user._count.activities}
        activities={user.activities.map((activity) => ({
          id: activity.id,
          garminId: activity.garminId,
          name: activity.name,
          type: activity.type,
          distance: activity.distance,
          duration: activity.duration,
          date: formatShanghaiDateKey(activity.date),
          raw: activity.raw,
        }))}
        initialAnalysisReport={initialAnalysisReport}
        metrics={user.metrics.map((metric) => ({
          id: metric.id,
          date: formatShanghaiDateKey(metric.date),
          sleepScore: metric.sleepScore,
          hrv: metric.hrv,
          restingHr: metric.restingHr,
          stress: metric.stress,
          raw: metric.raw,
        }))}
        metricTotal={user._count.metrics}
        trainingGoal={user.trainingGoal ?? ""}
      />
    </AppPage>
  )
}
