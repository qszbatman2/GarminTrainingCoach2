import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataCalendar } from "@/components/data-calendar"
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#08101d_0%,#0d1526_28%,#edf2f8_28%,#f4f7fb_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(95,230,255,0.22),_transparent_30%),linear-gradient(135deg,#0f1a2e,#0b1018)] p-8 text-white shadow-[0_20px_80px_rgba(8,16,29,0.35)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Data Calendar</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">数据覆盖日历</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">账号：{user.email}。这里按日历查看哪些天已经有 Daily 数据，哪些天有活动记录。</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                href="/data"
              >
                返回数据详情
              </Link>
            </div>
          </div>
        </section>

        <DataCalendar
          activityDates={[...new Set(user.activities.map((item) => item.date.toISOString().slice(0, 10)))]}
          metricDates={[...new Set(user.metrics.map((item) => item.date.toISOString().slice(0, 10)))]}
        />
      </div>
    </main>
  )
}
