import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DashboardShell } from "@/components/dashboard-shell"
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
        take: 1,
      },
      activities: {
        orderBy: { date: "desc" },
        take: 8,
      },
    },
  })

  if (!user) {
    return <AuthPanel />
  }

  const latestMetric = user.metrics[0]

  return (
    <DashboardShell
      activities={user.activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        type: activity.type,
        distance: activity.distance,
        duration: activity.duration,
        date: activity.date.toISOString().slice(0, 10),
      }))}
      garminEmail={user.garminEmail ?? ""}
      latestMetric={
        latestMetric
          ? {
              date: latestMetric.date.toISOString().slice(0, 10),
              sleepScore: latestMetric.sleepScore,
              hrv: latestMetric.hrv,
              restingHr: latestMetric.restingHr,
              stress: latestMetric.stress,
            }
          : null
      }
      userEmail={user.email}
      userName={user.name ?? user.email.split("@")[0]}
    />
  )
}
