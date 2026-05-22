'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import {
  buildDailyTrendGroups,
  getBodyBatterySeries,
  getHeartRateSeries,
  getMetricDisplayValues,
  getStressSeries,
  type NumericPoint,
} from "@/lib/garmin-data"

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

type TrendGroupSectionProps = {
  title: string
  description: string
  metrics: Array<TrendCardProps & { key: string }>
  defaultOpen?: boolean
}

type InsightCard = {
  title: string
  value: string
  detail: string
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

function formatChange(value: number | null, unit = "", digits = 0) {
  if (value == null || Number.isNaN(value)) {
    return "暂无对比"
  }

  const prefix = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${prefix}${Math.abs(value).toFixed(digits)}${unit}`
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
              strokeWidth="1.5"
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

function TrendGroupSection({ title, description, metrics, defaultOpen = true }: TrendGroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <button className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{open ? "收起" : "展开"}</span>
      </button>

      {open ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <TrendCard data={metric.data} key={metric.key} subtitle={metric.subtitle} title={metric.title} unit={metric.unit} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function jsonArrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function getActivityDays(activities: ActivityItem[]) {
  return new Set(activities.map((activity) => activity.date)).size
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
              strokeWidth="1.5"
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
  const metricsAsc = useMemo(() => [...enrichedMetrics].sort((a, b) => a.date.localeCompare(b.date)), [enrichedMetrics])
  const latestMetric = enrichedMetrics[0] ?? null
  const last7Metrics = useMemo(() => metricsAsc.slice(-7), [metricsAsc])
  const previous7Metrics = useMemo(() => metricsAsc.slice(-14, -7), [metricsAsc])
  const last30Metrics = useMemo(() => metricsAsc.slice(-30), [metricsAsc])
  const last30Dates = useMemo(() => new Set(last30Metrics.map((metric) => metric.date)), [last30Metrics])
  const last30Activities = useMemo(() => activities.filter((activity) => last30Dates.has(activity.date)), [activities, last30Dates])

  const selectedMetric = enrichedMetrics.find((metric) => metric.date === selectedDate) ?? enrichedMetrics[0] ?? null
  const latestActivities = activities.slice(0, 12)

  const trendGroups = useMemo(
    () =>
      buildDailyTrendGroups(enrichedMetrics).map((group) => ({
        ...group,
        metrics: group.metrics.map((metric) => ({
          key: metric.key,
          title: metric.title,
          subtitle: `${metric.data.length} 天`,
          unit: metric.unit,
          data: metric.data,
        })),
      })),
    [enrichedMetrics]
  )

  const heartRateSeries = selectedMetric ? getHeartRateSeries(selectedMetric.raw) : []
  const stressSeries = selectedMetric ? getStressSeries(selectedMetric.raw) : []
  const bodyBatterySeries = selectedMetric ? getBodyBatterySeries(selectedMetric.raw) : []
  const overviewCards = useMemo<InsightCard[]>(
    () => [
      {
        title: "最近 7 天睡眠评分均值",
        value: formatValue(average(last7Metrics.map((metric) => metric.sleepScore)), "", 0),
        detail: `较前 7 天 ${formatChange(
          (() => {
            const current = average(last7Metrics.map((metric) => metric.sleepScore))
            const previous = average(previous7Metrics.map((metric) => metric.sleepScore))
            return current != null && previous != null ? current - previous : null
          })(),
          "",
          0
        )}`,
      },
      {
        title: "最近 7 天 HRV 均值",
        value: formatValue(average(last7Metrics.map((metric) => metric.hrv)), " ms", 0),
        detail: `较前 7 天 ${formatChange(
          (() => {
            const current = average(last7Metrics.map((metric) => metric.hrv))
            const previous = average(previous7Metrics.map((metric) => metric.hrv))
            return current != null && previous != null ? current - previous : null
          })(),
          " ms",
          0
        )}`,
      },
      {
        title: "最近 7 天步数均值",
        value: formatValue(average(last7Metrics.map((metric) => metric.steps)), "", 0),
        detail: `${getActivityDays(last30Activities)} 天有活动，近 30 天共 ${activities.length} 条活动`,
      },
      {
        title: "最近 7 天体重均值",
        value: formatValue(average(last7Metrics.map((metric) => metric.weight)), " kg", 1),
        detail: `较前 7 天 ${formatChange(
          (() => {
            const current = average(last7Metrics.map((metric) => metric.weight))
            const previous = average(previous7Metrics.map((metric) => metric.weight))
            return current != null && previous != null ? current - previous : null
          })(),
          " kg",
          1
        )}`,
      },
      {
        title: "最近 30 天覆盖率",
        value: `${last30Metrics.length}/30`,
        detail: latestMetric ? `最新同步日 ${latestMetric.date}` : "暂无同步数据",
      },
    ],
    [activities.length, last30Activities, last30Metrics.length, last7Metrics, latestMetric, previous7Metrics]
  )
  const keyTakeaways = useMemo(
    () => [
      {
        title: "恢复状态",
        content:
          average(last7Metrics.map((metric) => metric.sleepScore)) != null
            ? `最近 7 天睡眠评分均值 ${formatValue(average(last7Metrics.map((metric) => metric.sleepScore)), "", 0)}，HRV 均值 ${formatValue(
                average(last7Metrics.map((metric) => metric.hrv)),
                " ms",
                0
              )}。`
            : "最近 7 天恢复类数据仍偏少，建议先补拉后再判断趋势。",
      },
      {
        title: "心肺负荷",
        content:
          average(last7Metrics.map((metric) => metric.restingHr)) != null
            ? `最近 7 天静息心率均值 ${formatValue(average(last7Metrics.map((metric) => metric.restingHr)), " bpm", 0)}，平均压力 ${formatValue(
                average(last7Metrics.map((metric) => metric.stress)),
                "",
                0
              )}。`
            : "当前静息心率或压力样本不足，暂时无法形成稳定判断。",
      },
      {
        title: "活动节奏",
        content: `近 30 天已同步 ${last30Metrics.length} 天 Daily，记录到 ${last30Activities.length} 条活动，覆盖 ${getActivityDays(last30Activities)} 个活动日；最近 7 天强度分钟均值 ${formatValue(
          average(last7Metrics.map((metric) => metric.intensityMinutes)),
          " min",
          0
        )}。`,
      },
      {
        title: "体重趋势",
        content:
          average(last7Metrics.map((metric) => metric.weight)) != null
            ? `最近 7 天体重均值 ${formatValue(average(last7Metrics.map((metric) => metric.weight)), " kg", 1)}，可结合睡眠、HRV 与活动强度一起看恢复和负荷变化。`
            : "当前还没有稳定的体重数据样本，建议同步包含体脂秤/手动称重的日期后再观察趋势。",
      },
    ],
    [last30Activities, last30Metrics.length, last7Metrics]
  )

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
      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-cyan-700">Executive Summary</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">先看关键结论，再下钻趋势和单日详情</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                这个页面现在优先回答 3 个问题：最近状态如何、关键指标怎么变化、数据覆盖是否足够支撑判断。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href="/data/calendar"
              >
                查看数据日历
              </Link>
              <button
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={backfillLoading || ["pending", "running"].includes(backfillJob?.status ?? "")}
                onClick={handleBackfill}
                type="button"
              >
                {backfillLoading ? "创建任务中..." : ["pending", "running"].includes(backfillJob?.status ?? "") ? "补拉任务执行中" : "补拉最近 30 天"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => (
              <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5" key={card.title}>
                <div className="text-sm text-slate-500">{card.title}</div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</div>
                <div className="mt-2 text-sm text-slate-500">{card.detail}</div>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Key Takeaways</div>
          <div className="mt-4 space-y-4">
            {keyTakeaways.map((item) => (
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5" key={item.title}>
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.content}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-200 px-5 py-4 text-sm text-slate-500">
            当前账号：<span className="font-medium text-slate-700">{userEmail}</span>
          </div>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">数据健康与补拉任务</h2>
            <p className="mt-2 text-sm text-slate-500">这里看数据新鲜度、覆盖度和后台补拉执行状态，避免在图表区和操作区来回切换。</p>
          </div>
        </div>

        {backfillResult ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{backfillResult}</div> : null}

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Daily 快照</div>
            <div className="mt-2 text-lg font-semibold">{metrics.length}</div>
            <div className="mt-1 text-sm text-slate-500">最近 30 天覆盖 {last30Metrics.length}/30</div>
          </div>
          <div className="rounded-3xl bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">活动记录</div>
            <div className="mt-2 text-lg font-semibold">{activities.length}</div>
            <div className="mt-1 text-sm text-slate-500">近 30 天活动日 {getActivityDays(last30Activities)}</div>
          </div>
          <div className="rounded-3xl bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">最新同步日期</div>
            <div className="mt-2 text-lg font-semibold">{latestMetric?.date ?? "--"}</div>
            <div className="mt-1 text-sm text-slate-500">用于判断当前数据是否足够新</div>
          </div>
          <div className="rounded-3xl bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">补拉状态</div>
            <div className="mt-2 text-lg font-semibold">{backfillJob?.status ?? "idle"}</div>
            <div className="mt-1 text-sm text-slate-500">
              {backfillJob ? `${backfillJob.currentIndex}/${backfillJob.totalDates}` : "暂无后台补拉任务"}
            </div>
          </div>
        </div>

        {backfillJob ? (
          <div className="mt-4 grid gap-4 md:grid-cols-5">
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
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">最近 7 天强度均值</div>
              <div className="mt-2 text-lg font-semibold">{formatValue(average(last7Metrics.map((metric) => metric.intensityMinutes)), " min", 0)}</div>
            </div>
          </div>
        ) : null}
        {backfillJob?.message ? <div className="mt-4 text-sm text-slate-500">{backfillJob.message}</div> : null}
        {backfillJob?.lastError ? <div className="mt-2 text-sm text-rose-600">最近错误：{backfillJob.lastError}</div> : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">日级趋势图</h2>
          <p className="mt-2 text-sm text-slate-500">先用分组看整体状态，再进入单个指标。每张图都隐含了时间趋势、最新值和样本覆盖天数。</p>
        </div>
        <div className="space-y-4">
          {trendGroups.map((group, index) => (
            <TrendGroupSection
              defaultOpen={index === 0}
              description={group.description}
              key={group.key}
              metrics={group.metrics}
              title={group.title}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">单日深度分析</h2>
            <p className="mt-2 text-sm text-slate-500">当你想追某一天状态时，在这里看该日的核心指标和分时变化，不用直接啃 Raw JSON。</p>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">步数</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.steps ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">体重</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.weight != null ? `${selectedMetric.weight.toFixed(1)} kg` : "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">训练准备度</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.trainingReadiness ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">总强度分钟</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.intensityMinutes ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">中等强度</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.moderateIntensityMinutes ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">高强度</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.vigorousIntensityMinutes ?? "--"}</div>
              </article>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-sm text-slate-500">Body Battery High</div>
                <div className="mt-2 text-2xl font-semibold">{selectedMetric.bodyBatteryHigh ?? "--"}</div>
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
          <h2 className="text-2xl font-semibold tracking-tight">活动摘要</h2>
          <p className="mt-2 text-sm text-slate-500">先看活动列表确认训练记录是否到位，再决定是否补拉某些日期的活动详情。</p>

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
          <h2 className="text-2xl font-semibold tracking-tight">原始数据与字段核对</h2>
          <p className="mt-2 text-sm text-slate-500">把 Raw JSON 收到页面末尾，只在你需要校验字段或扩展解析规则时再展开。</p>
          <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-700">
              查看 {selectedMetric?.date ?? "当前日期"} Raw JSON
            </summary>
            <div className="mt-4 text-xs text-slate-500">
              顶层字段数：{getTopLevelKeys(selectedMetric?.raw).length}
              {getTopLevelKeys(selectedMetric?.raw).length > 0
                ? `（${getTopLevelKeys(selectedMetric?.raw)
                    .slice(0, 16)
                    .join(", ")}${getTopLevelKeys(selectedMetric?.raw).length > 16 ? ", ..." : ""}）`
                : ""}
            </div>
            <pre className="mt-4 max-h-[42rem] overflow-auto rounded-2xl bg-white p-4 text-xs text-slate-700">
              {selectedMetric?.raw ? JSON.stringify(selectedMetric.raw, null, 2) : "暂无"}
            </pre>
          </details>
        </article>
      </section>
    </>
  )
}
