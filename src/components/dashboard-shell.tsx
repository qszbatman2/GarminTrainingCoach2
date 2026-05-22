'use client'

import Link from "next/link"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
import { buildDailyTrendGroups, getMetricDisplayValues, type NumericPoint } from "@/lib/garmin-data"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

type MetricSnapshot = {
  id: string
  date: string
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

type ActivitySnapshot = {
  id: string
  name: string
  type: string
  distance: number | null
  duration: number | null
  date: string
  raw?: unknown
}

type DashboardShellProps = {
  userName: string
  userEmail: string
  garminEmail: string
  metrics: MetricSnapshot[]
  activities: ActivitySnapshot[]
  initialAnalysisReport: TrainingAnalysisPayload | null
}

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

function formatValue(value: number | null, unit = "", digits = 0) {
  if (value == null || Number.isNaN(value)) {
    return "--"
  }

  return `${value.toFixed(digits)}${unit}`
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (numbers.length === 0) {
    return null
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function buildPolyline(data: NumericPoint[]) {
  if (data.length === 0) {
    return ""
  }

  const min = Math.min(...data.map((item) => item.value))
  const max = Math.max(...data.map((item) => item.value))
  const range = max - min || 1

  return data
    .map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100
      const y = 100 - ((item.value - min) / range) * 100
      return `${x},${y}`
    })
    .join(" ")
}

function getStatusLabel(
  type: "recovery" | "load" | "risk",
  value?: TrainingAnalysisPayload["analysis"]["recoveryStatus"] | TrainingAnalysisPayload["analysis"]["loadStatus"] | TrainingAnalysisPayload["analysis"]["riskLevel"]
) {
  if (!value) {
    return "--"
  }

  if (type === "recovery") {
    return value === "good" ? "恢复良好" : value === "moderate" ? "恢复一般" : "恢复偏弱"
  }

  if (type === "load") {
    return value === "balanced" ? "负荷平衡" : value === "low" ? "负荷偏低" : "负荷偏高"
  }

  return value === "low" ? "风险较低" : value === "medium" ? "风险中等" : "风险偏高"
}

function MiniTrendCard({
  title,
  subtitle,
  unit,
  data,
}: {
  title: string
  subtitle: string
  unit: string
  data: NumericPoint[]
}) {
  const latest = data[data.length - 1]?.value ?? null
  const polyline = buildPolyline(data)

  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{latest ?? "--"}</div>
        {latest != null ? <div className="pb-1 text-sm text-slate-400">{unit}</div> : null}
      </div>
      <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
      {data.length >= 2 ? (
        <>
          <svg className="mt-5 h-24 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polyline
              fill="none"
              points={polyline}
              stroke="rgb(14 165 233)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{data[0]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-3xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">样本不足，暂不展示趋势。</div>
      )}
    </article>
  )
}

