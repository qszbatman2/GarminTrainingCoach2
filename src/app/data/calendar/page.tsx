import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataCalendar } from "@/components/data-calendar"
import { AppPage } from "@/components/design-system"
import prisma from "@/lib/prisma"

export default async function DataCalendarPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
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
    },
  })

  if (!user) {
    return <AuthPanel />
  }

  return (
    <AppPage>
      <DataCalendar
        activityDates={[...new Set(user.activities.map((item) => item.date.toISOString().slice(0, 10)))]}
        metricDates={[...new Set(user.metrics.map((item) => item.date.toISOString().slice(0, 10)))]}
      />
    </AppPage>
  )
}
