import { getMetricDisplayValues } from "@/lib/garmin-data"

type DailyMetricInput = {
  id: string
  date: Date
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

type ActivityInput = {
  id: string
  name: string
  type: string
  distance: number | null
  duration: number | null
  date: Date
}

type TrendDirection = "up" | "flat" | "down" | "unknown"

export type TrainingContext = {
  generatedAt: string
  dateRange: {
    metricStart: string | null
    metricEnd: string | null
    activityStart: string | null
    activityEnd: string | null
  }
  athleteProfile: {
    totalMetricDays: number
    totalActivities: number
    primaryActivityTypes: string[]
  }
  recovery: {
    sleepScore7dAvg: number | null
    sleepScoreTrend: TrendDirection
    hrv7dAvg: number | null
    hrvTrend: TrendDirection
    restingHr7dAvg: number | null
    restingHrTrend: TrendDirection
    stress7dAvg: number | null
    readiness7dAvg: number | null
    bodyBatteryHigh7dAvg: number | null
  }
  load: {
    activities7d: number
    activities28d: number
    duration7dMin: number
    duration28dAvgPerWeek: number | null
    distance7dKm: number | null
    distance28dAvgPerWeekKm: number | null
    longSessionLast14dMin: number | null
    acuteChronicRatio: number | null
  }
  recentKeySessions: Array<{
    date: string
    type: string
    name: string
    durationMin: number | null
    distanceKm: number | null
  }>
  flags: string[]
  missingData: string[]
}

export type TrainingAnalysisResult = {
  summary: string
  recoveryStatus: "good" | "moderate" | "poor"
  loadStatus: "low" | "balanced" | "high"
  riskLevel: "low" | "medium" | "high"
  keyFindings: string[]
  todayAdvice: string[]
  next7DaysAdvice: string[]
  watchMetrics: string[]
  missingData: string[]
}

type EnrichedMetric = DailyMetricInput & ReturnType<typeof getMetricDisplayValues>

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function round(value: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) {
    return null
  }

  return Number(value.toFixed(digits))
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (numbers.length === 0) {
    return null
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function sum(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (numbers.length === 0) {
    return null
  }

  return numbers.reduce((total, value) => total + value, 0)
}

function getRecentItems<T extends { date: Date }>(items: T[], days: number) {
  if (items.length === 0) {
    return []
  }

  const latest = items[items.length - 1].date.getTime()
  const start = latest - (days - 1) * 24 * 60 * 60 * 1000
  return items.filter((item) => item.date.getTime() >= start)
}

function getPreviousWindow<T extends { date: Date }>(items: T[], days: number) {
  if (items.length === 0) {
    return []
  }

  const latest = items[items.length - 1].date.getTime()
  const end = latest - days * 24 * 60 * 60 * 1000
  const start = latest - (days * 2 - 1) * 24 * 60 * 60 * 1000
  return items.filter((item) => item.date.getTime() >= start && item.date.getTime() <= end)
}

function getTrend(current: number | null, previous: number | null, threshold = 0.05): TrendDirection {
  if (current == null || previous == null || previous === 0) {
    return "unknown"
  }

  const delta = (current - previous) / Math.abs(previous)
  if (delta >= threshold) {
    return "up"
  }
  if (delta <= -threshold) {
    return "down"
  }

  return "flat"
}

function topActivityTypes(activities: ActivityInput[]) {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    const key = activity.type || "unknown"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type)
}

function uniqueDays(items: Array<{ date: Date }>) {
  return new Set(items.map((item) => toDateKey(item.date))).size
}

function buildFlags(metrics7d: EnrichedMetric[], metricsPrev7d: EnrichedMetric[], activities7d: ActivityInput[], activities28d: ActivityInput[]) {
  const flags: string[] = []

  const sleep7d = average(metrics7d.map((item) => item.sleepScore))
  const sleepPrev7d = average(metricsPrev7d.map((item) => item.sleepScore))
  const hrv7d = average(metrics7d.map((item) => item.hrv))
  const hrvPrev7d = average(metricsPrev7d.map((item) => item.hrv))
  const resting7d = average(metrics7d.map((item) => item.restingHr))
  const restingPrev7d = average(metricsPrev7d.map((item) => item.restingHr))
  const readiness7d = average(metrics7d.map((item) => item.trainingReadiness))

  const duration7d = sum(activities7d.map((item) => (item.duration != null ? item.duration / 60 : null)))
  const duration28d = sum(activities28d.map((item) => (item.duration != null ? item.duration / 60 : null)))
  const chronicWeek = duration28d != null ? duration28d / 4 : null
  const acuteChronicRatio = duration7d != null && chronicWeek && chronicWeek > 0 ? duration7d / chronicWeek : null

  if (sleep7d != null && sleep7d < 65) {
    flags.push("最近 7 天睡眠评分偏低")
  }
  if (hrv7d != null && hrvPrev7d != null && hrv7d < hrvPrev7d * 0.92) {
    flags.push("HRV 较前 7 天明显下滑")
  }
  if (resting7d != null && restingPrev7d != null && resting7d > restingPrev7d + 3) {
    flags.push("静息心率较前 7 天升高")
  }
  if (
    sleep7d != null &&
    sleepPrev7d != null &&
    hrv7d != null &&
    hrvPrev7d != null &&
    resting7d != null &&
    restingPrev7d != null &&
    sleep7d < sleepPrev7d &&
    hrv7d < hrvPrev7d &&
    resting7d > restingPrev7d
  ) {
    flags.push("恢复指标组合走弱")
  }
  if (readiness7d != null && readiness7d < 45) {
    flags.push("训练准备度连续偏低")
  }
  if (acuteChronicRatio != null && acuteChronicRatio > 1.3) {
    flags.push("最近 7 天训练量高于近 28 天周均值较多")
  }
  if (acuteChronicRatio != null && acuteChronicRatio < 0.7) {
    flags.push("最近 7 天训练量明显低于近 28 天周均值")
  }
  if (uniqueDays(activities7d) >= 5) {
    flags.push("最近 7 天训练频率较高")
  }

  return flags
}

export function buildTrainingContext(metrics: DailyMetricInput[], activities: ActivityInput[]): TrainingContext {
  const sortedMetrics = [...metrics]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((metric) => ({
      ...metric,
      ...getMetricDisplayValues(metric.raw),
    }))
  const sortedActivities = [...activities].sort((a, b) => a.date.getTime() - b.date.getTime())

  const metrics7d = getRecentItems(sortedMetrics, 7)
  const metricsPrev7d = getPreviousWindow(sortedMetrics, 7)
  const activities7d = getRecentItems(sortedActivities, 7)
  const activities14d = getRecentItems(sortedActivities, 14)
  const activities28d = getRecentItems(sortedActivities, 28)

  const sleep7d = average(metrics7d.map((item) => item.sleepScore))
  const sleepPrev7d = average(metricsPrev7d.map((item) => item.sleepScore))
  const hrv7d = average(metrics7d.map((item) => item.hrv))
  const hrvPrev7d = average(metricsPrev7d.map((item) => item.hrv))
  const resting7d = average(metrics7d.map((item) => item.restingHr))
  const restingPrev7d = average(metricsPrev7d.map((item) => item.restingHr))
  const stress7d = average(metrics7d.map((item) => item.stress))
  const readiness7d = average(metrics7d.map((item) => item.trainingReadiness))
  const bodyBatteryHigh7d = average(metrics7d.map((item) => item.bodyBatteryHigh))

  const duration7d = sum(activities7d.map((item) => (item.duration != null ? item.duration / 60 : null)))
  const duration28d = sum(activities28d.map((item) => (item.duration != null ? item.duration / 60 : null)))
  const distance7d = sum(activities7d.map((item) => (item.distance != null ? item.distance / 1000 : null)))
  const distance28d = sum(activities28d.map((item) => (item.distance != null ? item.distance / 1000 : null)))
  const weeklyDuration28d = duration28d != null ? duration28d / 4 : null
  const weeklyDistance28d = distance28d != null ? distance28d / 4 : null
  const acuteChronicRatio = duration7d != null && weeklyDuration28d && weeklyDuration28d > 0 ? duration7d / weeklyDuration28d : null

  const missingData: string[] = []
  if (sortedMetrics.length < 7) {
    missingData.push("日级指标少于 7 天，趋势判断不稳定")
  }
  if (metrics7d.filter((item) => item.hrv != null).length < 4) {
    missingData.push("最近 7 天 HRV 样本不足")
  }
  if (metrics7d.filter((item) => item.sleepScore != null).length < 4) {
    missingData.push("最近 7 天睡眠评分样本不足")
  }
  if (activities28d.length < 3) {
    missingData.push("最近 28 天活动记录偏少")
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      metricStart: sortedMetrics[0] ? toDateKey(sortedMetrics[0].date) : null,
      metricEnd: sortedMetrics[sortedMetrics.length - 1] ? toDateKey(sortedMetrics[sortedMetrics.length - 1].date) : null,
      activityStart: sortedActivities[0] ? toDateKey(sortedActivities[0].date) : null,
      activityEnd: sortedActivities[sortedActivities.length - 1] ? toDateKey(sortedActivities[sortedActivities.length - 1].date) : null,
    },
    athleteProfile: {
      totalMetricDays: sortedMetrics.length,
      totalActivities: sortedActivities.length,
      primaryActivityTypes: topActivityTypes(sortedActivities),
    },
    recovery: {
      sleepScore7dAvg: round(sleep7d, 0),
      sleepScoreTrend: getTrend(sleep7d, sleepPrev7d, 0.05),
      hrv7dAvg: round(hrv7d, 0),
      hrvTrend: getTrend(hrv7d, hrvPrev7d, 0.08),
      restingHr7dAvg: round(resting7d, 0),
      restingHrTrend: getTrend(resting7d, restingPrev7d, 0.04),
      stress7dAvg: round(stress7d, 0),
      readiness7dAvg: round(readiness7d, 0),
      bodyBatteryHigh7dAvg: round(bodyBatteryHigh7d, 0),
    },
    load: {
      activities7d: activities7d.length,
      activities28d: activities28d.length,
      duration7dMin: round(duration7d, 0) ?? 0,
      duration28dAvgPerWeek: round(weeklyDuration28d, 0),
      distance7dKm: round(distance7d, 1),
      distance28dAvgPerWeekKm: round(weeklyDistance28d, 1),
      longSessionLast14dMin: round(
        activities14d.reduce<number | null>((max, item) => {
          const minutes = item.duration != null ? item.duration / 60 : null
          if (minutes == null) {
            return max
          }
          return max == null ? minutes : Math.max(max, minutes)
        }, null),
        0
      ),
      acuteChronicRatio: round(acuteChronicRatio, 2),
    },
    recentKeySessions: [...sortedActivities]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5)
      .map((activity) => ({
        date: toDateKey(activity.date),
        type: activity.type,
        name: activity.name,
        durationMin: round(activity.duration != null ? activity.duration / 60 : null, 0),
        distanceKm: round(activity.distance != null ? activity.distance / 1000 : null, 1),
      })),
    flags: buildFlags(metrics7d, metricsPrev7d, activities7d, activities28d),
    missingData,
  }
}

