'use client'

import Link from "next/link"
import { useMemo, useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
import { MetricTile, SurfaceCard } from "@/components/design-system"
import {
  buildDailyTrendGroups,
  getBodyBatterySeries,
  getHeartRateSeries,
  getMetricDisplayValues,
  getStressSeries,
  type NumericPoint,
} from "@/lib/garmin-data"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

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
  initialAnalysisReport: TrainingAnalysisPayload | null
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
    <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.24)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-400">{title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {latest ?? "--"}
            {latest != null ? <span className="ml-2 text-sm text-slate-500">{unit}</span> : null}
          </div>
        </div>
        <div className="text-xs text-slate-500">{subtitle}</div>
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
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{data[0]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">至少需要 2 个数据点才会绘制趋势图</div>
      )}
    </article>
  )
}

function TrendGroupSection({ title, description, metrics }: TrendGroupSectionProps) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.24)] backdrop-blur-xl">
      <div>
        <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <TrendCard data={metric.data} key={metric.key} subtitle={metric.subtitle} title={metric.title} unit={metric.unit} />
        ))}
      </div>
    </section>
  )
}

function DetailChart({ title, unit, data }: { title: string; unit: string; data: NumericPoint[] }) {
  const polyline = buildPolyline(data)

  return (
    <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.24)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm text-slate-400">
            {data.length > 0 ? `已解析 ${data.length} 个时间点` : "当前原始数据里没有解析出可绘图时间序列"}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">{unit}</span>
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
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">这一天暂时没有可用的分时数据。</div>
      )}
    </article>
  )
}

