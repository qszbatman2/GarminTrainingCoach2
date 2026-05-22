import { getActivityDisplayValues, getMetricDisplayValues } from "@/lib/garmin-data"

export type DailyMetricInput = {
  id: string
  date: Date
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

export type ActivityInput = {
  id: string
  name: string
  type: string
  distance: number | null
  duration: number | null
  date: Date
  raw?: unknown
}

type BaselineMetricName = "restingHr" | "hrv" | "sleepScore" | "sleepInterruptions" | "stress"
type LoadSource = "garmin" | "proxy" | "missing"
type DecisionStatus = "可训" | "慎训" | "不训"
type AbnormalityLevel = "normal" | "mild" | "severe" | "unknown"
type LoadStatus = "balanced" | "high" | "low" | "unknown"
type RecoveryCapacity = "normal" | "weak" | "unknown"

type MetricDisplayValues = ReturnType<typeof getMetricDisplayValues>
type ActivityDisplayValues = ReturnType<typeof getActivityDisplayValues>

type EnrichedMetric = DailyMetricInput &
  MetricDisplayValues & {
    sleepDurationHours: number | null
    deepSleepHours: number | null
    remSleepHours: number | null
    awakeDurationMinutes: number | null
    sedentaryMinutes: number | null
    recoveryHours: number | null
  }

type EnrichedActivity = ActivityInput &
  ActivityDisplayValues & {
    durationMin: number | null
    distanceKm: number | null
    recoveryHours: number | null
  }

type BaselineStats = {
  mean: number | null
  std: number | null
  lower: number | null
  upper: number | null
  sampleDays: number
}

type MetricAbnormality = {
  value: number | null
  baseline: number | null
  delta: number | null
  deltaPct: number | null
  lower: number | null
  upper: number | null
  level: AbnormalityLevel
}

export type TrainingContext = {
  generatedAt: string
  dateRange: {
    metricStart: string | null
    metricEnd: string | null
    activityStart: string | null
    activityEnd: string | null
  }
  baseline: {
    windowDays: number
    validDays: number
    usedDays: number
    restingHr: BaselineStats
    hrv: BaselineStats
    sleepScore: BaselineStats
    sleepInterruptions: BaselineStats
    stress: BaselineStats
  }
  today: {
    date: string | null
    restingHr: number | null
    hrv: number | null
    sleepScore: number | null
    sleepDurationHours: number | null
    deepSleepHours: number | null
    remSleepHours: number | null
    sleepInterruptions: number | null
    stress: number | null
    respiration: number | null
    bloodOxygen: number | null
    trainingReadiness: number | null
    bodyBatteryHigh: number | null
    bodyBatteryLow: number | null
    sedentaryMinutes: number | null
    weight: number | null
    vo2Max: number | null
    lactateThresholdHr: number | null
    acuteTrainingLoad: number | null
    chronicTrainingLoad: number | null
    loadRatio: number | null
    recoveryHours: number | null
  }
  abnormalities: {
    restingHr: MetricAbnormality
    hrv: MetricAbnormality
    sleepScore: MetricAbnormality
    sleepInterruptions: MetricAbnormality
    stress: MetricAbnormality
  }
  fatigue: {
    componentScores: {
      hrv: number | null
      sleep: number | null
      restingHr: number | null
      loadRatio: number | null
      stress: number | null
    }
    totalScore: number | null
    level: "恢复优秀" | "恢复良好" | "中度疲劳" | "重度疲劳" | "极度疲劳" | "未知"
  }
  load: {
    acuteTrainingLoad: number | null
    chronicTrainingLoad: number | null
    loadRatio: number | null
    loadStatus: LoadStatus
    source: LoadSource
    recent7dDurationMin: number | null
    recent42dAvgWeekDurationMin: number | null
    avgTrainingLoad7d: number | null
    avgAerobicEffect7d: number | null
    avgAnaerobicEffect7d: number | null
  }
  activity: {
    sessions7d: number
    latestSession: {
      date: string
      type: string
      name: string
      durationMin: number | null
      distanceKm: number | null
      averageHeartRate: number | null
      maxHeartRate: number | null
      aerobicTrainingEffect: number | null
      anaerobicTrainingEffect: number | null
      trainingLoad: number | null
      recoveryHours: number | null
    } | null
  }
  recovery: {
    recoveryHours: number | null
    lastHighIntensityDate: string | null
    hoursToBaseline: number | null
    recoveryCapacity: RecoveryCapacity
  }
  decision: {
    shouldTrain: DecisionStatus
    todayAdvice: string
    ruleReason: string
  }
  missingData: string[]
}

export type TrainingAnalysisResult = {
  shouldTrain: DecisionStatus
  todayAdvice: string
  reasonAnalysis: string
}

export type TrainingAnalysisPayload = {
  context: TrainingContext
  analysis: TrainingAnalysisResult
  updatedAt?: string
}

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

function standardDeviation(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (numbers.length < 2) {
    return 0
  }

  const mean = average(numbers)
  if (mean == null) {
    return 0
  }

  const variance = numbers.reduce((total, value) => total + (value - mean) ** 2, 0) / numbers.length
  return Math.sqrt(variance)
}

function sum(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (numbers.length === 0) {
    return null
  }

  return numbers.reduce((total, value) => total + value, 0)
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max)
}