function fallbackAnalysis(context: TrainingContext): TrainingAnalysisResult {
  const riskLevel =
    context.flags.some((item) => item.includes("恢复指标组合走弱") || item.includes("训练量高于")) ? "high" : context.flags.length >= 2 ? "medium" : "low"
  const recoveryStatus =
    context.flags.some((item) => item.includes("恢复")) || context.flags.some((item) => item.includes("睡眠")) ? "poor" : context.recovery.readiness7dAvg != null && context.recovery.readiness7dAvg < 60 ? "moderate" : "good"
  const loadStatus =
    context.flags.some((item) => item.includes("训练量高于")) ? "high" : context.flags.some((item) => item.includes("训练量明显低于")) ? "low" : "balanced"

  return {
    summary: "已生成基于规则的兜底分析，可先参考恢复状态、训练负荷和缺失数据提示。",
    recoveryStatus,
    loadStatus,
    riskLevel,
    keyFindings: context.flags.length > 0 ? context.flags : ["近期没有明显异常旗标"],
    todayAdvice:
      recoveryStatus === "poor"
        ? ["今天优先恢复，安排休息或 30 分钟以内低强度活动。"]
        : ["今天可安排轻松有氧或技巧训练，避免无计划加量。"],
    next7DaysAdvice:
      loadStatus === "high"
        ? ["下周先降 20% 左右总量，保留 1 次关键课，其余以恢复跑或低强度训练为主。"]
        : ["下周维持渐进负荷，优先保证睡眠和 1 次长课。"],
    watchMetrics: ["睡眠评分", "HRV", "静息心率", "训练准备度"],
    missingData: context.missingData,
  }
}

