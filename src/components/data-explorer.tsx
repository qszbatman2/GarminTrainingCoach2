'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { getBodyBatterySeries, getHeartRateSeries, getMetricDisplayValues, getStressSeries, type NumericPoint } from "@/lib/garmin-data"

type MetricItem = {
  id: string
  date: string
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

type ActivityItem = {
  id: string
  garminId: string
  name: string
  type: string
  distance: number | null
  duration: number | null
  date: string
  raw: unknown
}

type DataExplorerProps = {
  userEmail: string
  metrics: MetricItem[]
  activities: ActivityItem[]
  initialBackfillJob: BackfillJobSnapshot | null
}

type BackfillJobSnapshot = {
  id: string
  status: string
  totalDates: number
  currentIndex: number
  syncedDates: unknown
  skippedDates: unknown
  failedDates: unknown
  message: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  heartbeatAt?: string | null
}

type TrendCardProps = {
  title: string
  subtitle: string
  unit: string
  data: NumericPoint[]
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

function getTopLevelKeys(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return []
  }

  return Object.keys(raw as Record<string, unknown>).sort()
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

function TrendCard({ title, subtitle, unit, data }: TrendCardProps) {
  const latest = data[data.length - 1]?.value ?? null
  const polyline = buildPolyline(data)

  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            {latest ?? "--"}
            {latest != null ? <span className="ml-2 text-sm text-slate-400">{unit}</span> : null}
          </div>
        </div>
        <div className="text-xs text-slate-400">{subtitle}</div>
      </div>

      {data.length >= 2 ? (
        <>
          <svg className="mt-6 h-28 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polyline
              fill="none"
              points={polyline}
              stroke="rgb(8 145 178)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          </svg>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{data[0]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-3xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">至少需要 2 个数据点才会绘制趋势图</div>
      )}
    </article>
  )
}

function jsonArrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function DetailChart({ title, unit, data }: { title: string; unit: string; data: NumericPoint[] }) {
  const polyline = buildPolyline(data)

  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {data.length > 0 ? `已解析 ${data.length} 个时间点` : "当前原始数据里没有解析出可绘图时间序列"}
          </p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500">{unit}</span>
      </div>

      {data.length >= 2 ? (
        <>
          <svg className="mt-6 h-44 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polyline
              fill="none"
              points={polyline}
              stroke="rgb(14 165 233)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">这一天暂时没有可用的分时数据。</div>
      )}
    </article>
  )
}