function getWindowItems<T extends { date: Date }>(items: T[], referenceDate: Date, days: number) {
  const end = referenceDate.getTime()
  const start = end - (days - 1) * 24 * 60 * 60 * 1000
  return items.filter((item) => item.date.getTime() >= start && item.date.getTime() <= end)
}

function getWindowBefore<T extends { date: Date }>(items: T[], referenceDate: Date, days: number) {
  const end = referenceDate.getTime() - 1
  const start = end - (days - 1) * 24 * 60 * 60 * 1000
  return items.filter((item) => item.date.getTime() >= start && item.date.getTime() <= end)
}

function normalizeHoursFromSeconds(value: number | null) {
  if (value == null) {
    return null
  }

  return round(value / 3600, 1)
}

function normalizeMinutes(value: number | null) {
  if (value == null) {
    return null
  }

  return round(value > 1440 ? value / 60 : value, 0)
}

function normalizeRecoveryHours(value: number | null) {
  if (value == null) {
    return null
  }

  return round(value > 240 ? value / 3600 : value, 0)
}

function enrichMetric(metric: DailyMetricInput): EnrichedMetric {
  const displayValues = getMetricDisplayValues(metric.raw)

  return {
    ...metric,
    ...displayValues,
    sleepDurationHours: normalizeHoursFromSeconds(displayValues.sleepDurationHours),
    deepSleepHours: normalizeHoursFromSeconds(displayValues.deepSleepHours),
    remSleepHours: normalizeHoursFromSeconds(displayValues.remSleepHours),
    awakeDurationMinutes: displayValues.awakeDurationMinutes != null ? round(displayValues.awakeDurationMinutes / 60, 0) : null,
    sedentaryMinutes: normalizeMinutes(displayValues.sedentaryMinutes),
    recoveryHours: normalizeRecoveryHours(displayValues.recoveryHours),
  }
}

function enrichActivity(activity: ActivityInput): EnrichedActivity {
  const displayValues = getActivityDisplayValues(activity.raw)

  return {
    ...activity,
    ...displayValues,
    durationMin: activity.duration != null ? round(activity.duration / 60, 0) : null,
    distanceKm: activity.distance != null ? round(activity.distance / 1000, 1) : null,
    recoveryHours: normalizeRecoveryHours(displayValues.recoveryHours),
  }
}

function buildBaselineStats(metrics: EnrichedMetric[], key: BaselineMetricName): BaselineStats {
  const values = metrics.map((metric) => metric[key])
  const mean = average(values)
  const std = standardDeviation(values)

  return {
    mean: round(mean, 1),
    std: round(std, 1),
    lower: mean == null ? null : round(mean - std * 1.5, 1),
    upper: mean == null ? null : round(mean + std * 1.5, 1),
    sampleDays: values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).length,
  }
}

function isBaselineEligible(metric: EnrichedMetric) {
  const poorSleep = metric.sleepScore != null && metric.sleepScore < 50
  const shortSleep = metric.sleepDurationHours != null && metric.sleepDurationHours < 5
  const tooManyInterruptions = metric.sleepInterruptions != null && metric.sleepInterruptions > 8
  const highStress = metric.stress != null && metric.stress >= 75
  const lowReadiness = metric.trainingReadiness != null && metric.trainingReadiness < 30
  const lowOxygen = metric.bloodOxygen != null && metric.bloodOxygen < 92
  const heavyRecovery = metric.recoveryHours != null && metric.recoveryHours >= 72
  const excessiveIntensity = metric.vigorousIntensityMinutes != null && metric.vigorousIntensityMinutes >= 90
  const overload = metric.acuteChronicLoadRatio != null && metric.acuteChronicLoadRatio > 1.5

  return !(poorSleep || shortSleep || tooManyInterruptions || highStress || lowReadiness || lowOxygen || heavyRecovery || excessiveIntensity || overload)
}

