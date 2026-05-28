import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DashboardShell } from "@/components/dashboard-shell"
import { getOrCreateLatestAnalysisReport } from "@/lib/analysis-report"
import prisma from "@/lib/prisma"

export default async function Home() {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      garminEmail: true,
      trainingGoal: true,
      metrics: {
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          sleepScore: true,
          restingHr: true,
          hrv: true,
          stress: true,
          raw: true,
          createdAt: true,
        },
      },
      activities: {
        orderBy: { date: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          distance: true,
          duration: true,
          date: true,
          raw: true,
          createdAt: true,
        },
      },
    },
  })

  if (!user) {
    return <AuthPanel />
  }

  let initialAnalysisReport = null
  if (user.garminEmail && user.metrics.length > 0) {
    try {
      initialAnalysisReport = await getOrCreateLatestAnalysisReport({
        userId: user.id,
        trainingGoal: user.trainingGoal,
        metrics: user.metrics,
        activities: user.activities,
      })
    } catch (error) {
      console.error("[Trae] Fix: failed to prefetch homepage analysis report", error)
    }
  }

  const latestMetricDate = user.metrics.length > 0 ? user.metrics[user.metrics.length - 1]?.date.toISOString().slice(0, 10) ?? null : null
  const latestDataSyncAt = [...user.metrics, ...user.activities].reduce<string | null>((latest, item) => {
    const createdAt = item.createdAt.toISOString()
    if (!latest || new Date(createdAt).getTime() > new Date(latest).getTime()) {
      return createdAt
    }

    return latest
  }, null)

  return (
    <DashboardShell
      garminEmail={user.garminEmail ?? ""}
      initialAnalysisReport={initialAnalysisReport}
      latestDataSyncAt={latestDataSyncAt}
      latestMetricDate={latestMetricDate}
      userName={user.name ?? user.email.split("@")[0]}
      trainingGoal={user.trainingGoal ?? ""}
    />
  )
}