export function DataExplorer({ userEmail, metrics, activities, initialBackfillJob }: DataExplorerProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(metrics[0]?.date ?? "")
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState("")
  const [backfillJob, setBackfillJob] = useState<BackfillJobSnapshot | null>(initialBackfillJob)

  const enrichedMetrics = useMemo(
    () =>
      metrics.map((metric) => {
        const extra = getMetricDisplayValues(metric.raw)
        return {
          ...metric,
          ...extra,
        }
      }),
    [metrics]
  )

  const selectedMetric = enrichedMetrics.find((metric) => metric.date === selectedDate) ?? enrichedMetrics[0] ?? null
  const latestActivities = activities.slice(0, 12)

  const trendCards = useMemo(
    () => [
      {
        title: "睡眠评分趋势",
        subtitle: `${enrichedMetrics.length} 天`,
        unit: "",
        data: enrichedMetrics
          .filter((metric) => metric.sleepScore != null)
          .map((metric) => ({ label: metric.date.slice(5), value: Number(metric.sleepScore) })),
      },
      {
        title: "夜间 HRV 趋势",
        subtitle: `${enrichedMetrics.length} 天`,
        unit: "ms",
        data: enrichedMetrics.filter((metric) => metric.hrv != null).map((metric) => ({ label: metric.date.slice(5), value: Number(metric.hrv) })),
      },
      {
        title: "静息心率趋势",
        subtitle: `${enrichedMetrics.length} 天`,
        unit: "bpm",
        data: enrichedMetrics
          .filter((metric) => metric.restingHr != null)
          .map((metric) => ({ label: metric.date.slice(5), value: Number(metric.restingHr) })),
      },
      {
        title: "平均压力趋势",
        subtitle: `${enrichedMetrics.length} 天`,
        unit: "",
        data: enrichedMetrics
          .filter((metric) => metric.stress != null)
          .map((metric) => ({ label: metric.date.slice(5), value: Number(metric.stress) })),
      },
      {
        title: "步数趋势",
        subtitle: `${enrichedMetrics.length} 天`,
        unit: "steps",
        data: enrichedMetrics.filter((metric) => metric.steps != null).map((metric) => ({ label: metric.date.slice(5), value: Number(metric.steps) })),
      },
      {
        title: "训练准备度趋势",
        subtitle: `${enrichedMetrics.length} 天`,
        unit: "",
        data: enrichedMetrics
          .filter((metric) => metric.trainingReadiness != null)
          .map((metric) => ({ label: metric.date.slice(5), value: Number(metric.trainingReadiness) })),
      },
    ],
    [enrichedMetrics]
  )

  const heartRateSeries = selectedMetric ? getHeartRateSeries(selectedMetric.raw) : []
  const stressSeries = selectedMetric ? getStressSeries(selectedMetric.raw) : []
  const bodyBatterySeries = selectedMetric ? getBodyBatterySeries(selectedMetric.raw) : []

  useEffect(() => {
    if (!backfillJob || !["pending", "running"].includes(backfillJob.status)) {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/garmin-backfill/${backfillJob.id}`, {
          cache: "no-store",
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "获取任务状态失败")
        }

        setBackfillJob(data.job)

        if (!["pending", "running"].includes(data.job?.status ?? "")) {
          router.refresh()
        }
      } catch {
        window.clearInterval(timer)
      }
    }, 3000)

    return () => window.clearInterval(timer)
  }, [backfillJob, router])

  async function handleBackfill() {
    setBackfillLoading(true)
    setBackfillResult("")

    try {
      const response = await fetch("/api/garmin-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "补拉失败")
      }

      setBackfillJob(data.job)
      setBackfillResult(data.job?.message || "后台补拉任务已创建，服务端开始执行。")
    } catch (error: unknown) {
      setBackfillResult(error instanceof Error ? error.message : "补拉失败")
    } finally {
      setBackfillLoading(false)
    }
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="text-sm text-slate-500">当前账号</div>
          <div className="mt-3 break-all text-2xl font-semibold tracking-tight">{userEmail}</div>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="text-sm text-slate-500">每日快照</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{metrics.length}</div>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="text-sm text-slate-500">活动记录</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{activities.length}</div>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="text-sm text-slate-500">最近同步日期</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{metrics[0]?.date ?? "--"}</div>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">补拉缺失/不完整数据</h2>
            <p className="mt-2 text-sm text-slate-500">点击后先创建任务，随后由服务端分批执行；即使你切页面，任务也会继续，回来后仍能看到进度。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              href="/data/calendar"
            >
              查看数据日历
            </Link>
            <button
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={backfillLoading || ["pending", "running"].includes(backfillJob?.status ?? "")}
              onClick={handleBackfill}
              type="button"
            >
              {backfillLoading ? "创建任务中..." : ["pending", "running"].includes(backfillJob?.status ?? "") ? "补拉任务执行中" : "一键补拉最近 30 天"}
            </button>
          </div>
        </div>

        {backfillResult ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{backfillResult}</div> : null}

        {backfillJob ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">任务状态</div>
              <div className="mt-2 text-lg font-semibold">{backfillJob.status}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">进度</div>
              <div className="mt-2 text-lg font-semibold">
                {backfillJob.currentIndex}/{backfillJob.totalDates}
              </div>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">已补成功</div>
              <div className="mt-2 text-lg font-semibold">{jsonArrayCount(backfillJob.syncedDates)}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">失败日期</div>
              <div className="mt-2 text-lg font-semibold">{jsonArrayCount(backfillJob.failedDates)}</div>
            </div>
          </div>
        ) : null}
        {backfillJob?.message ? <div className="mt-4 text-sm text-slate-500">{backfillJob.message}</div> : null}
        {backfillJob?.lastError ? <div className="mt-2 text-sm text-rose-600">最近错误：{backfillJob.lastError}</div> : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">日级趋势图</h2>
          <p className="mt-2 text-sm text-slate-500">把已经同步到库里的关键恢复指标整理成按天可读的趋势图。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trendCards.map((card) => (
            <TrendCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">分时明细图</h2>
            <p className="mt-2 text-sm text-slate-500">从单日 raw 数据里解析心率、压力、Body Battery 的时间序列，先把原本不可读的 JSON 转成图。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {enrichedMetrics.slice(0, 12).map((metric) => (
              <button
                className={`rounded-full px-4 py-2 text-sm transition ${
                  metric.date === selectedMetric?.date ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                key={metric.id}
                onClick={() => setSelectedDate(metric.date)}
                type="button"
              >
                {metric.date}
              </button>
            ))}
          </div>
        </div>

        {selectedMetric ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">步数</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.steps ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">训练准备度</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.trainingReadiness ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">Body Battery High</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.bodyBatteryHigh ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">血氧</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.bloodOxygen ?? "--"}</div>
              </article>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <DetailChart data={heartRateSeries} title={`${selectedMetric.date} 心率分时图`} unit="bpm" />
              <DetailChart data={stressSeries} title={`${selectedMetric.date} 压力分时图`} unit="" />
              <DetailChart data={bodyBatterySeries} title={`${selectedMetric.date} Body Battery 分时图`} unit="" />
            </div>
          </>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500">
            还没有可分析的每日数据。
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <h2 className="text-2xl font-semibold tracking-tight">最近活动历史</h2>
          <p className="mt-2 text-sm text-slate-500">结构化摘要放在表里，方便快速看已同步到了哪些活动。</p>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] bg-slate-50 px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>活动</span>
              <span>距离</span>
              <span>时长</span>
              <span>日期</span>
            </div>
            {latestActivities.length > 0 ? (
              latestActivities.map((activity) => (
                <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] border-t border-slate-100 px-5 py-4 text-sm text-slate-700" key={activity.id}>
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
              <div className="px-5 py-8 text-sm text-slate-500">还没有活动记录。</div>
            )}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <h2 className="text-2xl font-semibold tracking-tight">选中日期 Raw JSON</h2>
          <p className="mt-2 text-sm text-slate-500">保留原始数据，便于继续验证字段和扩展图表。</p>
          <div className="mt-4 text-xs text-slate-500">
            顶层字段数：{getTopLevelKeys(selectedMetric?.raw).length}
            {getTopLevelKeys(selectedMetric?.raw).length > 0
              ? `（${getTopLevelKeys(selectedMetric?.raw)
                  .slice(0, 16)
                  .join(", ")}${getTopLevelKeys(selectedMetric?.raw).length > 16 ? ", ..." : ""}）`
              : ""}
          </div>
          <pre className="mt-4 max-h-[42rem] overflow-auto rounded-2xl bg-slate-50 p-4 text-xs text-slate-700">
            {selectedMetric?.raw ? JSON.stringify(selectedMetric.raw, null, 2) : "暂无"}
          </pre>
        </article>
      </section>
    </>
  )
}