function extractJsonObject(content: string) {
  const trimmed = content.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
  }

  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  throw new Error("模型返回结果不是合法 JSON")
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback
}

export function parseTrainingAnalysis(content: string, context: TrainingContext): TrainingAnalysisResult {
  try {
    const data = JSON.parse(extractJsonObject(content)) as Partial<TrainingAnalysisResult>

    return {
      summary: typeof data.summary === "string" && data.summary.trim() ? data.summary : fallbackAnalysis(context).summary,
      recoveryStatus: normalizeEnum(data.recoveryStatus, ["good", "moderate", "poor"] as const, fallbackAnalysis(context).recoveryStatus),
      loadStatus: normalizeEnum(data.loadStatus, ["low", "balanced", "high"] as const, fallbackAnalysis(context).loadStatus),
      riskLevel: normalizeEnum(data.riskLevel, ["low", "medium", "high"] as const, fallbackAnalysis(context).riskLevel),
      keyFindings: asStringArray(data.keyFindings).slice(0, 6),
      todayAdvice: asStringArray(data.todayAdvice).slice(0, 5),
      next7DaysAdvice: asStringArray(data.next7DaysAdvice).slice(0, 7),
      watchMetrics: asStringArray(data.watchMetrics).slice(0, 6),
      missingData: asStringArray(data.missingData).length > 0 ? asStringArray(data.missingData).slice(0, 6) : context.missingData,
    }
  } catch {
    return fallbackAnalysis(context)
  }
}
