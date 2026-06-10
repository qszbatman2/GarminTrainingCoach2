'use client'

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { AccentPill, MetricTile, SectionHeader, SubtleCard, SurfaceCard } from "@/components/design-system"
import { RecoveryCountdownCard } from "@/components/recovery-countdown-card"
import {
  buildDailyFieldEntries,
  FIELD_GROUP_META,
  type FieldActivityRecord,
  type FieldMetricRecord,
} from "@/lib/data-field-catalog"
import { getActivityDisplayValues, getBodyBatterySeries, getHeartRateSeries, getMetricDisplayValues, getStressSeries, type NumericPoint } from "@/lib/garmin-data"
import { getEstimatedRecoveryHoursFromActivity } from "@/lib/recovery-estimation"
import { formatShanghaiDateTime, parseGarminDateTime } from "@/lib/shanghai-time"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

type MetricItem = FieldMetricRecord & { id: string }
type ActivityItem = FieldActivityRecord & { garminId: string }

type DataExplorerProps = {
  metricTotal: number
  metrics: MetricItem[]
  activityTotal: number
  activities: ActivityItem[]
  initialAnalysisReport: TrainingAnalysisPayload | null
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

type SleepCompositionDatum = {
  label: string
  total: number
  deep: number
  rem: number
  light: number
  awake: number
}

type BodyBatteryTimelinePoint = {
  id: string
  date: string
  dateLabel: string
  timeLabel: string
  hour: number
  value: number
  delta: number | null
  phase: "recovery" | "drain"
}

type StackDatum = {
  label: string
  segments: Array<{ key: string; value: number; color: string; tooltip?: string }>
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const existingIds = new Set(current.map((item) => item.id))
  if (incoming.every((item) => existingIds.has(item.id))) {
    return current
  }

  return [...current, ...incoming.filter((item) => !existingIds.has(item.id))]
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

function formatActivityType(type: string) {
  return type.replaceAll("_", " ")
}

function formatCompactHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "--"
  }

  return `${value.toFixed(1)}h`
}

function parseActivityDateTime(gmtValue: string | null | undefined, localValue: string | null | undefined) {
  return parseGarminDateTime(gmtValue, "utc") ?? parseGarminDateTime(localValue, "shanghai")
}

function formatActivityDateTimeLabel(date: Date | null) {
  if (!date) {
    return "--"
  }

  return formatShanghaiDateTime(date, { includeYear: false })
}

function hasNumericValue(value: string) {
  return /\d/.test(value)
}