export function DashboardShell({
  userName,
  userEmail,
  garminEmail,
  metrics,
  activities,
  initialAnalysisReport,
}: DashboardShellProps) {
  const router = useRouter()
  const [bindingEmail, setBindingEmail] = useState(garminEmail)
  const [bindingPassword, setBindingPassword] = useState("")
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split("T")[0])
  const [bindingLoading, setBindingLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [bindingMessage, setBindingMessage] = useState("")
  const [syncResult, setSyncResult] = useState("")

  const hasGarminBinding = garminEmail.trim().length > 0
  const enrichedMetrics = useMemo(
    () =>
      metrics.map((metric) => ({
        ...metric,
        ...getMetricDisplayValues(metric.raw),
      })),
    [metrics]
  )
  const metricsAsc = useMemo(() => [...enrichedMetrics].sort((a, b) => a.date.localeCompare(b.date)), [enrichedMetrics])
  const latestMetric = enrichedMetrics[0] ?? null
  const recentMetrics = useMemo(() => metricsAsc.slice(-7), [metricsAsc])
  const trendGroups = useMemo(() => buildDailyTrendGroups(enrichedMetrics), [enrichedMetrics])
  const trendHighlights = useMemo(() => {
    const allMetrics = trendGroups.flatMap((group) => group.metrics)
    return ["sleepScore", "hrv", "steps"]
      .map((key) => allMetrics.find((item) => item.key === key))
      .filter((item): item is (typeof allMetrics)[number] => Boolean(item))
  }, [trendGroups])
  const statusCards = useMemo(
    () => [
      {
        label: "最新睡眠评分",
        value: latestMetric?.sleepScore ?? null,
        unit: "",
        detail: latestMetric ? `同步日期 ${latestMetric.date}` : "等待首条 Daily 数据",
      },
      {
        label: "最新夜间 HRV",
        value: latestMetric?.hrv ?? null,
        unit: " ms",
        detail: `最近 7 天均值 ${formatValue(average(recentMetrics.map((metric) => metric.hrv)), " ms", 0)}`,
      },
      {
        label: "训练准备度",
        value: latestMetric?.trainingReadiness ?? null,
        unit: "",
        detail: `最近 7 天均值 ${formatValue(average(recentMetrics.map((metric) => metric.trainingReadiness)), "", 0)}`,
      },
      {
        label: "Body Battery 高点",
        value: latestMetric?.bodyBatteryHigh ?? null,
        unit: "",
        detail: `最近 7 天均值 ${formatValue(average(recentMetrics.map((metric) => metric.bodyBatteryHigh)), "", 0)}`,
      },
    ],
    [latestMetric, recentMetrics]
  )

  async function handleSaveBinding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBindingLoading(true)
    setBindingMessage("")

    try {
      const response = await fetch("/api/garmin-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garminEmail: bindingEmail,
          garminPassword: bindingPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "保存失败")
      }

      setBindingMessage("Garmin 账号已绑定，主页将切换为 AI 分析与身体状态概览。")
      setBindingPassword("")
      router.refresh()
    } catch (error: unknown) {
      setBindingMessage(error instanceof Error ? error.message : "保存失败")
    } finally {
      setBindingLoading(false)
    }
  }

  async function handleSync(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSyncLoading(true)
    setSyncResult("")

    try {
      const response = await fetch("/api/garmin-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: syncDate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "同步失败")
      }

      setSyncResult(`同步完成：写入 1 条每日快照，活动 ${data.activitiesCount} 条。`)
      router.refresh()
    } catch (error: unknown) {
      setSyncResult(error instanceof Error ? error.message : "同步失败")
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08101d_0%,#0d1526_34%,#eef2f8_34%,#f5f7fb_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(95,230,255,0.22),_transparent_30%),linear-gradient(135deg,#0f1a2e,#0b1018)] p-8 text-white shadow-[0_20px_80px_rgba(8,16,29,0.35)]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Training Dashboard</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl">
                {hasGarminBinding ? `${userName}，先看 AI 结论，再看身体状态和趋势变化。` : `${userName}，先完成 Garmin 绑定，再解锁你的训练分析首页。`}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                当前登录账号：{userEmail}。
                {hasGarminBinding
                  ? ` 已绑定 Garmin 账号 ${garminEmail}，首页现在只保留 AI 分析、关键身体状态和趋势入口。`
                  : " 完成绑定后，系统才会开始同步 Daily 与活动数据，并生成 AI 分析和趋势洞察。"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {hasGarminBinding ? (
                <>
                  <Link
                    className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-300/20"
                    href="/data"
                  >
                    查看数据分析
                  </Link>
                  <Link
                    className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                    href="/data/sync"
                  >
                    查看同步状态
                  </Link>
                </>
              ) : null}
              <button
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                onClick={() => signOut({ callbackUrl: "/" })}
                type="button"
              >
                退出登录
              </button>
            </div>
          </div>
        </section>

        {!hasGarminBinding ? (
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="text-xs uppercase tracking-[0.25em] text-cyan-700">Binding Flow</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">先绑定 Garmin，再进入 AI 分析闭环</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  { title: "1. 保存账号", detail: "保存 Garmin 邮箱和密码，后续同步复用已绑定凭证。" },
                  { title: "2. 拉取首批数据", detail: "绑定完成后去同步页触发首日同步或最近 30 天补拉。" },
                  { title: "3. 查看分析", detail: "系统会把 Daily、活动和 AI 结论整理成首页与数据分析页。" },
                ].map((item) => (
                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5" key={item.title}>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">绑定 Garmin 账号</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">未绑定前，首页只保留绑定入口，避免把空数据和操作状态混在一起。</p>
                </div>
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">第一步</span>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSaveBinding}>
                <div>
                  <label className="mb-2 block text-sm text-slate-500">Garmin 邮箱</label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                    onChange={(event) => setBindingEmail(event.target.value)}
                    placeholder="you@garmin.com"
                    required
                    type="email"
                    value={bindingEmail}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-500">Garmin 密码</label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                    onChange={(event) => setBindingPassword(event.target.value)}
                    placeholder="输入 Garmin 密码"
                    required
                    type="password"
                    value={bindingPassword}
                  />
                </div>

                {bindingMessage ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{bindingMessage}</div>
                ) : null}

                <button
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={bindingLoading}
                  type="submit"
                >
                  {bindingLoading ? "保存中..." : "保存 Garmin 绑定"}
                </button>
              </form>
            </article>
          </section>
        ) : null}

        {hasGarminBinding ? (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-violet-600">AI Focus</div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">今天先回答三个问题：恢复如何、负荷是否平衡、接下来该怎么练。</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                      首页把绑定完成后的主要信息收敛为 AI 结论、关键身体状态和短期趋势；更细的数据钻取与同步任务拆到独立页面。
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5">
                    <div className="text-sm text-slate-500">恢复判断</div>
                    <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      {getStatusLabel("recovery", initialAnalysisReport?.analysis.recoveryStatus)}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      最近 7 天睡眠均值 {formatValue(initialAnalysisReport?.context.recovery.sleepScore7dAvg ?? null)}
                    </div>
                  </article>
                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5">
                    <div className="text-sm text-slate-500">负荷判断</div>
                    <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      {getStatusLabel("load", initialAnalysisReport?.analysis.loadStatus)}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      急慢比 {formatValue(initialAnalysisReport?.context.load.acuteChronicRatio ?? null, "", 2)}
                    </div>
                  </article>
                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5">
                    <div className="text-sm text-slate-500">风险判断</div>
                    <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      {getStatusLabel("risk", initialAnalysisReport?.analysis.riskLevel)}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      最新数据 {latestMetric ? latestMetric.date : "尚未同步"}
                    </div>
                  </article>
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Actions</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">同步入口与页面跳转</h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">把同步、补拉和任务状态抽离到独立页面，首页只保留高频动作。</p>

                <form className="mt-6 space-y-4" onSubmit={handleSync}>
                  <div>
                    <label className="mb-2 block text-sm text-slate-500">同步日期</label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                      onChange={(event) => setSyncDate(event.target.value)}
                      required
                      type="date"
                      value={syncDate}
                    />
                  </div>

                  {syncResult ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{syncResult}</div> : null}

                  <button
                    className="w-full rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={syncLoading}
                    type="submit"
                  >
                    {syncLoading ? "同步中..." : "同步指定日期"}
                  </button>
                </form>

                <div className="mt-4 grid gap-3">
                  <Link
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    href="/data"
                  >
                    进入数据分析页
                  </Link>
                  <Link
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    href="/data/sync"
                  >
                    进入同步状态页
                  </Link>
                </div>
              </article>
            </section>

            {latestMetric ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">关键身体状态</h2>
                  <p className="mt-2 text-sm text-slate-500">优先展示会直接影响训练决策的恢复与储备指标。</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {statusCards.map((card) => (
                    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]" key={card.label}>
                      <div className="text-sm text-slate-500">{card.label}</div>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-4xl font-semibold tracking-tight">{card.value ?? "--"}</span>
                        <span className="pb-1 text-sm text-slate-400">{card.unit}</span>
                      </div>
                      <div className="mt-4 text-sm text-slate-500">{card.detail}</div>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)]">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">账号已绑定，下一步同步首份数据</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">
                  当前还没有 Daily 快照和活动记录，所以首页暂时无法生成 AI 分析与趋势。先同步一个日期，或去同步状态页发起最近 30 天补拉。
                </p>
              </section>
            )}

            {trendHighlights.length > 0 ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">近期趋势</h2>
                  <p className="mt-2 text-sm text-slate-500">主页只展示最核心的 3 个趋势，完整图表留给数据分析页。</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  {trendHighlights.map((metric) => (
                    <MiniTrendCard data={metric.data} key={metric.key} subtitle={`${metric.data.length} 天样本`} title={metric.title} unit={metric.unit} />
                  ))}
                </div>
              </section>
            ) : null}

            {metrics.length > 0 ? <AITrainingReport initialReport={initialAnalysisReport} /> : null}

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">最近活动</h2>
                  <p className="mt-2 text-sm text-slate-500">首页保留最近训练摘要，详细指标和原始数据放到数据分析页。</p>
                </div>
                <Link className="text-sm font-medium text-cyan-700 transition hover:text-cyan-600" href="/data">
                  查看完整分析
                </Link>
              </div>

              <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
                <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr] bg-slate-50 px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>活动</span>
                  <span>距离</span>
                  <span>时长</span>
                  <span>日期</span>
                </div>
                {activities.slice(0, 6).length > 0 ? (
                  activities.slice(0, 6).map((activity) => (
                    <div
                      className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr] border-t border-slate-100 px-5 py-4 text-sm text-slate-700"
                      key={activity.id}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{activity.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{activity.type.replaceAll("_", " ")}</div>
                      </div>
                      <span>{formatDistance(activity.distance)}</span>
                      <span>{formatDuration(activity.duration)}</span>
                      <span>{activity.date}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-sm text-slate-500">还没有活动记录，先同步首条数据。</div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
