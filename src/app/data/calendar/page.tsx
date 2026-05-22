import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataCalendar } from "@/components/data-calendar"
import { AppPage, PageHero } from "@/components/design-system"
import prisma from "@/lib/prisma"

export default async function DataCalendarPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
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
      <PageHero
        actions={
          <Link className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15" href="/data">
            返回数据详情
          </Link>
        }
        description={`账号：${user.email}。这里按日历查看哪些天已经有 Daily 数据，哪些天有活动记录。`}
        eyebrow="Coverage Calendar"
        title="数据覆盖日历"
      />
        <DataCalendar
          activityDates={[...new Set(user.activities.map((item) => item.date.toISOString().slice(0, 10)))]}
          metricDates={[...new Set(user.metrics.map((item) => item.date.toISOString().slice(0, 10)))]}
        />
    </AppPage>
  )
}
