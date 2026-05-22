import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataExplorer } from "@/components/data-explorer"
import prisma from "@/lib/prisma"

export default async function DataPage() {
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08101d_0%,#0d1526_28%,#edf2f8_28%,#f4f7fb_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(95,230,255,0.22),_transparent_30%),linear-gradient(135deg,#0f1a2e,#0b1018)] p-8 text-white shadow-[0_20px_80px_rgba(8,16,29,0.35)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Data Explorer</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">已同步数据总览</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                这里把已经同步到库里的 Garmin 数据，整理成按天趋势图和分时明细图，同时支持一键补拉最近 30 天缺失或不完整的数据。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                href="/"
              >
                返回首页
              </Link>
            </div>
          </div>
        </section>

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
        />
      </div>
    </main>
  )
}