function getMetricAbnormality(options: {
  value: number | null
  stats: BaselineStats
  mildRule: (value: number, baseline: number) => boolean
  severeRule: (value: number, baseline: number) => boolean
}) {
  const { value, stats, mildRule, severeRule } = options
  const baseline = stats.mean
  if (value == null || baseline == null) {
    return {
      value,
      baseline,
      delta: null,
      deltaPct: null,
      lower: stats.lower,
      upper: stats.upper,
      level: "unknown" as const,
    }
  }

  const delta = value - baseline
  const deltaPct = baseline === 0 ? null : delta / baseline
  const level: AbnormalityLevel = severeRule(value, baseline) ? "severe" : mildRule(value, baseline) ? "mild" : "normal"

  return {
    value: round(value, 1),
    baseline,
    delta: round(delta, 1),
    deltaPct: round(deltaPct, 2),
    lower: stats.lower,
    upper: stats.upper,
    level,
  }
}

function getLoadStatus(loadRatio: number | null): LoadStatus {
  if (loadRatio == null) {
    return "unknown"
  }
  if (loadRatio > 1.5) {
    return "high"
  }
  if (loadRatio < 0.5) {
    return "low"
  }
  if (loadRatio >= 0.8 && loadRatio <= 1.2) {
    return "balanced"
  }
  return "unknown"
}

function scoreRestingHr(value: number | null, baseline: number | null) {
  if (value == null || baseline == null) {
    return null
  }

  const delta = Math.max(0, value - baseline)
  return round(clamp(100 - delta * 8), 0)
}

function scoreHrv(value: number | null, baseline: number | null) {
  if (value == null || baseline == null || baseline <= 0) {
    return null
  }

  const dropPct = Math.max(0, (baseline - value) / baseline)
  return round(clamp(100 - dropPct * 266.7), 0)
}

function scoreSleep(value: number | null) {
  if (value == null) {
    return null
  }

  return round(clamp(value), 0)
}

function scoreLoadRatio(loadRatio: number | null) {
  if (loadRatio == null) {
    return null
  }

  if (loadRatio >= 0.8 && loadRatio <= 1.2) {
    return 100
  }
  if (loadRatio > 1.2) {
    return round(clamp(100 - ((loadRatio - 1.2) / 0.3) * 60), 0)
  }
  return round(clamp(100 - ((0.8 - loadRatio) / 0.3) * 60), 0)
}

function scoreStress(value: number | null) {
  if (value == null) {
    return null
  }

  return round(clamp(100 - value), 0)
}

function weightedAverage(scores: Record<string, number | null>, weights: Record<string, number>) {
  let weightedSum = 0
  let weightSum = 0

  for (const [key, weight] of Object.entries(weights)) {
    const value = scores[key]
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue
    }
    weightedSum += value * weight
    weightSum += weight
  }

  if (weightSum === 0) {
    return null
  }

  return weightedSum / weightSum
}

function getFatigueLevel(score: number | null): TrainingContext["fatigue"]["level"] {
  if (score == null) {
    return "未知"
  }
  if (score >= 80) {
    return "恢复优秀"
  }
  if (score >= 60) {
    return "恢复良好"
  }
  if (score >= 40) {
    return "中度疲劳"
  }
  if (score >= 20) {
    return "重度疲劳"
  }
  return "极度疲劳"
}

function getMostRecentHighIntensityDate(metrics: EnrichedMetric[], activities: EnrichedActivity[]) {
  for (let index = metrics.length - 1; index >= 0; index -= 1) {
    const metric = metrics[index]
    const dayKey = toDateKey(metric.date)
    const dayActivities = activities.filter((activity) => toDateKey(activity.date) === dayKey)
    const highActivityLoad = dayActivities.some(
      (activity) =>
        (activity.trainingLoad != null && activity.trainingLoad >= 180) ||
        (activity.aerobicTrainingEffect != null && activity.aerobicTrainingEffect >= 3.5) ||
        (activity.anaerobicTrainingEffect != null && activity.anaerobicTrainingEffect >= 2.5) ||
        (activity.recoveryHours != null && activity.recoveryHours >= 24)
    )
    const highIntensity =
      (metric.vigorousIntensityMinutes != null && metric.vigorousIntensityMinutes >= 30) ||
      (metric.recoveryHours != null && metric.recoveryHours >= 24) ||
      (metric.acuteChronicLoadRatio != null && metric.acuteChronicLoadRatio > 1.2) ||
      highActivityLoad

    if (highIntensity) {
      return metric.date
    }
  }

  return null
}

