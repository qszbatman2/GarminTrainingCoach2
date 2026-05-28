'use client'

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
import { AccentPill, MetricTile, SectionHeader, SubtleCard, SurfaceCard } from "@/components/design-system"
import { RecoveryCountdownCard } from "@/components/recovery-countdown-card"
import { getBodyBatterySeries, getHeartRateSeries, getMetricDisplayValues, getStressSeries, type NumericPoint } from "@/lib/garmin-data"
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
  metricTotal: number
  metrics: MetricItem[]
  activityTotal: number
  activities: ActivityItem[]
  initialAnalysisReport: TrainingAnalysisPayload | null
  trainingGoal: string
}

type DataResponse = {
  metrics: MetricItem[]
  activities: ActivityItem[]
  totals: {
    metrics: number
    activities: number
  }
}

type MetricDisplayValues = ReturnType<typeof getMetricDisplayValues>
type EnrichedMetric = MetricItem & MetricDisplayValues
type ValidationTab = "fields" | "activities" | "raw"
type DailyDetailChartKey = "heartRate" | "stress" | "bodyBattery"
type FieldGroupKey = "all" | "recovery" | "energy" | "activity" | "load"

type SleepCompositionDatum = {
  label: string
  total: number
  deep: number
  rem: number
  light: number
  awake: number
}

type RangeDatum = {
  label: string
  low: number
  high: number
}

type StackDatum = {
  label: string
  segments: Array<{ key: string; value: number; color: string }>
}

type FieldEntry = {
  key: string
  label: string
  group: Exclude<FieldGroupKey, "all">
  value: string
}

const FIELD_GROUP_OPTIONS: Array<{ key: FieldGroupKey; label: string }> = [
  { key: "all", label: "全部字段" },
  { key: "recovery", label: "恢复睡眠" },
  { key: "energy", label: "能量心率" },
  { key: "activity", label: "活动代谢" },
  { key: "load", label: "训练负荷" },
]

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const existingIds = new Set(current.map((item) => item.id))
  if (incoming.every((item) => existingIds.has(item.id))) {
    return current
  }

  return [...current, ...incoming.filter((item) => !existingIds.has(item.id))]
}

