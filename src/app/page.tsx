import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DashboardShell } from "@/components/dashboard-shell"
import { getLatestSavedAnalysisReport } from "@/lib/analysis-report"
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
        orderBy: { date: "desc" },
        take: 1,
        select: {
          date: true,
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
      initialAnalysisReport = await getLatestSavedAnalysisReport(user.id)
    } catch (error) {
      console.error("[Trae] Fix: failed to prefetch homepage analysis report", error)
    }
  }

  return (
    <DashboardShell
      garminEmail={user.garminEmail ?? ""}
      initialAnalysisReport={initialAnalysisReport}
      latestMetricDate={user.metrics[0]?.date.toISOString().slice(0, 10) ?? null}
      userEmail={user.email}
      userName={user.name ?? user.email.split("@")[0]}
      trainingGoal={user.trainingGoal ?? ""}
    />
  )
}