function getHoursToBaseline(metrics: EnrichedMetric[], startDate: Date, restingBaseline: number | null, hrvBaseline: number | null) {
  if (restingBaseline == null && hrvBaseline == null) {
    return null
  }

  const startTime = startDate.getTime()
  const recovered = metrics.find((metric) => {
    if (metric.date.getTime() <= startTime) {
      return false
    }

    const restingRecovered = restingBaseline == null || (metric.restingHr != null && metric.restingHr <= restingBaseline + 1)
    const hrvRecovered = hrvBaseline == null || (metric.hrv != null && metric.hrv >= hrvBaseline * 0.95)
    return restingRecovered && hrvRecovered
  })

  if (!recovered) {
    return null
  }

  return round((recovered.date.getTime() - startTime) / (1000 * 60 * 60), 0)
}

function getRecoveryCapacity(hoursToBaseline: number | null, latestDate: Date, lastHighIntensityDate: Date | null): RecoveryCapacity {
  if (hoursToBaseline != null) {
    if (hoursToBaseline <= 48) {
      return "normal"
    }
    if (hoursToBaseline > 72) {
      return "weak"
    }
  }

  if (lastHighIntensityDate) {
    const pendingHours = (latestDate.getTime() - lastHighIntensityDate.getTime()) / (1000 * 60 * 60)
    if (pendingHours > 72) {
      return "weak"
    }
  }

  return "unknown"
}

function buildFallbackReasonAnalysis(context: TrainingContext) {
  const parts: string[] = []

  if (context.today.restingHr != null) {
    const delta = context.abnormalities.restingHr.delta
    parts.push(
      `当日静息心率 ${context.today.restingHr}bpm${delta == null ? "" : delta >= 0 ? `，较基线高 ${Math.abs(delta)}bpm` : `，较基线低 ${Math.abs(delta)}bpm`}`
    )
  }
  if (context.today.hrv != null && context.baseline.hrv.mean != null) {
    const pct = context.abnormalities.hrv.deltaPct
    parts.push(`HRV ${context.today.hrv}ms${pct == null ? "" : `，约为基线的 ${Math.round((1 + pct) * 100)}%`}`)
  }
  if (context.today.sleepScore != null) {
    parts.push(
      `睡眠评分 ${context.today.sleepScore} 分${context.today.sleepInterruptions != null ? `，睡眠中断 ${context.today.sleepInterruptions} 次` : ""}${context.today.sleepDurationHours != null ? `，总睡眠 ${context.today.sleepDurationHours} 小时` : ""}`
    )
  }
  if (context.today.bloodOxygen != null || context.today.trainingReadiness != null) {
    parts.push(
      `辅助恢复信号${context.today.bloodOxygen != null ? `：夜间血氧 ${context.today.bloodOxygen}%` : ""}${context.today.trainingReadiness != null ? `${context.today.bloodOxygen != null ? "，" : "："}训练准备度 ${context.today.trainingReadiness}` : ""}`
    )
  }
  if (context.fatigue.totalScore != null) {
    parts.push(`综合疲劳得分 ${context.fatigue.totalScore} 分，处于${context.fatigue.level}区间`)
  }
  if (context.load.loadRatio != null) {
    parts.push(`负荷比值 ${context.load.loadRatio}，当前负荷${context.load.loadStatus === "balanced" ? "基本均衡" : context.load.loadStatus === "high" ? "偏高" : context.load.loadStatus === "low" ? "偏低" : "需继续观察"}`)
  }
  if (context.activity.latestSession) {
    parts.push(
      `最近一次训练 ${context.activity.latestSession.name}，时长 ${context.activity.latestSession.durationMin ?? "--"} 分钟${context.activity.latestSession.aerobicTrainingEffect != null ? `，有氧训练效果 ${context.activity.latestSession.aerobicTrainingEffect}` : ""}${context.activity.latestSession.recoveryHours != null ? `，建议恢复 ${context.activity.latestSession.recoveryHours} 小时` : ""}`
    )
  }
  parts.push(context.decision.ruleReason)

  const merged = `${parts.join("。")}。`
  return merged.length > 300 ? `${merged.slice(0, 297)}...` : merged
}

function fallbackAnalysis(context: TrainingContext): TrainingAnalysisResult {
  return {
    shouldTrain: context.decision.shouldTrain,
    todayAdvice: context.decision.todayAdvice,
    reasonAnalysis: buildFallbackReasonAnalysis(context),
  }
}