export function DataExplorer({ userEmail, metrics, activities, initialAnalysisReport }: DataExplorerProps) {
  const [selectedDate, setSelectedDate] = useState(metrics[0]?.date ?? "")
  const [selectedTrendGroupKey, setSelectedTrendGroupKey] = useState("")
  const [selectedDetailChart, setSelectedDetailChart] = useState<"heartRate" | "stress" | "bodyBattery">("heartRate")
  const [validationTab, setValidationTab] = useState<"activities" | "raw">("activities")

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
  const last7Metrics = useMemo(() => metricsAsc.slice(-7), [metricsAsc])
  const previous7Metrics = useMemo(() => metricsAsc.slice(-14, -7), [metricsAsc])
  const last30Metrics = useMemo(() => metricsAsc.slice(-30), [metricsAsc])

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
  const numberAverage = (values: Array<number | null | undefined>) => {
    const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    if (valid.length === 0) {
      return null
    }

    return valid.reduce((sum, value) => sum + value, 0) / valid.length
  }
  const formatMetric = (value: number | null, suffix = "", digits = 0) => {
    if (value == null || Number.isNaN(value)) {
      return "--"
    }

    return `${value.toFixed(digits)}${suffix}`
  }
  const formatDelta = (current: number | null, previous: number | null, suffix = "", digits = 0) => {
    if (current == null || previous == null) {
      return "暂无对比"
    }

    const delta = current - previous
    const prefix = delta > 0 ? "+" : delta < 0 ? "-" : ""
    return `${prefix}${Math.abs(delta).toFixed(digits)}${suffix}`
  }
  const analysisEvidence = [
    {
      label: "7 天睡眠均值",
      value: formatMetric(numberAverage(last7Metrics.map((metric) => metric.sleepScore))),
      detail: `较前 7 天 ${formatDelta(numberAverage(last7Metrics.map((metric) => metric.sleepScore)), numberAverage(previous7Metrics.map((metric) => metric.sleepScore)))}`,
    },
    {
      label: "7 天 HRV 均值",
      value: formatMetric(numberAverage(last7Metrics.map((metric) => metric.hrv)), " ms"),
      detail: `较前 7 天 ${formatDelta(numberAverage(last7Metrics.map((metric) => metric.hrv)), numberAverage(previous7Metrics.map((metric) => metric.hrv)), " ms")}`,
    },
    {
      label: "7 天静息心率",
      value: formatMetric(numberAverage(last7Metrics.map((metric) => metric.restingHr)), " bpm"),
      detail: `平均压力 ${formatMetric(numberAverage(last7Metrics.map((metric) => metric.stress)))}`,
    },
    {
      label: "30 天覆盖率",
      value: `${last30Metrics.length}/30`,
      detail: metrics[0] ? `最新同步日 ${metrics[0].date}` : "暂无同步数据",
    },
  ]
  const selectedTrendGroup = trendGroups.find((group) => group.key === selectedTrendGroupKey) ?? trendGroups[0] ?? null
  const selectedChart = {
    heartRate: { title: `${selectedMetric?.date ?? "--"} 心率分时图`, unit: "bpm", data: heartRateSeries },
    stress: { title: `${selectedMetric?.date ?? "--"} 压力分时图`, unit: "", data: stressSeries },
    bodyBattery: { title: `${selectedMetric?.date ?? "--"} Body Battery 分时图`, unit: "", data: bodyBatterySeries },
  }[selectedDetailChart]

  return (
    <>
      <AITrainingReport initialReport={initialAnalysisReport} />

      <SurfaceCard className="p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Trend Workspace</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">趋势工作台</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">一次只看一个业务分组，把恢复、负荷、活动趋势收进同一个工作区。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]" href="/data/calendar">
              查看数据日历
            </Link>
            <Link className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200" href="/data/sync">
              查看同步状态
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {trendGroups.map((group) => (
            <button
              className={`rounded-full px-4 py-2 text-sm transition ${
                group.key === selectedTrendGroup?.key ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
              }`}
              key={group.key}
              onClick={() => setSelectedTrendGroupKey(group.key)}
              type="button"
            >
              {group.title}
            </button>
          ))}
        </div>
        {selectedTrendGroup ? <TrendGroupSection description={selectedTrendGroup.description} metrics={selectedTrendGroup.metrics} title={selectedTrendGroup.title} /> : null}
      </SurfaceCard>

      <SurfaceCard className="p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Daily Workbench</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">单日分析</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">把当日指标和分时图放进一个工作台，不再分散成多张卡。</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">当前账号 {userEmail}</div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {enrichedMetrics.slice(0, 12).map((metric) => (
            <button
              className={`rounded-full px-4 py-2 text-sm transition ${
                metric.date === selectedMetric?.date ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
              }`}
              key={metric.id}
              onClick={() => setSelectedDate(metric.date)}
              type="button"
            >
              {metric.date}
            </button>
          ))}
        </div>

        {selectedMetric ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <MetricTile detail="恢复质量" label="睡眠评分" value={`${selectedMetric.sleepScore ?? "--"}`} />
              <MetricTile detail="自主神经恢复" label="HRV" value={selectedMetric.hrv != null ? `${selectedMetric.hrv} ms` : "--"} />
              <MetricTile detail="压力水平" label="压力" value={`${selectedMetric.stress ?? "--"}`} />
              <MetricTile detail="训练 readiness 信号" label="训练准备度" value={`${selectedMetric.trainingReadiness ?? "--"}`} />
              <MetricTile detail="总训练负荷" label="总强度分钟" value={`${selectedMetric.intensityMinutes ?? "--"}`} />
              <MetricTile detail="Body Battery 峰值" label="Body Battery" value={`${selectedMetric.bodyBatteryHigh ?? "--"}`} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { key: "heartRate", label: "心率" },
                { key: "stress", label: "压力" },
                { key: "bodyBattery", label: "Body Battery" },
              ].map((item) => (
                <button
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    item.key === selectedDetailChart ? "bg-white text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                  }`}
                  key={item.key}
                  onClick={() => setSelectedDetailChart(item.key as "heartRate" | "stress" | "bodyBattery")}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <DetailChart data={selectedChart.data} title={selectedChart.title} unit={selectedChart.unit} />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[1.75rem] border border-dashed border-white/12 bg-white/[0.04] px-6 py-12 text-center text-sm text-slate-400">
            还没有可分析的每日数据。
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Validation Center</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">验证信息</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "activities", label: "活动记录" },
              { key: "raw", label: "Raw JSON" },
            ].map((item) => (
              <button
                className={`rounded-full px-4 py-2 text-sm transition ${
                  item.key === validationTab ? "bg-white text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                }`}
                key={item.key}
                onClick={() => setValidationTab(item.key as "activities" | "raw")}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {validationTab === "activities" ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] bg-white/[0.04] px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
              <span>活动</span>
              <span>距离</span>
              <span>时长</span>
              <span>日期</span>
            </div>
            {latestActivities.length > 0 ? (
              latestActivities.map((activity) => (
                <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] border-t border-white/8 px-5 py-4 text-sm text-slate-300" key={activity.id}>
                  <div>
                    <div className="font-medium text-white">{activity.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{activity.type.replaceAll("_", " ")}</div>
                  </div>
                  <span>{formatDistance(activity.distance)}</span>
                  <span>{formatDuration(activity.duration)}</span>
                  <span>{activity.date}</span>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-slate-400">还没有活动记录。</div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs text-slate-400">
              顶层字段数：{getTopLevelKeys(selectedMetric?.raw).length}
              {getTopLevelKeys(selectedMetric?.raw).length > 0
                ? `（${getTopLevelKeys(selectedMetric?.raw)
                    .slice(0, 16)
                    .join(", ")}${getTopLevelKeys(selectedMetric?.raw).length > 16 ? ", ..." : ""}）`
                : ""}
            </div>
            <pre className="mt-4 max-h-[42rem] overflow-auto rounded-2xl bg-[#040b14] p-4 text-xs text-slate-300">
              {selectedMetric?.raw ? JSON.stringify(selectedMetric.raw, null, 2) : "暂无"}
            </pre>
          </div>
        )}
      </SurfaceCard>
    </>
  )
}
