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
    include: {
      metrics: {
        orderBy: { date: "desc" },
      },
      activities: {
        orderBy: { date: "desc" },
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
        metrics: user.metrics.map((metric) => ({
          id: metric.id,
          date: metric.date,
          sleepScore: metric.sleepScore,
          hrv: metric.hrv,
          restingHr: metric.restingHr,
          stress: metric.stress,
          raw: metric.raw,
        })),
        activities: user.activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          type: activity.type,
          distance: activity.distance,
          duration: activity.duration,
          date: activity.date,
        })),
      })
    } catch (error) {
      console.error("[Trae] Fix: failed to prefetch homepage analysis report", error)
    }
  }

  return (
    <DashboardShell
      activities={user.activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        type: activity.type,
        distance: activity.distance,
        duration: activity.duration,
        date: activity.date.toISOString().slice(0, 10),
        raw: activity.raw,
      }))}
      garminEmail={user.garminEmail ?? ""}
      initialAnalysisReport={initialAnalysisReport}
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
      userName={user.name ?? user.email.split("@")[0]}
    />
  )
}