export function buildTrainingContext(metrics: DailyMetricInput[], activities: ActivityInput[]): TrainingContext {
  const sortedMetrics = [...metrics].sort((a, b) => a.date.getTime() - b.date.getTime()).map(enrichMetric)
  const sortedActivities = [...activities].sort((a, b) => a.date.getTime() - b.date.getTime()).map(enrichActivity)
  const latestMetric = sortedMetrics[sortedMetrics.length - 1]
  const latestActivity = sortedActivities[sortedActivities.length - 1] ?? null

  if (!latestMetric) {
    return {
      generatedAt: new Date().toISOString(),
      dateRange: {
        metricStart: null,
        metricEnd: null,
        activityStart: sortedActivities[0] ? toDateKey(sortedActivities[0].date) : null,
        activityEnd: sortedActivities[sortedActivities.length - 1] ? toDateKey(sortedActivities[sortedActivities.length - 1].date) : null,
      },
      baseline: {
        windowDays: 28,
        validDays: 0,
        usedDays: 0,
        restingHr: { mean: null, std: null, lower: null, upper: null, sampleDays: 0 },
        hrv: { mean: null, std: null, lower: null, upper: null, sampleDays: 0 },
        sleepScore: { mean: null, std: null, lower: null, upper: null, sampleDays: 0 },
        sleepInterruptions: { mean: null, std: null, lower: null, upper: null, sampleDays: 0 },
        stress: { mean: null, std: null, lower: null, upper: null, sampleDays: 0 },
      },
      today: {
        date: null,
        restingHr: null,
        hrv: null,
        sleepScore: null,
        sleepDurationHours: null,
        deepSleepHours: null,
        remSleepHours: null,
        sleepInterruptions: null,
        stress: null,
        respiration: null,
        bloodOxygen: null,
        trainingReadiness: null,
        bodyBatteryHigh: null,
        bodyBatteryLow: null,
        sedentaryMinutes: null,
        weight: null,
        vo2Max: null,
        lactateThresholdHr: null,
        acuteTrainingLoad: null,
        chronicTrainingLoad: null,
        loadRatio: null,
        recoveryHours: null,
      },
      abnormalities: {
        restingHr: { value: null, baseline: null, delta: null, deltaPct: null, lower: null, upper: null, level: "unknown" },
        hrv: { value: null, baseline: null, delta: null, deltaPct: null, lower: null, upper: null, level: "unknown" },
        sleepScore: { value: null, baseline: null, delta: null, deltaPct: null, lower: null, upper: null, level: "unknown" },
        sleepInterruptions: { value: null, baseline: null, delta: null, deltaPct: null, lower: null, upper: null, level: "unknown" },
        stress: { value: null, baseline: null, delta: null, deltaPct: null, lower: null, upper: null, level: "unknown" },
      },
      fatigue: {
        componentScores: { hrv: null, sleep: null, restingHr: null, loadRatio: null, stress: null },
        totalScore: null,
        level: "未知",
      },
      load: {
        acuteTrainingLoad: null,
        chronicTrainingLoad: null,
        loadRatio: null,
        loadStatus: "unknown",
        source: "missing",
        recent7dDurationMin: null,
        recent42dAvgWeekDurationMin: null,
        avgTrainingLoad7d: null,
        avgAerobicEffect7d: null,
        avgAnaerobicEffect7d: null,
      },
      activity: {
        sessions7d: 0,
        latestSession: null,
      },
      recovery: {
        recoveryHours: null,
        lastHighIntensityDate: null,
        hoursToBaseline: null,
        recoveryCapacity: "unknown",
      },
      decision: {
        shouldTrain: "慎训",
        todayAdvice: "关键恢复数据不足，建议先做低强度活动。",
        ruleReason: "当前缺少可用于判断训练状态的核心数据，先按保守策略处理。",
      },
      missingData: ["还没有可用于分析的 Garmin 日级数据"],
    }
  }

  const baselineWindow = getWindowBefore(sortedMetrics, latestMetric.date, 28)
  const validBaseline = baselineWindow.filter(isBaselineEligible)
  const baselineMetrics = validBaseline.length >= 7 ? validBaseline : baselineWindow
  const baseline = {
    windowDays: 28,
    validDays: validBaseline.length,
    usedDays: baselineMetrics.length,
    restingHr: buildBaselineStats(baselineMetrics, "restingHr"),
    hrv: buildBaselineStats(baselineMetrics, "hrv"),
    sleepScore: buildBaselineStats(baselineMetrics, "sleepScore"),
    sleepInterruptions: buildBaselineStats(baselineMetrics, "sleepInterruptions"),
    stress: buildBaselineStats(baselineMetrics, "stress"),
  }

  const recentActivities7d = getWindowItems(sortedActivities, latestMetric.date, 7)
  const recentActivities42d = getWindowItems(sortedActivities, latestMetric.date, 42)
  const recent7dDurationMin = sum(recentActivities7d.map((activity) => activity.durationMin))
  const recent42dTotalDurationMin = sum(recentActivities42d.map((activity) => activity.durationMin))
  const recent42dAvgWeekDurationMin = recent42dTotalDurationMin != null ? recent42dTotalDurationMin / 6 : null
  const avgTrainingLoad7d = average(recentActivities7d.map((activity) => activity.trainingLoad))
  const avgAerobicEffect7d = average(recentActivities7d.map((activity) => activity.aerobicTrainingEffect))
  const avgAnaerobicEffect7d = average(recentActivities7d.map((activity) => activity.anaerobicTrainingEffect))

  const acuteTrainingLoad = latestMetric.acuteTrainingLoad ?? round(recent7dDurationMin, 0)
  const chronicTrainingLoad = latestMetric.chronicTrainingLoad ?? round(recent42dAvgWeekDurationMin, 0)
  const loadRatio =
    latestMetric.acuteChronicLoadRatio ??
    (recent7dDurationMin != null && recent42dAvgWeekDurationMin != null && recent42dAvgWeekDurationMin > 0
      ? recent7dDurationMin / recent42dAvgWeekDurationMin
      : acuteTrainingLoad != null && chronicTrainingLoad != null && chronicTrainingLoad > 0
        ? acuteTrainingLoad / chronicTrainingLoad
        : null)
  const loadSource: LoadSource =
    latestMetric.acuteChronicLoadRatio != null || (latestMetric.acuteTrainingLoad != null && latestMetric.chronicTrainingLoad != null)
      ? "garmin"
      : recent7dDurationMin != null && recent42dAvgWeekDurationMin != null
        ? "proxy"
        : "missing"

  const abnormalities = {
    restingHr: getMetricAbnormality({
      value: latestMetric.restingHr,
      stats: baseline.restingHr,
      mildRule: (value, baselineValue) => value >= baselineValue + 5,
      severeRule: (value, baselineValue) => value >= baselineValue + 10,
    }),
    hrv: getMetricAbnormality({
      value: latestMetric.hrv,
      stats: baseline.hrv,
      mildRule: (value, baselineValue) => value <= baselineValue * 0.85,
      severeRule: (value, baselineValue) => value <= baselineValue * 0.7,
    }),
    sleepScore: getMetricAbnormality({
      value: latestMetric.sleepScore,
      stats: baseline.sleepScore,
      mildRule: (value) => value < 60,
      severeRule: (value) => value < 50,
    }),
    sleepInterruptions: getMetricAbnormality({
      value: latestMetric.sleepInterruptions,
      stats: baseline.sleepInterruptions,
      mildRule: (value) => value > 5,
      severeRule: (value) => value > 8,
    }),
    stress: getMetricAbnormality({
      value: latestMetric.stress,
      stats: baseline.stress,
      mildRule: (value, baselineValue) => value >= Math.max(baselineValue + 10, 60),
      severeRule: (value, baselineValue) => value >= Math.max(baselineValue + 20, 75),
    }),
  }

  const componentScores = {
    hrv: scoreHrv(latestMetric.hrv, baseline.hrv.mean),
    sleep: scoreSleep(latestMetric.sleepScore),
    restingHr: scoreRestingHr(latestMetric.restingHr, baseline.restingHr.mean),
    loadRatio: scoreLoadRatio(loadRatio),
    stress: scoreStress(latestMetric.stress),
  }

  const fatigueTotalScore = round(
    weightedAverage(componentScores, {
      hrv: 0.35,
      sleep: 0.25,
      restingHr: 0.15,
      loadRatio: 0.15,
      stress: 0.1,
    }),
    0
  )

  const lastHighIntensityDate = getMostRecentHighIntensityDate(
    getWindowItems(sortedMetrics, latestMetric.date, 14),
    getWindowItems(sortedActivities, latestMetric.date, 14)
  )
  const hoursToBaseline = lastHighIntensityDate ? getHoursToBaseline(sortedMetrics, lastHighIntensityDate, baseline.restingHr.mean, baseline.hrv.mean) : null
  const recoveryCapacity = getRecoveryCapacity(hoursToBaseline, latestMetric.date, lastHighIntensityDate)

  const severeAbnormal = Object.values(abnormalities).some((item) => item.level === "severe")
  let shouldTrain: DecisionStatus = "可训"
  let todayAdvice = "按原定强度正常训练。"
  let ruleReason = "核心恢复指标整体稳定，当前状态满足常规训练条件。"

  if (severeAbnormal || (fatigueTotalScore != null && fatigueTotalScore < 40)) {
    shouldTrain = "不训"
    todayAdvice = "今天不建议训练，优先休息与恢复。"
    ruleReason = "存在重度异常指标或综合疲劳分偏低，当前身体状态不适合安排正式训练。"
  } else if (fatigueTotalScore != null && fatigueTotalScore < 60) {
    shouldTrain = "慎训"
    todayAdvice = "下调训练强度，减少运动量。"
    ruleReason = "综合疲劳分处于中度疲劳区间，今天更适合降强度训练。"
  } else if (fatigueTotalScore != null && fatigueTotalScore >= 80) {
    shouldTrain = "可训"
    todayAdvice = "状态较好，可适度加量训练。"
    ruleReason = "综合疲劳分较高，恢复状态优秀，可在计划内适度增加训练刺激。"
  }

  if (loadRatio != null && loadRatio > 1.5) {
    shouldTrain = shouldTrain === "不训" ? "不训" : "慎训"
    todayAdvice = "负荷偏高，今天必须降低训练强度。"
    ruleReason = "7 天急性负荷明显高于 42 天慢性负荷，存在较高过度训练风险。"
  }

  const latestRecoveryHours = latestMetric.recoveryHours ?? latestActivity?.recoveryHours ?? null
  if (latestRecoveryHours != null && latestRecoveryHours >= 48 && shouldTrain !== "不训") {
    shouldTrain = "慎训"
    todayAdvice = "建议继续恢复，避免高强度训练。"
    ruleReason = "最近一次高强度训练后的建议恢复时长仍偏长，身体尚未完全恢复。"
  }

  if (latestActivity && shouldTrain === "可训") {
    const highRecentStimulus =
      (latestActivity.aerobicTrainingEffect != null && latestActivity.aerobicTrainingEffect >= 4.0) ||
      (latestActivity.anaerobicTrainingEffect != null && latestActivity.anaerobicTrainingEffect >= 3.0) ||
      (latestActivity.trainingLoad != null && latestActivity.trainingLoad >= 250)

    if (highRecentStimulus && latestRecoveryHours != null && latestRecoveryHours >= 24) {
      shouldTrain = "慎训"
      todayAdvice = "近期刺激较大，今天建议控制强度。"
      ruleReason = "最近一次训练刺激偏大且恢复窗口仍在，今天更适合保守安排。"
    }
  }

  const missingData: string[] = []
  if (baseline.validDays < 7) {
    missingData.push("近 28 天有效基线样本不足，已回退到原始 28 天窗口估算。")
  }
  if (latestMetric.restingHr == null) {
    missingData.push("缺少当日静息心率，疲劳判定精度下降。")
  }
  if (latestMetric.hrv == null) {
    missingData.push("缺少当日 HRV，疲劳判定精度下降。")
  }
  if (latestMetric.sleepScore == null) {
    missingData.push("缺少当日睡眠评分，恢复判断偏保守。")
  }
  if (loadSource === "proxy") {
    missingData.push("训练负荷比值使用活动时长代理计算，并非 Garmin 原始 ATL/CTL。")
  }
  if (loadSource === "missing") {
    missingData.push("缺少稳定的训练负荷数据，负荷比值无法参与完整判断。")
  }
  if (latestMetric.sleepInterruptions == null) {
    missingData.push("缺少睡眠中断次数，睡眠质量判断不完整。")
  }
  if (latestMetric.deepSleepHours == null) {
    missingData.push("缺少深睡数据，无法进一步校验恢复质量。")
  }
  if (latestMetric.remSleepHours == null) {
    missingData.push("缺少 REM 睡眠数据，睡眠结构判断不完整。")
  }
  if (latestMetric.bloodOxygen == null) {
    missingData.push("缺少夜间血氧数据，恢复信号少一层校验。")
  }
  if (latestMetric.trainingReadiness == null) {
    missingData.push("缺少训练准备度数据，恢复结论偏保守。")
  }
  if (latestActivity && latestActivity.trainingLoad == null && latestActivity.aerobicTrainingEffect == null && latestActivity.anaerobicTrainingEffect == null) {
    missingData.push("最近训练缺少训练效果或训练负荷字段，活动级刺激判断有限。")
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      metricStart: sortedMetrics[0] ? toDateKey(sortedMetrics[0].date) : null,
      metricEnd: toDateKey(latestMetric.date),
      activityStart: sortedActivities[0] ? toDateKey(sortedActivities[0].date) : null,
      activityEnd: sortedActivities[sortedActivities.length - 1] ? toDateKey(sortedActivities[sortedActivities.length - 1].date) : null,
    },
    baseline,
    today: {
      date: toDateKey(latestMetric.date),
      restingHr: latestMetric.restingHr,
      hrv: latestMetric.hrv,
      sleepScore: latestMetric.sleepScore,
      sleepDurationHours: latestMetric.sleepDurationHours,
      deepSleepHours: latestMetric.deepSleepHours,
      remSleepHours: latestMetric.remSleepHours,
      sleepInterruptions: latestMetric.sleepInterruptions,
      stress: latestMetric.stress,
      respiration: latestMetric.respiration,
      bloodOxygen: latestMetric.bloodOxygen,
      trainingReadiness: latestMetric.trainingReadiness,
      bodyBatteryHigh: latestMetric.bodyBatteryHigh,
      bodyBatteryLow: latestMetric.bodyBatteryLow,
      sedentaryMinutes: latestMetric.sedentaryMinutes,
      weight: latestMetric.weight,
      vo2Max: latestMetric.vo2Max,
      lactateThresholdHr: latestMetric.lactateThresholdHr,
      acuteTrainingLoad: round(acuteTrainingLoad, 0),
      chronicTrainingLoad: round(chronicTrainingLoad, 0),
      loadRatio: round(loadRatio, 2),
      recoveryHours: latestRecoveryHours,
    },
    abnormalities,
    fatigue: {
      componentScores,
      totalScore: fatigueTotalScore,
      level: getFatigueLevel(fatigueTotalScore),
    },
    load: {
      acuteTrainingLoad: round(acuteTrainingLoad, 0),
      chronicTrainingLoad: round(chronicTrainingLoad, 0),
      loadRatio: round(loadRatio, 2),
      loadStatus: getLoadStatus(loadRatio),
      source: loadSource,
      recent7dDurationMin: round(recent7dDurationMin, 0),
      recent42dAvgWeekDurationMin: round(recent42dAvgWeekDurationMin, 0),
      avgTrainingLoad7d: round(avgTrainingLoad7d, 0),
      avgAerobicEffect7d: round(avgAerobicEffect7d, 1),
      avgAnaerobicEffect7d: round(avgAnaerobicEffect7d, 1),
    },
    activity: {
      sessions7d: recentActivities7d.length,
      latestSession: latestActivity
        ? {
            date: toDateKey(latestActivity.date),
            type: latestActivity.type,
            name: latestActivity.name,
            durationMin: latestActivity.durationMin,
            distanceKm: latestActivity.distanceKm,
            averageHeartRate: latestActivity.averageHeartRate,
            maxHeartRate: latestActivity.maxHeartRate,
            aerobicTrainingEffect: latestActivity.aerobicTrainingEffect,
            anaerobicTrainingEffect: latestActivity.anaerobicTrainingEffect,
            trainingLoad: latestActivity.trainingLoad,
            recoveryHours: latestActivity.recoveryHours,
          }
        : null,
    },
    recovery: {
      recoveryHours: latestRecoveryHours,
      lastHighIntensityDate: lastHighIntensityDate ? toDateKey(lastHighIntensityDate) : null,
      hoursToBaseline,
      recoveryCapacity,
    },
    decision: {
      shouldTrain,
      todayAdvice,
      ruleReason,
    },
    missingData,
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

function normalizeDecisionStatus(value: unknown, fallback: DecisionStatus): DecisionStatus {
  return value === "可训" || value === "慎训" || value === "不训" ? value : fallback
}

export function parseTrainingAnalysis(content: string, context: TrainingContext): TrainingAnalysisResult {
  const fallback = fallbackAnalysis(context)

  try {
    const data = JSON.parse(extractJsonObject(content)) as Partial<TrainingAnalysisResult>
    const reasonAnalysis =
      typeof data.reasonAnalysis === "string" && data.reasonAnalysis.trim().length > 0 ? data.reasonAnalysis.trim().slice(0, 300) : fallback.reasonAnalysis

    return {
      shouldTrain: normalizeDecisionStatus(data.shouldTrain, fallback.shouldTrain),
      todayAdvice: typeof data.todayAdvice === "string" && data.todayAdvice.trim() ? data.todayAdvice.trim() : fallback.todayAdvice,
      reasonAnalysis,
    }
  } catch {
    return fallback
  }
}
