import Link from "next/link"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import prisma from "@/lib/prisma"

function formatDistance(distance: number | null) {
  if (!distance) {
    return "--"
  }

  return `${(distance / 1000).toFixed(1)} km`
}

function formatDuration(duration: number | null) {
  if (!duration) {
    return "--"
  }

  const totalMinutes = Math.round(duration / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes} min`
  }

  return `${hours}h ${minutes}m`
}

function getTopLevelKeys(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return []
  }

  return Object.keys(raw as Record<string, unknown>).sort()
}

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
                这里直接展示当前账号已经入库的全部 DailyMetric 和 Activity，方便你核对到底同步到了哪些日期、哪些字段、哪些活动明细。
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

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <div className="text-sm text-slate-500">当前账号</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{user.email}</div>
          </article>
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <div className="text-sm text-slate-500">每日快照数量</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{user.metrics.length}</div>
          </article>
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <div className="text-sm text-slate-500">活动记录数量</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{user.activities.length}</div>
          </article>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Daily Metrics 全量历史</h2>
              <p className="mt-2 text-sm text-slate-500">按日期倒序展示结构化指标，并保留每一天的原始 JSON。</p>
            </div>
          </div>

          {user.metrics.length > 0 ? (
            <div className="space-y-4">
              {user.metrics.map((metric) => {
                const rawKeys = getTopLevelKeys(metric.raw)

                return (
                  <article
                    className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]"
                    key={metric.id}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">{metric.date.toISOString().slice(0, 10)}</h3>
                        <p className="mt-2 text-sm text-slate-500">
                          Raw 顶层字段数：{rawKeys.length}
                          {rawKeys.length > 0 ? `，字段示例：${rawKeys.slice(0, 12).join(", ")}${rawKeys.length > 12 ? ", ..." : ""}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">睡眠评分</div>
                        <div className="mt-2 text-2xl font-semibold">{metric.sleepScore ?? "--"}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">夜间 HRV</div>
                        <div className="mt-2 text-2xl font-semibold">{metric.hrv ?? "--"}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">静息心率</div>
                        <div className="mt-2 text-2xl font-semibold">{metric.restingHr ?? "--"}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">平均压力</div>
                        <div className="mt-2 text-2xl font-semibold">{metric.stress ?? "--"}</div>
                      </div>
                    </div>

                    <details className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">展开 Raw JSON</summary>
                      <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-white p-4 text-xs text-slate-700">
                        {JSON.stringify(metric.raw, null, 2)}
                      </pre>
                    </details>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500">
              还没有 DailyMetric 数据，先回首页执行一次同步。
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Activities 全量历史</h2>
              <p className="mt-2 text-sm text-slate-500">按时间倒序展示所有已入库活动，支持展开查看每条活动原始 JSON。</p>
            </div>
          </div>

          {user.activities.length > 0 ? (
            <div className="space-y-4">
              {user.activities.map((activity) => {
                const rawKeys = getTopLevelKeys(activity.raw)

                return (
                  <article
                    className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]"
                    key={activity.id}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">{activity.name}</h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {activity.type.replaceAll("_", " ")} · {activity.date.toISOString().slice(0, 10)} · Raw 顶层字段数：{rawKeys.length}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">距离</div>
                        <div className="mt-2 text-2xl font-semibold">{formatDistance(activity.distance)}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">时长</div>
                        <div className="mt-2 text-2xl font-semibold">{formatDuration(activity.duration)}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 px-5 py-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Garmin ID</div>
                        <div className="mt-2 break-all text-base font-semibold">{activity.garminId}</div>
                      </div>
                    </div>

                    <details className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">展开 Raw JSON</summary>
                      <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-white p-4 text-xs text-slate-700">
                        {JSON.stringify(activity.raw, null, 2)}
                      </pre>
                    </details>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500">
              还没有 Activity 数据，先回首页执行一次同步。
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