function getLatestMetricTileClass(value: string) {
  return hasNumericValue(value)
    ? "border-white/8 bg-white/[0.035]"
    : "border-white/[0.04] bg-white/[0.018] text-slate-500"
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

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (valid.length === 0) {
    return null
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function buildActivityIntensityByDate(activities: ActivityItem[]) {
  const byDate = new Map<string, { moderate: number; vigorous: number; hasValue: boolean }>()

  for (const activity of activities) {
    const values = getActivityDisplayValues(activity.raw)
    const current = byDate.get(activity.date) ?? { moderate: 0, vigorous: 0, hasValue: false }

    if (values.moderateIntensityMinutes != null) {
      current.moderate += values.moderateIntensityMinutes
      current.hasValue = true
    }
    if (values.vigorousIntensityMinutes != null) {
      current.vigorous += values.vigorousIntensityMinutes
      current.hasValue = true
    }

    byDate.set(activity.date, current)
  }

  return new Map(
    [...byDate.entries()].map(([date, value]) => [
      date,
      {
        moderateIntensityMinutes: value.hasValue ? value.moderate : null,
        vigorousIntensityMinutes: value.hasValue ? value.vigorous : null,
        intensityMinutes: value.hasValue ? value.moderate + value.vigorous * 2 : null,
      },
    ])
  )
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

function parseHourFromLabel(label: string) {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(label)
  if (!matched) {
    return 0
  }

  const hour = Number(matched[1])
  return Number.isFinite(hour) ? clamp(hour, 0, 23) : 0
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

function buildTrendSeries(data: NumericPoint[]) {
  if (data.length < 2) {
    return []
  }

  const points = data.map((item, index) => ({ x: index, y: item.value }))
  const count = points.length
  const sumX = points.reduce((total, point) => total + point.x, 0)
  const sumY = points.reduce((total, point) => total + point.y, 0)
  const sumXY = points.reduce((total, point) => total + point.x * point.y, 0)
  const sumXX = points.reduce((total, point) => total + point.x * point.x, 0)
  const denominator = count * sumXX - sumX * sumX
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / count

  return points.map((point, index) => ({
    label: data[index]?.label ?? String(index),
    value: slope * point.x + intercept,
  }))
}

function buildRollingAverageSeries(data: NumericPoint[], windowSize: number) {
  if (data.length === 0) {
    return []
  }

  return data.map((item, index) => {
    const window = data.slice(Math.max(0, index - windowSize + 1), index + 1)
    const value = average(window.map((point) => point.value)) ?? item.value
    return {
      label: item.label,
      value: Number(value.toFixed(1)),
    }
  })
}

function StackedColumnChart({
  title,
  description,
  unit,
  data,
  segments,
  hideUnitPill = false,
  formatTotal = (total: number) => formatNumber(total, total < 10 ? 1 : 0),
}: {
  title: string
  description?: string
  unit?: string
  data: StackDatum[]
  segments: Array<{ key: string; label: string; color: string }>
  hideUnitPill?: boolean
  formatTotal?: (total: number) => string
}) {
  const maxTotal = Math.max(...data.map((item) => item.segments.reduce((sum, segment) => sum + segment.value, 0)), 1)

  return (
    <SubtleCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          {description ? <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p> : null}
        </div>
        {!hideUnitPill && unit ? <AccentPill tone="neutral">{unit}</AccentPill> : null}
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
                      title={segment.tooltip}
                      style={{
                        height: `${Math.max((segment.value / maxTotal) * 100, segment.value > 0 ? 4 : 0)}%`,
                        backgroundColor: segment.color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-white">{formatTotal(total)}</div>
                <div className="mt-1 text-xs text-slate-500">{item.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </SubtleCard>
  )
}

function BodyBatteryTrendChart({
  title,
  description,
  data,
}: {
  title: string
  description: string
  data: BodyBatteryTimelinePoint[]
}) {
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
  const bounds = getChartBounds([data.map((item) => ({ label: item.id, value: item.value }))], 0, 100)
  const yTicks = [100, 75, 50, 25, 0]
  const dayLabels = Array.from(new Set(data.map((item) => item.dateLabel)))
  const dayIndexMap = new Map(dayLabels.map((label, index) => [label, index]))
  const totalHourSlots = Math.max(dayLabels.length * 24 - 1, 1)
  const getPointX = (point: BodyBatteryTimelinePoint) => (((dayIndexMap.get(point.dateLabel) ?? 0) * 24 + point.hour) / totalHourSlots) * 100
  const xTickLabels = dayLabels.map((label, index) => ({
    label,
    x: (((index * 24) + 12) / totalHourSlots) * 100,
  }))
  const hoveredIndex = hoveredPointId ? data.findIndex((item) => item.id === hoveredPointId) : -1
  const hoveredPoint = hoveredIndex >= 0 ? data[hoveredIndex] : null
  const hoveredX = hoveredPoint == null ? null : getPointX(hoveredPoint)
  const hoveredY =
    hoveredPoint == null ? null : 100 - ((hoveredPoint.value - bounds.min) / Math.max(bounds.max - bounds.min, 1)) * 100

  return (
    <SubtleCard className="p-4">
      <div>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
          恢复
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          消耗
        </span>
      </div>

      {data.length > 0 ? (
        <>
          <div className="mx-auto mt-5 grid w-full max-w-[920px] grid-cols-[2.5rem_1fr] gap-3">
            <div className="relative h-56">
              {yTicks.map((tick) => {
                const top = `${100 - ((tick - bounds.min) / Math.max(bounds.max - bounds.min, 1)) * 100}%`
                return (
                  <div className="absolute right-0 -translate-y-1/2 text-[11px] text-slate-500" key={tick} style={{ top }}>
                    {tick}
                  </div>
                )
              })}
            </div>
            <div>
              <div className="relative h-56" onMouseLeave={() => setHoveredPointId(null)}>
                {hoveredPoint && hoveredX != null && hoveredY != null ? (
                  <div
                    className="pointer-events-none absolute z-10 w-44 rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-[0_14px_40px_rgba(2,6,23,0.5)]"
                    style={{ left: `${Math.min(Math.max(hoveredX, 12), 88)}%`, top: `${Math.max(hoveredY - 6, 4)}%`, transform: "translate(-50%, -100%)" }}
                  >
                    <div className="font-medium text-white">{hoveredPoint.date}</div>
                    <div className="mt-1 text-slate-300">{hoveredPoint.timeLabel}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span>Body Battery</span>
                      <span className="font-semibold text-white">{hoveredPoint.value}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>状态</span>
                      <span className={hoveredPoint.phase === "recovery" ? "text-cyan-300" : "text-amber-300"}>{hoveredPoint.phase === "recovery" ? "恢复" : "消耗"}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>较上一点</span>
                      <span className={hoveredPoint.delta != null && hoveredPoint.delta >= 0 ? "text-cyan-300" : "text-amber-300"}>
                        {hoveredPoint.delta == null ? "--" : `${hoveredPoint.delta > 0 ? "+" : ""}${hoveredPoint.delta}`}
                      </span>
                    </div>
                  </div>
                ) : null}

                <svg className="block h-56 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {yTicks.map((tick) => {
                    const y = 100 - ((tick - bounds.min) / Math.max(bounds.max - bounds.min, 1)) * 100
                    return <path d={`M0,${clamp(y, 0, 100)} 100,${clamp(y, 0, 100)}`} fill="none" key={tick} stroke="rgba(148,163,184,0.14)" strokeDasharray="4 4" />
                  })}
                  {xTickLabels.map((tick) => {
                    const x = clamp(tick.x, 0, 100)
                    return <path d={`M${x},0 ${x},100`} fill="none" key={`x-${tick.label}`} stroke="rgba(148,163,184,0.08)" strokeDasharray="3 5" />
                  })}
                  {data.slice(1).map((point, index) => {
                    const previous = data[index]
                    const x1 = getPointX(previous)
                    const x2 = getPointX(point)
                    const y1 = 100 - ((previous.value - bounds.min) / Math.max(bounds.max - bounds.min, 1)) * 100
                    const y2 = 100 - ((point.value - bounds.min) / Math.max(bounds.max - bounds.min, 1)) * 100
                    return (
                      <path
                        d={`M ${x1} ${clamp(y1, 0, 100)} L ${x2} ${clamp(y2, 0, 100)}`}
                        fill="none"
                        key={`${previous.id}-${point.id}`}
                        stroke={point.phase === "recovery" ? "#67e8f9" : "#f59e0b"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.05"
                      />
                    )
                  })}
                </svg>
                <div className="absolute inset-0">
                  {data.map((point) => {
                    const x = getPointX(point)
                    const y = 100 - ((point.value - bounds.min) / Math.max(bounds.max - bounds.min, 1)) * 100
                    const isHovered = hoveredPointId === point.id
                    return (
                      <button
                        aria-label={`${point.date} ${point.timeLabel} Body Battery ${point.value}`}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950/35 shadow-[0_0_0_1px_rgba(15,23,42,0.25)] transition-transform focus:outline-none"
                        key={point.id}
                        onBlur={() => setHoveredPointId((current) => (current === point.id ? null : current))}
                        onFocus={() => setHoveredPointId(point.id)}
                        onMouseEnter={() => setHoveredPointId(point.id)}
                        style={{
                          left: `${x}%`,
                          top: `${clamp(y, 0, 100)}%`,
                          width: isHovered ? "0.9rem" : "0.58rem",
                          height: isHovered ? "0.9rem" : "0.58rem",
                          backgroundColor: point.phase === "recovery" ? "#67e8f9" : "#f59e0b",
                          opacity: isHovered ? 1 : 0.92,
                        }}
                        type="button"
                      >
                        <span className="sr-only">
                          {`${point.date} ${point.timeLabel} | Body Battery ${point.value} | ${point.phase === "recovery" ? "恢复" : "消耗"} | ${point.delta == null ? "较上一点 --" : `较上一点 ${point.delta > 0 ? "+" : ""}${point.delta}`}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="relative mt-3 h-10">
                {xTickLabels.map((tick, index) => {
                  const left = `${clamp(tick.x, 0, 100)}%`
                  const transform = index === 0 ? "translateX(0)" : index === xTickLabels.length - 1 ? "translateX(-100%)" : "translateX(-50%)"
                  return (
                    <div className="absolute top-0 text-center text-[11px] text-slate-500" key={`label-${tick.label}`} style={{ left, transform }}>
                      <div>{tick.label}</div>
                      <div className="mt-0.5">00-23h</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">当前 Body Battery 数据不足，暂时无法绘制连续趋势。</div>
      )}
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
  lines: Array<{ label: string; color: string; data: NumericPoint[]; strokeDasharray?: string }>
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
                strokeDasharray={line.strokeDasharray}
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

function WeightTrendChart({
  title,
  description,
  data,
  averageData,
  latestWeight,
  weeklyAverage,
  monthlyDelta,
}: {
  title: string
  description: string
  data: NumericPoint[]
  averageData: NumericPoint[]
  latestWeight: number | null
  weeklyAverage: number | null
  monthlyDelta: number | null
}) {
  const bounds = getChartBounds([data, averageData])

  return (
    <SubtleCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AccentPill tone="neutral">{data.length} 天记录</AccentPill>
          <AccentPill tone="violet">7 日均线</AccentPill>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.1rem] border border-cyan-400/14 bg-cyan-400/[0.08] px-4 py-3">
          <div className="text-sm text-slate-300">最新体重</div>
          <div className="mt-2 font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">{formatNumber(latestWeight, 1, " kg")}</div>
          <div className="mt-2 text-sm text-slate-400">最近一次 Garmin 体重记录</div>
        </div>
        <div className="rounded-[1.1rem] border border-violet-400/14 bg-violet-400/[0.08] px-4 py-3">
          <div className="text-sm text-slate-300">近 7 天均值</div>
          <div className="mt-2 font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">{formatNumber(weeklyAverage, 1, " kg")}</div>
          <div className="mt-2 text-sm text-slate-400">过滤单日波动后更接近真实趋势</div>
        </div>
        <div className="rounded-[1.1rem] border border-amber-400/14 bg-amber-400/[0.08] px-4 py-3">
          <div className="text-sm text-slate-300">近 30 天净变化</div>
          <div className="mt-2 font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">
            {monthlyDelta == null ? "--" : `${monthlyDelta > 0 ? "+" : ""}${monthlyDelta.toFixed(1)} kg`}
          </div>
          <div className="mt-2 text-sm text-slate-400">以当前窗口首日为基准</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
          每日体重
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          <span className="h-0.5 w-4 bg-violet-300" />
          7 日均线
        </span>
      </div>

      {data.length > 1 ? (
        <>
          <svg className="mt-5 block h-48 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M0,76 100,76" fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="4 4" />
            <path d="M0,48 100,48" fill="none" stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
            <polyline fill="none" points={buildLinePath(data, bounds.min, bounds.max)} stroke="#67e8f9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            <polyline fill="none" points={buildLinePath(averageData, bounds.min, bounds.max)} stroke="#c4b5fd" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">当前体重数据点不足，暂时无法绘制连续趋势。</div>
      )}
    </SubtleCard>
  )
}

export function DataExplorer({ metricTotal, metrics, activityTotal, activities, initialAnalysisReport }: DataExplorerProps) {
  const [metricsState, setMetricsState] = useState(metrics)
  const [activitiesState, setActivitiesState] = useState(activities)
  const analysisReport = initialAnalysisReport
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(metrics[0]?.date ?? "")
  const datePickerRef = useRef<HTMLInputElement>(null)
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

  const activityIntensityByDate = useMemo(() => buildActivityIntensityByDate(activitiesState), [activitiesState])

  const enrichedMetrics = useMemo<EnrichedMetric[]>(
    () =>
      metricsState.map((metric) => {
        const displayValues = getMetricDisplayValues(metric.raw)
        const activityIntensity = activityIntensityByDate.get(metric.date)

        return {
          ...metric,
          ...displayValues,
          intensityMinutes: activityIntensity?.intensityMinutes ?? displayValues.intensityMinutes,
          moderateIntensityMinutes: activityIntensity?.moderateIntensityMinutes ?? displayValues.moderateIntensityMinutes,
          vigorousIntensityMinutes: activityIntensity?.vigorousIntensityMinutes ?? displayValues.vigorousIntensityMinutes,
        }
      }),
    [activityIntensityByDate, metricsState]
  )

  const metricsAsc = useMemo(() => [...enrichedMetrics].sort((a, b) => a.date.localeCompare(b.date)), [enrichedMetrics])
  const recentMetrics = useMemo(() => metricsAsc.slice(-10), [metricsAsc])
  const last7Metrics = useMemo(() => metricsAsc.slice(-7), [metricsAsc])
  const hrv30Metrics = useMemo(() => metricsAsc.slice(-30), [metricsAsc])
  const previous30Metrics = useMemo(() => metricsAsc.slice(-60, -30), [metricsAsc])
  const effectiveSelectedDate = selectedDate || metricsState[0]?.date || ""
  const selectedMetric = enrichedMetrics.find((metric) => metric.date === effectiveSelectedDate) ?? enrichedMetrics[0] ?? null
  const latestActivities = activitiesState.slice(0, 12)
  const latestMetric = recentMetrics[recentMetrics.length - 1] ?? null

  const latestActivitySummary = useMemo(() => {
    const latestActivity = latestActivities[0]
    if (!latestActivity) {
      return null
    }

    const values = getActivityDisplayValues(latestActivity.raw)
    const estimatedRecoveryHours = getEstimatedRecoveryHoursFromActivity({
      duration: latestActivity.duration,
      distance: latestActivity.distance,
      trainingLoad: values.trainingLoad,
      aerobicTrainingEffect: values.aerobicTrainingEffect,
      anaerobicTrainingEffect: values.anaerobicTrainingEffect,
      moderateIntensityMinutes: values.moderateIntensityMinutes,
      vigorousIntensityMinutes: values.vigorousIntensityMinutes,
    })
    const startedAt = parseActivityDateTime(values.startedAtGmt, values.startedAtLocal)
    const endedAt =
      parseActivityDateTime(values.endedAtGmt, values.endedAtLocal) ??
      (startedAt && latestActivity.duration ? new Date(startedAt.getTime() + latestActivity.duration * 1000) : null)

    return {
      ...latestActivity,
      ...values,
      startedAtLabel: formatActivityDateTimeLabel(startedAt),
      endedAtLabel: formatActivityDateTimeLabel(endedAt),
      typeLabel: formatActivityType(latestActivity.type),
      durationLabel: formatDuration(latestActivity.duration),
      distanceLabel: formatDistance(latestActivity.distance),
      recoveryLabel: formatNumber(estimatedRecoveryHours, 1, " h"),
    }
  }, [latestActivities])

  const heartRateSeries = useMemo(() => (selectedMetric ? getHeartRateSeries(selectedMetric.raw) : []), [selectedMetric])
  const stressSeries = useMemo(() => (selectedMetric ? getStressSeries(selectedMetric.raw) : []), [selectedMetric])
  const bodyBatterySeries = useMemo(() => (selectedMetric ? getBodyBatterySeries(selectedMetric.raw) : []), [selectedMetric])

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

  const bodyBatteryTimelineData = useMemo<BodyBatteryTimelinePoint[]>(
    () => {
      const recentMetricsWithSeries = metricsAsc
        .map((metric) => ({
          metric,
          series: getBodyBatterySeries(metric.raw, 0),
        }))
        .filter((item) => item.series.length > 1)
        .slice(-7)

      const detailedPoints =
        recentMetricsWithSeries.length > 0
          ? recentMetricsWithSeries.flatMap(({ metric, series }) => {
              const hourlyBuckets = new Map<number, { timeLabel: string; value: number }>()
              for (const point of series) {
                const hour = parseHourFromLabel(point.label)
                hourlyBuckets.set(hour, {
                  timeLabel: `${String(hour).padStart(2, "0")}:00`,
                  value: point.value,
                })
              }

              return [...hourlyBuckets.entries()]
                .sort((left, right) => left[0] - right[0])
                .map(([, point]) => ({
                  date: metric.date,
                  dateLabel: metric.date.slice(5),
                  timeLabel: point.timeLabel,
                  value: point.value,
                }))
            })
          : recentMetrics
              .filter((metric) => metric.bodyBatteryHigh != null || metric.bodyBatteryLow != null)
              .flatMap((metric) => {
                const points: Array<{ date: string; dateLabel: string; timeLabel: string; value: number }> = []
                if (metric.bodyBatteryHigh != null) {
                  points.push({
                    date: metric.date,
                    dateLabel: metric.date.slice(5),
                    timeLabel: "06:00",
                    value: metric.bodyBatteryHigh,
                  })
                }
                if (metric.bodyBatteryLow != null) {
                  points.push({
                    date: metric.date,
                    dateLabel: metric.date.slice(5),
                    timeLabel: "21:00",
                    value: metric.bodyBatteryLow,
                  })
                }
                return points
              })

      return detailedPoints
        .sort((left, right) => `${left.date} ${left.timeLabel}`.localeCompare(`${right.date} ${right.timeLabel}`))
        .map((point, index, all) => {
          const previous = index > 0 ? all[index - 1] : null
          const delta = previous == null ? null : point.value - previous.value
          return {
            id: `${point.date}-${point.timeLabel}-${index}`,
            date: point.date,
            dateLabel: point.dateLabel,
            timeLabel: point.timeLabel,
            hour: parseHourFromLabel(point.timeLabel),
            value: point.value,
            delta,
            phase: delta == null || delta >= 0 ? "recovery" : "drain",
          }
        })
    },
    [metricsAsc, recentMetrics]
  )

  const intensityData = useMemo<StackDatum[]>(
    () =>
      recentMetrics
        .map((metric) => {
          const moderate = metric.moderateIntensityMinutes ?? 0
          const vigorous = metric.vigorousIntensityMinutes ?? 0
          return {
            label: metric.date.slice(5),
            segments: [
              { key: "moderate", value: moderate, color: "#22d3ee" },
              { key: "vigorous", value: vigorous, color: "#f97316" },
            ],
          }
        }),
    [recentMetrics]
  )

  const loadCompositionData = useMemo<StackDatum[]>(
    () =>
      recentMetrics
        .map((metric) => {
          const hasTrainingToday = (metric.intensityMinutes ?? 0) > 0 || (metric.moderateIntensityMinutes ?? 0) > 0 || (metric.vigorousIntensityMinutes ?? 0) > 0
          const low = hasTrainingToday ? (metric.lowAerobicLoad ?? 0) : 0
          const high = hasTrainingToday ? (metric.highAerobicLoad ?? 0) : 0
          const anaerobic = hasTrainingToday ? (metric.anaerobicLoad ?? 0) : 0

          return {
            label: metric.date.slice(5),
            segments: [
              { key: "low", value: low, color: "#38bdf8" },
              { key: "high", value: high, color: "#8b5cf6" },
              { key: "anaerobic", value: anaerobic, color: "#f97316" },
            ],
          }
        }),
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

  const hrv30Series = useMemo<NumericPoint[]>(
    () =>
      hrv30Metrics
        .map((metric) => (metric.hrv != null ? { label: metric.date.slice(5), value: metric.hrv } : null))
        .filter((item): item is NumericPoint => item !== null),
    [hrv30Metrics]
  )
  const weightMetrics = useMemo(() => metricsAsc.filter((metric) => metric.weight != null).slice(-30), [metricsAsc])
  const weightSeries = useMemo<NumericPoint[]>(
    () => weightMetrics.map((metric) => ({ label: metric.date.slice(5), value: Number((metric.weight ?? 0).toFixed(1)) })),
    [weightMetrics]
  )
  const weightAverageSeries = useMemo(() => buildRollingAverageSeries(weightSeries, 7), [weightSeries])
  const latestWeight = weightMetrics[weightMetrics.length - 1]?.weight ?? null
  const weeklyWeightAverage = useMemo(() => average(weightMetrics.slice(-7).map((metric) => metric.weight)), [weightMetrics])
  const weightMonthlyDelta =
    weightMetrics.length > 1 && weightMetrics[0]?.weight != null && latestWeight != null ? latestWeight - weightMetrics[0].weight : null
  const hrvTrendSeries = useMemo(() => buildTrendSeries(hrv30Series), [hrv30Series])
  const hrvChartBounds = useMemo(() => getChartBounds([hrv30Series, hrvTrendSeries]), [hrv30Series, hrvTrendSeries])
  const hrvAverage = average(last7Metrics.map((metric) => metric.hrv))
  const hrv30Average = average(hrv30Metrics.map((metric) => metric.hrv))
  const previous30HrvAverage = average(previous30Metrics.map((metric) => metric.hrv))
  const selectedDayActivities = useMemo(
    () => activitiesState.filter((activity) => activity.date === selectedMetric?.date),
    [activitiesState, selectedMetric?.date]
  )
  const dailyFieldEntries = useMemo(
    () => buildDailyFieldEntries({ metric: selectedMetric, activities: selectedDayActivities }),
    [selectedDayActivities, selectedMetric]
  )
  const groupedDailyFields = useMemo(
    () =>
      FIELD_GROUP_META.map((group) => ({
        ...group,
        entries: dailyFieldEntries.filter((entry) => entry.group === group.key),
      })).filter((group) => group.entries.length > 0),
    [dailyFieldEntries]
  )
  const selectedMetricIndex = useMemo(
    () => (selectedMetric ? metricsAsc.findIndex((metric) => metric.date === selectedMetric.date) : -1),
    [metricsAsc, selectedMetric]
  )
  const previousMetric = selectedMetricIndex > 0 ? metricsAsc[selectedMetricIndex - 1] ?? null : null
  const nextMetric = selectedMetricIndex >= 0 && selectedMetricIndex < metricsAsc.length - 1 ? metricsAsc[selectedMetricIndex + 1] ?? null : null
  const earliestLoadedDate = metricsAsc[0]?.date ?? ""
  const latestLoadedDate = metricsAsc[metricsAsc.length - 1]?.date ?? ""
  const dailyTrendCards = useMemo(
    () =>
      [
        {
          key: "heartRate",
          title: `${selectedMetric?.date ?? "--"} 心率节律`,
          description: "连续心率波动",
          unit: "bpm",
          data: heartRateSeries,
          variant: "line" as const,
          color: "#22d3ee",
        },
        {
          key: "stress",
          title: `${selectedMetric?.date ?? "--"} 压力分布`,
          description: "时段压力峰值",
          unit: "stress",
          data: stressSeries,
          variant: "bars" as const,
          color: "#f97316",
        },
        {
          key: "bodyBattery",
          title: `${selectedMetric?.date ?? "--"} Body Battery 走向`,
          description: "白天消耗与夜间回充",
          unit: "battery",
          data: bodyBatterySeries,
          variant: "area" as const,
          color: "#8b5cf6",
        },
      ].filter((chart) => chart.data.length >= 2),
    [bodyBatterySeries, heartRateSeries, selectedMetric?.date, stressSeries]
  )

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        {latestActivitySummary ? (
          <SurfaceCard className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Latest Activity</div>
                <div className="mt-3 font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">{latestActivitySummary.name}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AccentPill tone="cyan">{latestActivitySummary.typeLabel}</AccentPill>
                  <AccentPill tone="neutral">开始 {latestActivitySummary.startedAtLabel}</AccentPill>
                  <AccentPill tone="neutral">结束 {latestActivitySummary.endedAtLabel}</AccentPill>
                </div>
              </div>
              <div className="grid min-w-[15rem] gap-3 sm:grid-cols-2">
                <div className={`rounded-[1.35rem] border px-4 py-3 text-right ${hasNumericValue(latestActivitySummary.durationLabel) ? "border-cyan-400/16 bg-cyan-400/8" : "border-white/[0.04] bg-white/[0.018]"}`}>
                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/72">时长</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{latestActivitySummary.durationLabel}</div>
                  <div className="mt-1 text-sm text-slate-300">Duration</div>
                </div>
                <div className={`rounded-[1.35rem] border px-4 py-3 text-right ${hasNumericValue(latestActivitySummary.distanceLabel) ? "border-violet-400/16 bg-violet-400/8" : "border-white/[0.04] bg-white/[0.018]"}`}>
                  <div className="text-xs uppercase tracking-[0.18em] text-violet-200/72">总距离</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{latestActivitySummary.distanceLabel}</div>
                  <div className="mt-1 text-sm text-slate-300">Distance</div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile className={getLatestMetricTileClass(formatNumber(latestActivitySummary.averageHeartRate, 0, " bpm"))} detail="最近一次活动均值" label="平均心率" value={formatNumber(latestActivitySummary.averageHeartRate, 0, " bpm")} />
              <MetricTile className={getLatestMetricTileClass(formatNumber(latestActivitySummary.maxHeartRate, 0, " bpm"))} detail="峰值响应" label="最大心率" value={formatNumber(latestActivitySummary.maxHeartRate, 0, " bpm")} />
              <MetricTile className={getLatestMetricTileClass(formatNumber(latestActivitySummary.averagePower, 0, " W"))} detail="有功率计时优先显示" label="AP" value={formatNumber(latestActivitySummary.averagePower, 0, " W")} />
              <MetricTile className={getLatestMetricTileClass(formatNumber(latestActivitySummary.normalizedPower, 0, " W"))} detail="有功率计时优先显示" label="NP" value={formatNumber(latestActivitySummary.normalizedPower, 0, " W")} />
              <MetricTile className={getLatestMetricTileClass(formatNumber(latestActivitySummary.averageCadence, 0, " rpm"))} detail="骑行踏频 / 跑步步频" label="平均踏频" value={formatNumber(latestActivitySummary.averageCadence, 0, " rpm")} />
              <MetricTile className={getLatestMetricTileClass(latestActivitySummary.recoveryLabel)} detail="基于训练负荷与强度的自建估算" label="恢复时间" value={latestActivitySummary.recoveryLabel} />
              <MetricTile className={getLatestMetricTileClass(formatNumber(latestActivitySummary.trainingLoad))} detail="训练刺激量级" label="Training Load" value={formatNumber(latestActivitySummary.trainingLoad)} />
              <MetricTile className={getLatestMetricTileClass(`${formatNumber(latestActivitySummary.aerobicTrainingEffect, 1)} / ${formatNumber(latestActivitySummary.anaerobicTrainingEffect, 1)}`)} detail="有氧 / 无氧" label="训练效果" value={`${formatNumber(latestActivitySummary.aerobicTrainingEffect, 1)} / ${formatNumber(latestActivitySummary.anaerobicTrainingEffect, 1)}`} />
            </div>
          </SurfaceCard>
        ) : (
          <SurfaceCard className="p-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Latest Activity</div>
            <div className="mt-3 text-xl font-semibold text-white">还没有活动记录</div>
            <div className="mt-2 text-sm text-slate-400">同步一次 Garmin 活动后，这里会放大展示最近一次训练的关键指标。</div>
          </SurfaceCard>
        )}

        <div className="grid gap-4 content-start">
          <RecoveryCountdownCard className="max-w-none" report={analysisReport} title="Ready To Train" />

          <SurfaceCard className="p-5">
            <SectionHeader description="以下三项统一取自最近一日 Daily 数据，用来表示当前恢复状态。" eyebrow="Current Status" title="生命体征速览" />
            <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="text-sm text-slate-400">最近一日状态</div>
              <AccentPill tone="neutral">{latestMetric?.date ?? "--"}</AccentPill>
            </div>
            <div className="mt-4 grid gap-2 rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-3">
              {[
                { label: "静息心率", value: formatNumber(latestMetric?.restingHr, 0, " bpm") },
                { label: "压力", value: formatNumber(latestMetric?.stress) },
                { label: "呼吸频率", value: formatNumber(latestMetric?.respiration, 0, " brpm") },
              ].map((item) => (
                <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3 rounded-xl px-2 py-1.5" key={item.label}>
                  <div className="text-sm text-slate-400">{item.label}</div>
                  <div className="text-right text-xl font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section>
        <SurfaceCard className="p-5">
        <SectionHeader
          actions={
            <Link className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200" href="/data/sync">
              查看同步状态
            </Link>
          }
          description="先看近 10 天睡眠结构，再看近 30 天 HRV 趋势，恢复判断集中在这一屏完成。"
          eyebrow="Sleep Recovery"
          title="睡眠与恢复"
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <StackedColumnChart
            data={sleepCompositionData.map((item) => ({
              label: item.label,
              segments: [
                { key: "deep", value: item.deep, color: "#38bdf8", tooltip: `${item.label}：深睡 ${formatCompactHours(item.deep)}` },
                { key: "rem", value: item.rem, color: "#8b5cf6", tooltip: `${item.label}：REM ${formatCompactHours(item.rem)}` },
                { key: "light", value: item.light, color: "#14b8a6", tooltip: `${item.label}：浅睡 ${formatCompactHours(item.light)}` },
                { key: "awake", value: item.awake, color: "#f97316", tooltip: `${item.label}：清醒 ${formatCompactHours(item.awake)}` },
              ],
            }))}
            formatTotal={formatCompactHours}
            hideUnitPill
            segments={[
              { key: "deep", label: "深睡", color: "#38bdf8" },
              { key: "rem", label: "REM", color: "#8b5cf6" },
              { key: "light", label: "浅睡", color: "#14b8a6" },
              { key: "awake", label: "清醒", color: "#f97316" },
            ]}
            title="睡眠结构"
          />

          <SubtleCard className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">HRV 分析</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">最新值、近 7 天均值和近 30 天趋势线放在一起，直接看恢复是否走弱。</p>
              </div>
              <AccentPill tone="violet">30 天</AccentPill>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricTile detail={latestMetric?.date ?? "最新一日"} label="最新 HRV" value={formatNumber(latestMetric?.hrv, 0, " ms")} />
              <MetricTile detail={`较前 30 天 ${formatDelta(hrv30Average, previous30HrvAverage, 0, " ms")}`} label="近 30 天均值" value={formatNumber(hrv30Average, 0, " ms")} />
              <MetricTile detail={`较近 7 天 ${formatDelta(latestMetric?.hrv, hrvAverage, 0, " ms")}`} label="近 7 天均值" value={formatNumber(hrvAverage, 0, " ms")} />
            </div>

            {hrv30Series.length > 1 ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
                    HRV
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                    <span className="h-0.5 w-4 bg-cyan-300" />
                    趋势线
                  </span>
                </div>
                <svg className="mt-5 block h-48 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path d="M0,76 100,76" fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="4 4" />
                  <path d="M0,48 100,48" fill="none" stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
                  <polyline fill="none" points={buildLinePath(hrv30Series, hrvChartBounds.min, hrvChartBounds.max)} stroke="#8b5cf6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  <polyline fill="none" points={buildLinePath(hrvTrendSeries, hrvChartBounds.min, hrvChartBounds.max)} stroke="#67e8f9" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{hrv30Series[0]?.label}</span>
                  <span>{hrv30Series[Math.floor(hrv30Series.length / 2)]?.label}</span>
                  <span>{hrv30Series[hrv30Series.length - 1]?.label}</span>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-3xl bg-white/[0.05] px-4 py-8 text-center text-sm text-slate-400">当前 HRV 数据点不足，暂时无法绘制 30 天趋势。</div>
            )}
          </SubtleCard>

          <div className="xl:col-span-2">
            <BodyBatteryTrendChart data={bodyBatteryTimelineData} description="用多日分时点位串起 Body Battery 变化，冷色代表恢复抬升，暖色代表消耗下滑。" title="Body Battery 趋势" />
          </div>
        </div>
      </SurfaceCard>
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

      <section>
        <SurfaceCard className="p-5">
          <SectionHeader
            description="把最近 30 天体重按日连成线，主线看每天波动，7 日均线专门过滤掉称重噪声。"
            eyebrow="Weight Trend"
            title="体重趋势"
          />
          <div className="mt-4">
            <WeightTrendChart
              averageData={weightAverageSeries}
              data={weightSeries}
              description="先看日线是否突然抬升或下探，再看均线有没有持续偏离，避免被单天饮食和补水误导。"
              latestWeight={latestWeight}
              monthlyDelta={weightMonthlyDelta}
              title="每日体重变化"
              weeklyAverage={weeklyWeightAverage}
            />
          </div>
        </SurfaceCard>
      </section>

      <section>
        <SurfaceCard className="p-5">
          <SectionHeader
            description="用弹出日历切换日期，当天所有可用字段都压缩进同一屏；有时间序列的数据直接画图，不再重复堆摘要卡片。"
            eyebrow="Daily Workbench"
            title="单日深潜"
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!previousMetric}
              onClick={() => previousMetric && setSelectedDate(previousMetric.date)}
              type="button"
            >
              更早一天
            </button>
            <button
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
              onClick={() => {
                const picker = datePickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
                if (!picker) {
                  return
                }
                picker.showPicker?.()
                picker.focus()
              }}
              type="button"
            >
              {selectedMetric?.date ?? "选择日期"}
            </button>
            <button
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!nextMetric}
              onClick={() => nextMetric && setSelectedDate(nextMetric.date)}
              type="button"
            >
              更近一天
            </button>
            <AccentPill tone="neutral">已载入 {metricsState.length} 天</AccentPill>
            <AccentPill tone="neutral">
              范围 {earliestLoadedDate || "--"} ~ {latestLoadedDate || "--"}
            </AccentPill>
            {metricsLoading ? <AccentPill tone="violet">历史日期加载中</AccentPill> : null}
            <input
              className="sr-only"
              max={latestLoadedDate || undefined}
              min={earliestLoadedDate || undefined}
              onChange={(event) => setSelectedDate(event.target.value)}
              ref={datePickerRef}
              type="date"
              value={selectedMetric?.date ?? ""}
            />
          </div>

          {selectedMetric ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <div className="grid gap-3">
                {groupedDailyFields.map((group) => (
                  <SubtleCard className="p-4" key={group.key}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{group.label}</div>
                      <AccentPill tone="neutral">{group.entries.length} 项</AccentPill>
                    </div>
                    <div className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                      {group.entries.map((field) => (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-white/6 py-1.5 last:border-none" key={field.id}>
                          <div className="min-w-0 text-sm text-slate-400">{field.label}</div>
                          <div className={`text-right text-sm font-semibold ${field.value === "--" ? "text-slate-500" : "text-white"}`}>{field.value}</div>
                        </div>
                      ))}
                    </div>
                  </SubtleCard>
                ))}
              </div>

              <div className="grid gap-3">
                {dailyTrendCards.length > 0 ? (
                  dailyTrendCards.map((chart) => (
                    <TimeSeriesChart
                      color={chart.color}
                      data={chart.data}
                      description={chart.description}
                      key={chart.key}
                      title={chart.title}
                      unit={chart.unit}
                      variant={chart.variant}
                    />
                  ))
                ) : (
                  <SubtleCard className="px-4 py-8 text-center text-sm text-slate-400">这一天暂时没有可用的分时数据。</SubtleCard>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.75rem] border border-dashed border-white/12 bg-white/[0.04] px-6 py-12 text-center text-sm text-slate-400">
              还没有可分析的每日数据。
            </div>
          )}
        </SurfaceCard>
      </section>
    </>
  )
}