function LoadingTile({ label = "加载中" }: { label?: string }) {
  return (
    <SubtleCard className="animate-pulse p-4">
      <div className="h-4 w-20 rounded-full bg-white/10" />
      <div className="mt-4 h-8 w-28 rounded-full bg-white/10" />
      <div className="mt-3 h-3 w-24 rounded-full bg-white/10" />
      <div className="mt-3 text-xs text-slate-500">{label}</div>
    </SubtleCard>
  )
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 px-5 py-5">
      {Array.from({ length: count }).map((_, index) => (
        <div className="animate-pulse rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4" key={index}>
          <div className="h-4 w-32 rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-48 rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

function toSleepHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  return Number((value / 3600).toFixed(1))
}

function toMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  return Number(((value > 240 ? value / 60 : value)).toFixed(0))
}

function toHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  return Number(((value > 240 ? value / 3600 : value)).toFixed(1))
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (valid.length === 0) {
    return null
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function formatNumber(value: number | null | undefined, digits = 0, suffix = "") {
  if (value == null || !Number.isFinite(value)) {
    return "--"
  }

  return `${value.toFixed(digits)}${suffix}`
}

function formatDelta(current: number | null | undefined, baseline: number | null | undefined, digits = 0, suffix = "") {
  if (current == null || baseline == null || !Number.isFinite(current) || !Number.isFinite(baseline)) {
    return "暂无对比"
  }

  const delta = current - baseline
  if (Math.abs(delta) < 0.05) {
    return "基本持平"
  }

  return `${delta > 0 ? "+" : "-"}${Math.abs(delta).toFixed(digits)}${suffix}`
}

function getChartBounds(seriesList: NumericPoint[][], fixedMin?: number, fixedMax?: number) {
  const all = seriesList.flat().map((point) => point.value)
  const min = fixedMin ?? (all.length > 0 ? Math.min(...all) : 0)
  const max = fixedMax ?? (all.length > 0 ? Math.max(...all) : 100)
  const paddedMin = fixedMin ?? Math.max(0, min - (max - min || 1) * 0.12)
  const paddedMax = fixedMax ?? max + (max - min || 1) * 0.12
  return { min: paddedMin, max: paddedMax }
}

function buildLinePath(data: NumericPoint[], min: number, max: number) {
  if (data.length === 0) {
    return ""
  }

  const range = max - min || 1
  return data
    .map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100
      const y = 100 - ((item.value - min) / range) * 100
      return `${x},${clamp(y, 0, 100)}`
    })
    .join(" ")
}

function buildAreaPath(data: NumericPoint[], min: number, max: number) {
  const line = buildLinePath(data, min, max)
  if (!line) {
    return ""
  }

  return `0,100 ${line} 100,100`
}

function StackedColumnChart({
  title,
  description,
  unit,
  data,
  segments,
}: {
  title: string
  description: string
  unit: string
  data: StackDatum[]
  segments: Array<{ key: string; label: string; color: string }>
}) {
  const maxTotal = Math.max(...data.map((item) => item.segments.reduce((sum, segment) => sum + segment.value, 0)), 1)

  return (
    <SubtleCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <AccentPill tone="neutral">{unit}</AccentPill>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {segments.map((segment) => (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300" key={segment.key}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
            {segment.label}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-5 gap-2 md:grid-cols-7 xl:grid-cols-10">
        {data.map((item) => {
          const total = item.segments.reduce((sum, segment) => sum + segment.value, 0)
          return (
            <div className="flex flex-col items-center gap-2" key={item.label}>
              <div className="flex h-40 w-full items-end justify-center rounded-[1.1rem] border border-white/8 bg-[#081322] px-1.5 py-2">
                <div className="flex h-full w-8 flex-col-reverse overflow-hidden rounded-full bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                  {item.segments.map((segment) => (
                    <div
                      className="w-full"
                      key={segment.key}
                      style={{
                        height: `${Math.max((segment.value / maxTotal) * 100, segment.value > 0 ? 4 : 0)}%`,
                        backgroundColor: segment.color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-white">{formatNumber(total, total < 10 ? 1 : 0)}</div>
                <div className="mt-1 text-xs text-slate-500">{item.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </SubtleCard>
  )
}

function RangeColumnChart({
  title,
  description,
  data,
}: {
  title: string
  description: string
  data: RangeDatum[]
}) {
  return (
    <SubtleCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <AccentPill tone="violet">0-100</AccentPill>
      </div>

      <div className="mt-5 grid grid-cols-5 gap-2 md:grid-cols-7 xl:grid-cols-10">
        {data.map((item) => {
          const low = clamp(item.low, 0, 100)
          const high = clamp(item.high, 0, 100)
          const bottom = 100 - high
          const height = Math.max(high - low, 3)
          return (
            <div className="flex flex-col items-center gap-2" key={item.label}>
              <div className="relative h-44 w-full rounded-[1.1rem] border border-white/8 bg-[#081322] px-1.5 py-2">
                <div className="absolute inset-x-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-white/10" />
                <div
                  className="absolute inset-x-1/2 w-3 -translate-x-1/2 rounded-full shadow-[0_0_18px_rgba(34,211,238,0.32)]"
                  style={{
                    top: `calc(${bottom}% + 0.5rem)`,
                    height: `calc(${height}% - 0.1rem)`,
                    backgroundImage: "linear-gradient(180deg, rgba(168,85,247,0.95), rgba(34,211,238,0.95))",
                  }}
                />
                <div className="absolute inset-x-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-violet-300/60 bg-violet-300 shadow-[0_0_20px_rgba(196,181,253,0.38)]" style={{ top: `calc(${bottom}% + 0.15rem)` }} />
                <div className="absolute inset-x-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-cyan-300/60 bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.32)]" style={{ top: `calc(${100 - low}% - 0.5rem)` }} />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-white">
                  {item.low}-{item.high}
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </SubtleCard>
  )
}

function MultiLineChart({
  title,
  description,
  lines,
}: {
  title: string
  description: string
  lines: Array<{ label: string; color: string; data: NumericPoint[] }>
}) {
  const availableLines = lines.filter((line) => line.data.length > 1)
  const bounds = getChartBounds(availableLines.map((line) => line.data))

  return (
    <SubtleCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {lines.map((line) => (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300" key={line.label}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            {line.label}
          </span>
        ))}
      </div>

      {availableLines.length > 0 ? (
        <>
          <svg className="mt-5 block h-44 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M0,72 100,72" fill="none" stroke="rgba(148,163,184,0.16)" strokeDasharray="4 4" />
            <path d="M0,40 100,40" fill="none" stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" />
            {availableLines.map((line) => (
              <polyline
                fill="none"
                key={line.label}
                points={buildLinePath(line.data, bounds.min, bounds.max)}
                stroke={line.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            ))}
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{availableLines[0]?.data[0]?.label}</span>
            <span>{availableLines[0]?.data[Math.floor(availableLines[0].data.length / 2)]?.label}</span>
            <span>{availableLines[0]?.data[availableLines[0].data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">当前数据点不足，暂时无法绘制双线对比。</div>
      )}
    </SubtleCard>
  )
}

function VitalSignalRow({
  label,
  current,
  averageValue,
  suffix,
  invert = false,
  tone = "cyan",
}: {
  label: string
  current: number | null | undefined
  averageValue: number | null | undefined
  suffix: string
  invert?: boolean
  tone?: "cyan" | "violet" | "emerald" | "amber"
}) {
  const baseline = averageValue ?? current ?? 0
  const relative = baseline > 0 ? (current ?? baseline) / baseline : 1
  const width = clamp(relative * 50, 18, 100)
  const delta = current != null && averageValue != null ? current - averageValue : null
  const positive = invert ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0
  const toneClass =
    tone === "violet"
      ? "bg-violet-400"
      : tone === "emerald"
        ? "bg-emerald-400"
        : tone === "amber"
          ? "bg-amber-400"
          : "bg-cyan-400"

  return (
    <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-slate-300">{label}</div>
        <div className="text-sm text-slate-400">7 天均值 {formatNumber(averageValue, suffix === "h" ? 1 : 0, suffix ? ` ${suffix}` : "")}</div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="text-2xl font-semibold text-white">{formatNumber(current, suffix === "h" ? 1 : 0, suffix ? ` ${suffix}` : "")}</div>
        <div className={`text-sm ${delta == null ? "text-slate-500" : positive ? "text-emerald-300" : "text-rose-300"}`}>{formatDelta(current, averageValue, suffix === "h" ? 1 : 0, suffix ? ` ${suffix}` : "")}</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function TimeSeriesChart({
  title,
  description,
  unit,
  data,
  variant,
  color,
}: {
  title: string
  description: string
  unit: string
  data: NumericPoint[]
  variant: "line" | "bars" | "area"
  color: string
}) {
  const bounds = getChartBounds([data])
  const barWidth = data.length > 0 ? Math.max(1.8, 72 / data.length) : 2

  return (
    <SubtleCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <AccentPill tone="neutral">{unit || "time"}</AccentPill>
      </div>

      {data.length >= 2 ? (
        <>
          <svg className="mt-5 block h-48 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M0,76 100,76" fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="4 4" />
            <path d="M0,48 100,48" fill="none" stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
            {variant === "area" ? <polygon fill={`${color}33`} points={buildAreaPath(data, bounds.min, bounds.max)} /> : null}
            {variant === "bars"
              ? data.map((point, index) => {
                  const x = (index / Math.max(data.length - 1, 1)) * 100
                  const height = ((point.value - bounds.min) / (bounds.max - bounds.min || 1)) * 100
                  return <rect fill={color} height={Math.max(height, 2)} key={`${point.label}-${index}`} rx="1.2" width={barWidth} x={clamp(x - barWidth / 2, 0, 100 - barWidth)} y={100 - height} />
                })
              : null}
            {variant !== "bars" ? (
              <polyline fill="none" points={buildLinePath(data, bounds.min, bounds.max)} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            ) : null}
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">这一天暂时没有可用的分时数据。</div>
      )}
    </SubtleCard>
  )
}

function buildFieldEntries(metric: EnrichedMetric | null): FieldEntry[] {
  if (!metric) {
    return []
  }

  return [
    { key: "sleepScore", label: "睡眠评分", group: "recovery", value: formatNumber(metric.sleepScore) },
    { key: "sleepDurationHours", label: "睡眠时长", group: "recovery", value: formatNumber(toSleepHours(metric.sleepDurationHours), 1, " h") },
    { key: "deepSleepHours", label: "深睡", group: "recovery", value: formatNumber(toSleepHours(metric.deepSleepHours), 1, " h") },
    { key: "remSleepHours", label: "REM", group: "recovery", value: formatNumber(toSleepHours(metric.remSleepHours), 1, " h") },
    { key: "awakeDurationMinutes", label: "清醒时长", group: "recovery", value: formatNumber(toMinutes(metric.awakeDurationMinutes), 0, " min") },
    { key: "sleepInterruptions", label: "睡眠中断", group: "recovery", value: formatNumber(metric.sleepInterruptions) },
    { key: "hrv", label: "HRV", group: "recovery", value: formatNumber(metric.hrv, 0, " ms") },
    { key: "trainingReadiness", label: "训练准备度", group: "recovery", value: formatNumber(metric.trainingReadiness) },
    { key: "bodyBatteryHigh", label: "Body Battery 高点", group: "energy", value: formatNumber(metric.bodyBatteryHigh) },
    { key: "bodyBatteryLow", label: "Body Battery 低点", group: "energy", value: formatNumber(metric.bodyBatteryLow) },
    { key: "restingHr", label: "静息心率", group: "energy", value: formatNumber(metric.restingHr, 0, " bpm") },
    { key: "stress", label: "压力", group: "energy", value: formatNumber(metric.stress) },
    { key: "bloodOxygen", label: "血氧", group: "energy", value: formatNumber(metric.bloodOxygen, 0, " %") },
    { key: "respiration", label: "呼吸频率", group: "energy", value: formatNumber(metric.respiration, 0, " brpm") },
    { key: "steps", label: "步数", group: "activity", value: formatNumber(metric.steps) },
    { key: "intensityMinutes", label: "加权强度分钟", group: "activity", value: formatNumber(metric.intensityMinutes, 0, " min") },
    { key: "moderateIntensityMinutes", label: "中等强度", group: "activity", value: formatNumber(metric.moderateIntensityMinutes, 0, " min") },
    { key: "vigorousIntensityMinutes", label: "高强度", group: "activity", value: formatNumber(metric.vigorousIntensityMinutes, 0, " min") },
    { key: "activeCalories", label: "活动消耗", group: "activity", value: formatNumber(metric.activeCalories, 0, " kcal") },
    { key: "restingCalories", label: "静息消耗", group: "activity", value: formatNumber(metric.restingCalories, 0, " kcal") },
    { key: "floors", label: "爬楼层数", group: "activity", value: formatNumber(metric.floors) },
    { key: "sedentaryMinutes", label: "久坐时长", group: "activity", value: formatNumber(toMinutes(metric.sedentaryMinutes), 0, " min") },
    { key: "weight", label: "体重", group: "activity", value: formatNumber(metric.weight, 1, " kg") },
    { key: "acuteTrainingLoad", label: "急性负荷", group: "load", value: formatNumber(metric.acuteTrainingLoad) },
    { key: "chronicTrainingLoad", label: "慢性负荷", group: "load", value: formatNumber(metric.chronicTrainingLoad) },
    { key: "acuteChronicLoadRatio", label: "急慢性负荷比", group: "load", value: formatNumber(metric.acuteChronicLoadRatio, 2) },
    { key: "lowAerobicLoad", label: "低有氧负荷", group: "load", value: formatNumber(metric.lowAerobicLoad) },
    { key: "highAerobicLoad", label: "高有氧负荷", group: "load", value: formatNumber(metric.highAerobicLoad) },
    { key: "anaerobicLoad", label: "无氧负荷", group: "load", value: formatNumber(metric.anaerobicLoad) },
    { key: "recoveryHours", label: "建议恢复时长", group: "load", value: formatNumber(toHours(metric.recoveryHours), 1, " h") },
    { key: "vo2Max", label: "VO2 Max", group: "load", value: formatNumber(metric.vo2Max) },
    { key: "enduranceScore", label: "耐力分数", group: "load", value: formatNumber(metric.enduranceScore) },
    { key: "hillScore", label: "爬坡分数", group: "load", value: formatNumber(metric.hillScore) },
    { key: "runningTolerance", label: "跑步耐受", group: "load", value: formatNumber(metric.runningTolerance) },
    { key: "lactateThresholdHr", label: "乳酸阈值心率", group: "load", value: formatNumber(metric.lactateThresholdHr, 0, " bpm") },
    { key: "trainingStatusScore", label: "训练状态分", group: "load", value: formatNumber(metric.trainingStatusScore) },
  ]
}

export function DataExplorer({ userEmail, metricTotal, metrics, activityTotal, activities, initialAnalysisReport, trainingGoal }: DataExplorerProps) {
  const [metricsState, setMetricsState] = useState(metrics)
  const [activitiesState, setActivitiesState] = useState(activities)
  const [analysisReport, setAnalysisReport] = useState(initialAnalysisReport)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(metrics[0]?.date ?? "")
  const [selectedDetailChart, setSelectedDetailChart] = useState<DailyDetailChartKey>("heartRate")
  const [validationTab, setValidationTab] = useState<ValidationTab>("fields")
  const [fieldGroup, setFieldGroup] = useState<FieldGroupKey>("all")
  const [fieldSearch, setFieldSearch] = useState("")
  const metricsRequestStarted = useRef(false)
  const activitiesRequestStarted = useRef(false)

  const hasMoreMetrics = metricsState.length < metricTotal
  const hasMoreActivities = activitiesState.length < activityTotal

  useEffect(() => {
    if (!hasMoreMetrics || metricsLoading || metricsRequestStarted.current) {
      return
    }

    metricsRequestStarted.current = true
    setMetricsLoading(true)

    void fetch(`/api/data?metricOffset=${metricsState.length}&metricLimit=60&activityOffset=0&activityLimit=0`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as DataResponse | { error?: string }
        if (!response.ok) {
          throw new Error("error" in data && typeof data.error === "string" ? data.error : "加载历史 Daily 失败")
        }

        setMetricsState((current) => mergeById(current, (data as DataResponse).metrics))
      })
      .catch(() => undefined)
      .finally(() => {
        setMetricsLoading(false)
      })
  }, [hasMoreMetrics, metricsLoading, metricsState.length])

  useEffect(() => {
    if (!hasMoreActivities || activitiesLoading || activitiesRequestStarted.current) {
      return
    }

    activitiesRequestStarted.current = true
    setActivitiesLoading(true)

    void fetch(`/api/data?metricOffset=0&metricLimit=0&activityOffset=${activitiesState.length}&activityLimit=60`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as DataResponse | { error?: string }
        if (!response.ok) {
          throw new Error("error" in data && typeof data.error === "string" ? data.error : "加载历史活动失败")
        }

        setActivitiesState((current) => mergeById(current, (data as DataResponse).activities))
      })
      .catch(() => undefined)
      .finally(() => {
        setActivitiesLoading(false)
      })
  }, [activitiesLoading, activitiesState.length, hasMoreActivities])

  const enrichedMetrics = useMemo<EnrichedMetric[]>(
    () =>
      metricsState.map((metric) => ({
        ...metric,
        ...getMetricDisplayValues(metric.raw),
      })),
    [metricsState]
  )

  const metricsAsc = useMemo(() => [...enrichedMetrics].sort((a, b) => a.date.localeCompare(b.date)), [enrichedMetrics])
  const recentMetrics = useMemo(() => metricsAsc.slice(-10), [metricsAsc])
  const last7Metrics = useMemo(() => metricsAsc.slice(-7), [metricsAsc])
  const previous7Metrics = useMemo(() => metricsAsc.slice(-14, -7), [metricsAsc])
  const effectiveSelectedDate = selectedDate || metricsState[0]?.date || ""
  const selectedMetric = enrichedMetrics.find((metric) => metric.date === effectiveSelectedDate) ?? enrichedMetrics[0] ?? null
  const latestActivities = activitiesState.slice(0, Math.max(activitiesState.length, 12))

  const heartRateSeries = selectedMetric ? getHeartRateSeries(selectedMetric.raw) : []
  const stressSeries = selectedMetric ? getStressSeries(selectedMetric.raw) : []
  const bodyBatterySeries = selectedMetric ? getBodyBatterySeries(selectedMetric.raw) : []

  const sleepCompositionData = useMemo<SleepCompositionDatum[]>(
    () =>
      recentMetrics
        .map((metric) => {
          const total = toSleepHours(metric.sleepDurationHours)
          const deep = toSleepHours(metric.deepSleepHours) ?? 0
          const rem = toSleepHours(metric.remSleepHours) ?? 0
          const awake = Number((((toMinutes(metric.awakeDurationMinutes) ?? 0) / 60)).toFixed(1))
          if (total == null) {
            return null
          }

          return {
            label: metric.date.slice(5),
            total,
            deep,
            rem,
            light: Math.max(Number((total - deep - rem).toFixed(1)), 0),
            awake,
          }
        })
        .filter((item): item is SleepCompositionDatum => item !== null),
    [recentMetrics]
  )

  const bodyBatteryRangeData = useMemo<RangeDatum[]>(
    () =>
      recentMetrics
        .map((metric) => {
          if (metric.bodyBatteryHigh == null || metric.bodyBatteryLow == null) {
            return null
          }

          return {
            label: metric.date.slice(5),
            low: metric.bodyBatteryLow,
            high: metric.bodyBatteryHigh,
          }
        })
        .filter((item): item is RangeDatum => item !== null),
    [recentMetrics]
  )

  const intensityData = useMemo<StackDatum[]>(
    () =>
      recentMetrics
        .map((metric) => {
          const moderate = metric.moderateIntensityMinutes ?? 0
          const vigorous = metric.vigorousIntensityMinutes ?? 0
          if (moderate === 0 && vigorous === 0) {
            return null
          }

          return {
            label: metric.date.slice(5),
            segments: [
              { key: "moderate", value: moderate, color: "#22d3ee" },
              { key: "vigorous", value: vigorous, color: "#f97316" },
            ],
          }
        })
        .filter((item): item is StackDatum => item !== null),
    [recentMetrics]
  )

  const loadCompositionData = useMemo<StackDatum[]>(
    () =>
      recentMetrics
        .map((metric) => {
          const low = metric.lowAerobicLoad ?? 0
          const high = metric.highAerobicLoad ?? 0
          const anaerobic = metric.anaerobicLoad ?? 0
          if (low === 0 && high === 0 && anaerobic === 0) {
            return null
          }

          return {
            label: metric.date.slice(5),
            segments: [
              { key: "low", value: low, color: "#38bdf8" },
              { key: "high", value: high, color: "#8b5cf6" },
              { key: "anaerobic", value: anaerobic, color: "#f97316" },
            ],
          }
        })
        .filter((item): item is StackDatum => item !== null),
    [recentMetrics]
  )

  const acuteLoadSeries = useMemo<NumericPoint[]>(
    () =>
      recentMetrics
        .map((metric) => (metric.acuteTrainingLoad != null ? { label: metric.date.slice(5), value: metric.acuteTrainingLoad } : null))
        .filter((item): item is NumericPoint => item !== null),
    [recentMetrics]
  )

  const chronicLoadSeries = useMemo<NumericPoint[]>(
    () =>
      recentMetrics
        .map((metric) => (metric.chronicTrainingLoad != null ? { label: metric.date.slice(5), value: metric.chronicTrainingLoad } : null))
        .filter((item): item is NumericPoint => item !== null),
    [recentMetrics]
  )

  const sleepAverage = average(last7Metrics.map((metric) => toSleepHours(metric.sleepDurationHours)))
  const hrvAverage = average(last7Metrics.map((metric) => metric.hrv))
  const readinessAverage = average(last7Metrics.map((metric) => metric.trainingReadiness))
  const bodyBatteryRangeAverage = average(last7Metrics.map((metric) => (metric.bodyBatteryHigh != null && metric.bodyBatteryLow != null ? metric.bodyBatteryHigh - metric.bodyBatteryLow : null)))
  const restingHrAverage = average(last7Metrics.map((metric) => metric.restingHr))
  const stressAverage = average(last7Metrics.map((metric) => metric.stress))
  const spo2Average = average(last7Metrics.map((metric) => metric.bloodOxygen))
  const respirationAverage = average(last7Metrics.map((metric) => metric.respiration))
  const fields = useMemo(() => buildFieldEntries(selectedMetric), [selectedMetric])
  const topLevelKeys = useMemo(() => getTopLevelKeys(selectedMetric?.raw), [selectedMetric?.raw])
  const filteredFields = useMemo(
    () =>
      fields.filter((field) => {
        const matchesGroup = fieldGroup === "all" || field.group === fieldGroup
        const matchesSearch = fieldSearch.trim().length === 0 || field.label.toLowerCase().includes(fieldSearch.trim().toLowerCase())
        return matchesGroup && matchesSearch
      }),
    [fieldGroup, fieldSearch, fields]
  )

  const selectedSeriesConfig = {
    heartRate: {
      title: `${selectedMetric?.date ?? "--"} 心率节律`,
      description: "保留折线，适合连续心率波动。",
      unit: "bpm",
      data: heartRateSeries,
      variant: "line" as const,
      color: "#22d3ee",
    },
    stress: {
      title: `${selectedMetric?.date ?? "--"} 压力分布`,
      description: "改为时间柱，强调压力峰值出现在哪些时段。",
      unit: "stress",
      data: stressSeries,
      variant: "bars" as const,
      color: "#f97316",
    },
    bodyBattery: {
      title: `${selectedMetric?.date ?? "--"} Body Battery 走向`,
      description: "改为面积图，更容易看出白天消耗和夜间回充。",
      unit: "battery",
      data: bodyBatterySeries,
      variant: "area" as const,
      color: "#8b5cf6",
    },
  }[selectedDetailChart]

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <AITrainingReport initialReport={analysisReport} onReportChange={setAnalysisReport} trainingGoal={trainingGoal} />

        <div className="grid gap-4 content-start">
          <RecoveryCountdownCard className="max-w-none" report={analysisReport} title="Ready To Train" />
          <SurfaceCard className="p-5">
            <SectionHeader
              actions={
                <>
                  <Link className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]" href="/data/calendar">
                    数据日历
                  </Link>
                  <Link className="rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-200" href="/data/sync">
                    同步状态
                  </Link>
                </>
              }
              description="把导航、样本量和最新活动压缩到一个控制面板里，避免顶部再空一整行。"
              eyebrow="Data Controls"
              title="数据控制台"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricTile detail="当前已载入前端" label="Daily 样本" value={String(metricsState.length)} />
              <MetricTile detail="当前已载入前端" label="活动样本" value={String(activitiesState.length)} />
              <MetricTile detail="当前分析日期" label="选中日期" value={selectedMetric?.date ?? "--"} />
              <MetricTile detail="当前查看账号" label="用户" value={userEmail} />
            </div>
          </SurfaceCard>

          {latestActivities[0] ? (
            <SurfaceCard className="p-5">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Latest Activity</div>
              <div className="mt-3 text-xl font-semibold text-white">{latestActivities[0].name}</div>
              <div className="mt-2 text-sm text-slate-300">
                {latestActivities[0].date} · {formatDuration(latestActivities[0].duration)} · {formatDistance(latestActivities[0].distance)}
              </div>
            </SurfaceCard>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SurfaceCard className="p-5">
        <SectionHeader
          actions={
            <>
              <Link className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]" href="/data/calendar">
                查看数据日历
              </Link>
              <Link className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200" href="/data/sync">
                查看同步状态
              </Link>
            </>
          }
          description="把睡眠结构、恢复信号和当日建议聚合在一屏内，先判断恢复，再决定怎么练。"
          eyebrow="Recovery Overview"
          title="恢复总览"
        />

        <div className="mt-4 grid gap-4">
          <StackedColumnChart
            data={sleepCompositionData.map((item) => ({
              label: item.label,
              segments: [
                { key: "deep", value: item.deep, color: "#38bdf8" },
                { key: "rem", value: item.rem, color: "#8b5cf6" },
                { key: "light", value: item.light, color: "#14b8a6" },
                { key: "awake", value: item.awake, color: "#f97316" },
              ],
            }))}
            description="把深睡、REM、浅睡和清醒时间堆叠在一根柱里，不再拆成 4 张折线图。"
            segments={[
              { key: "deep", label: "深睡", color: "#38bdf8" },
              { key: "rem", label: "REM", color: "#8b5cf6" },
              { key: "light", label: "浅睡", color: "#14b8a6" },
              { key: "awake", label: "清醒", color: "#f97316" },
            ]}
            title="睡眠结构"
            unit="hours"
          />

          <SubtleCard className="p-4">
            <h3 className="text-xl font-semibold text-white">恢复信号</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">重点只看睡眠、HRV、训练准备度和电量振幅是否同步走强。</p>
            <div className="mt-4 grid gap-3">
              <VitalSignalRow label="睡眠时长" averageValue={sleepAverage} current={toSleepHours(recentMetrics[recentMetrics.length - 1]?.sleepDurationHours)} suffix="h" tone="cyan" />
              <VitalSignalRow label="HRV" averageValue={hrvAverage} current={recentMetrics[recentMetrics.length - 1]?.hrv} suffix="ms" tone="violet" />
              <VitalSignalRow label="训练准备度" averageValue={readinessAverage} current={recentMetrics[recentMetrics.length - 1]?.trainingReadiness} suffix="" tone="emerald" />
              <VitalSignalRow label="Body Battery 振幅" averageValue={bodyBatteryRangeAverage} current={recentMetrics[recentMetrics.length - 1]?.bodyBatteryHigh != null && recentMetrics[recentMetrics.length - 1]?.bodyBatteryLow != null ? recentMetrics[recentMetrics.length - 1]!.bodyBatteryHigh! - recentMetrics[recentMetrics.length - 1]!.bodyBatteryLow! : null} suffix="" tone="amber" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <MetricTile
                detail={`较前 7 天 ${formatDelta(average(last7Metrics.map((metric) => metric.sleepScore)), average(previous7Metrics.map((metric) => metric.sleepScore)))}`}
                label="近 7 天睡眠评分"
                value={formatNumber(average(last7Metrics.map((metric) => metric.sleepScore)))}
              />
              <MetricTile
                detail={`较前 7 天 ${formatDelta(average(last7Metrics.map((metric) => metric.hrv)), average(previous7Metrics.map((metric) => metric.hrv)), 0, " ms")}`}
                label="近 7 天 HRV"
                value={formatNumber(average(last7Metrics.map((metric) => metric.hrv)), 0, " ms")}
              />
            </div>
          </SubtleCard>
        </div>
      </SurfaceCard>

        <div className="grid gap-4">
        <SurfaceCard className="p-5">
          <SectionHeader description="用高低点区间看全天 Body Battery 振幅，比两条独立折线更接近真实恢复体验。" eyebrow="Energy Window" title="能量与压力" />
          <div className="mt-4">
            <RangeColumnChart data={bodyBatteryRangeData} description="每天一根区间柱，顶部是高点，底部是低点，中间的振幅代表白天消耗与夜间回充。" title="Body Battery 高低点" />
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <SectionHeader description="把心率、压力、血氧和呼吸都改成信号条，快速判断今天是否偏离常态。" eyebrow="Vitals" title="生命体征速览" />
          <div className="mt-4 grid gap-3">
            <VitalSignalRow averageValue={restingHrAverage} current={recentMetrics[recentMetrics.length - 1]?.restingHr} invert label="静息心率" suffix="bpm" tone="amber" />
            <VitalSignalRow averageValue={stressAverage} current={recentMetrics[recentMetrics.length - 1]?.stress} invert label="压力" suffix="" tone="amber" />
            <VitalSignalRow averageValue={spo2Average} current={recentMetrics[recentMetrics.length - 1]?.bloodOxygen} label="血氧" suffix="%" tone="emerald" />
            <VitalSignalRow averageValue={respirationAverage} current={recentMetrics[recentMetrics.length - 1]?.respiration} invert label="呼吸频率" suffix="brpm" tone="violet" />
          </div>
        </SurfaceCard>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <SurfaceCard className="p-5">
        <SectionHeader description="把训练量、训练结构和负荷趋势拆成不同图形，各自回答不同的问题。" eyebrow="Training Load" title="训练负荷" />
        <div className="mt-4 grid gap-4">
          <StackedColumnChart
            data={intensityData}
            description="改成中高强度堆叠柱，先看总量，再看结构。"
            segments={[
              { key: "moderate", label: "中等强度", color: "#22d3ee" },
              { key: "vigorous", label: "高强度", color: "#f97316" },
            ]}
            title="中高强度分钟"
            unit="minutes"
          />
          <MultiLineChart
            description="连续趋势仍然适合线图，这里保留双线，专门用来看急性负荷是否偏离慢性底盘。"
            lines={[
              { label: "急性负荷", color: "#22d3ee", data: acuteLoadSeries },
              { label: "慢性负荷", color: "#8b5cf6", data: chronicLoadSeries },
            ]}
            title="急慢性负荷"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <SectionHeader description="把负荷拆成低有氧、高有氧和无氧，快速看训练结构有没有失衡。" eyebrow="Load Mix" title="训练结构" />
        <div className="mt-4">
          <StackedColumnChart
            data={loadCompositionData}
            description="低有氧、高有氧、无氧并排在一张图里，直接看训练负荷有没有偏科。"
            segments={[
              { key: "low", label: "低有氧", color: "#38bdf8" },
              { key: "high", label: "高有氧", color: "#8b5cf6" },
              { key: "anaerobic", label: "无氧", color: "#f97316" },
            ]}
            title="训练负荷构成"
            unit="load"
          />
        </div>
      </SurfaceCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
      <SurfaceCard className="p-5">
        <SectionHeader description="选中某一天后，把当日指标和分时曲线收进一个工作台。只有这里保留分时序列。 " eyebrow="Daily Workbench" title="单日深潜" />

        <div className="mt-4 flex flex-wrap gap-2">
          {enrichedMetrics.slice(0, 14).map((metric) => (
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
          {metricsLoading ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">历史日期加载中...</span> : null}
        </div>

        {selectedMetric ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricTile detail="恢复质量" label="睡眠评分" value={formatNumber(selectedMetric.sleepScore)} />
              <MetricTile detail="自主神经恢复" label="HRV" value={formatNumber(selectedMetric.hrv, 0, " ms")} />
              <MetricTile detail="训练 readiness 信号" label="训练准备度" value={formatNumber(selectedMetric.trainingReadiness)} />
              <MetricTile detail="Garmin 总分口径" label="加权强度分钟" value={formatNumber(selectedMetric.intensityMinutes, 0, " min")} />
              <MetricTile detail="当天高点" label="Body Battery 高点" value={formatNumber(selectedMetric.bodyBatteryHigh)} />
              <MetricTile detail="当天低点" label="Body Battery 低点" value={formatNumber(selectedMetric.bodyBatteryLow)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { key: "heartRate", label: "心率折线" },
                { key: "stress", label: "压力时间柱" },
                { key: "bodyBattery", label: "Body Battery 面积图" },
              ].map((item) => (
                <button
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    item.key === selectedDetailChart ? "bg-white text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                  }`}
                  key={item.key}
                  onClick={() => setSelectedDetailChart(item.key as DailyDetailChartKey)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">{userEmail}</div>
            </div>

            <div className="mt-3">
              <TimeSeriesChart
                color={selectedSeriesConfig.color}
                data={selectedSeriesConfig.data}
                description={selectedSeriesConfig.description}
                title={selectedSeriesConfig.title}
                unit={selectedSeriesConfig.unit}
                variant={selectedSeriesConfig.variant}
              />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[1.75rem] border border-dashed border-white/12 bg-white/[0.04] px-6 py-12 text-center text-sm text-slate-400">
            还没有可分析的每日数据。
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <SectionHeader description="这里是快速排查区。字段总览优先展示解析后的所有已知指标，底部保留原始 JSON 兜底。 " eyebrow="Field Center" title="字段与验证中心" />
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { key: "fields", label: "字段总览" },
            { key: "activities", label: "活动记录" },
            { key: "raw", label: "Raw JSON" },
          ].map((item) => (
            <button
              className={`rounded-full px-4 py-2 text-sm transition ${
                item.key === validationTab ? "bg-white text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
              }`}
              key={item.key}
              onClick={() => setValidationTab(item.key as ValidationTab)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {validationTab === "fields" ? (
          <>
            <div className="mt-4 grid gap-3 lg:grid-cols-[0.7fr_0.3fr]">
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="搜索字段，如 睡眠 / body / 负荷 / 血氧"
                type="text"
                value={fieldSearch}
              />
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">当前日期 {selectedMetric?.date ?? "--"}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {FIELD_GROUP_OPTIONS.map((option) => (
                <button
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    option.key === fieldGroup ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                  }`}
                  key={option.key}
                  onClick={() => setFieldGroup(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredFields.map((field) => (
                <SubtleCard className="p-4" key={field.key}>
                  <div className="text-sm text-slate-400">{field.label}</div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{field.value}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{field.group}</div>
                </SubtleCard>
              ))}
              {metricsLoading && filteredFields.length === 0 ? (
                <>
                  <LoadingTile />
                  <LoadingTile />
                  <LoadingTile />
                </>
              ) : null}
            </div>

            {filteredFields.length === 0 ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center text-sm text-slate-400">没有命中字段。</div> : null}

            <div className="mt-4 rounded-[1.35rem] border border-white/8 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-white">原始顶层字段</div>
                <AccentPill tone="neutral">{topLevelKeys.length} keys</AccentPill>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {topLevelKeys.length > 0 ? (
                  topLevelKeys.map((key) => (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300" key={key}>
                      {key}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">暂无原始字段</span>
                )}
              </div>
            </div>
          </>
        ) : null}

        {validationTab === "activities" ? (
          <div className="mt-4 overflow-hidden rounded-3xl border border-white/10">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] bg-white/[0.04] px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
              <span>活动</span>
              <span>距离</span>
              <span>时长</span>
              <span>日期</span>
            </div>
            {latestActivities.length > 0 ? (
              <>
                {latestActivities.map((activity) => (
                  <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] border-t border-white/8 px-5 py-4 text-sm text-slate-300" key={activity.id}>
                    <div>
                      <div className="font-medium text-white">{activity.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{activity.type.replaceAll("_", " ")}</div>
                    </div>
                    <span>{formatDistance(activity.distance)}</span>
                    <span>{formatDuration(activity.duration)}</span>
                    <span>{activity.date}</span>
                  </div>
                ))}
                {activitiesLoading ? <LoadingRows count={3} /> : null}
              </>
            ) : (
              <div className="px-5 py-8 text-sm text-slate-400">{activitiesLoading ? "活动记录加载中..." : "还没有活动记录。"}</div>
            )}
          </div>
        ) : null}

        {validationTab === "raw" ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs text-slate-400">
              顶层字段数：{topLevelKeys.length}
              {topLevelKeys.length > 0 ? `（${topLevelKeys.slice(0, 16).join(", ")}${topLevelKeys.length > 16 ? ", ..." : ""}）` : ""}
            </div>
            <pre className="mt-4 max-h-[42rem] overflow-auto rounded-2xl bg-[#040b14] p-4 text-xs text-slate-300">
              {selectedMetric?.raw ? JSON.stringify(selectedMetric.raw, null, 2) : "暂无"}
            </pre>
          </div>
        ) : null}
      </SurfaceCard>
      </section>
    </>
  )
}
