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
type ToneHint = "supportive" | "firm"
type WeeklyLoadConclusion = "不足" | "偏低" | "合理" | "偏高" | "过高" | "未知"
type WeeklyOverallConclusion = "训练不足" | "训练合理" | "训练偏多" | "过度风险" | "未知"
type WeeklyLoadFocus = "distance" | "duration"
type WeeklyIntensitySource = "full" | "partial" | "minimal"

type MetricDisplayValues = ReturnType<typeof getMetricDisplayValues>
type ActivityDisplayValues = ReturnType<typeof getActivityDisplayValues>

type EnrichedMetric = DailyMetricInput &
  MetricDisplayValues & {
    sleepDurationHours: number | null
    deepSleepHours: number | null
    remSleepHours: number | null
    awakeDurationMinutes: number | null
    sedentaryMinutes: number | null
  }

type EnrichedActivity = ActivityInput &
  ActivityDisplayValues & {
    durationMin: number | null
    distanceKm: number | null
    recoveryHours: number | null
  }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
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

type PeriodComparison = {
  actual: number | null
  recent4WeekSameProgressAverage: number | null
  expectedToDate: number | null
  projectedWeekTotal: number | null
  monthWeeklyAverage: number | null
  sameProgressRatio: number | null
  weeklyAverageRatio: number | null
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
    daysSinceLastSession: number | null
    consecutiveRestDays: number
    toneHint: ToneHint
    latestSession: {
      date: string
      startedAt: string
      endedAt: string | null
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
    readyAt: string | null
    lastHighIntensityDate: string | null
    hoursToBaseline: number | null
    recoveryCapacity: RecoveryCapacity
  }
  weeklyAssessment: {
    referenceDate: string | null
    weekStart: string | null
    monthStart: string | null
    weekElapsedDays: number
    monthElapsedDays: number
    load: {
      focus: WeeklyLoadFocus
      totals: {
        sessions: number
        durationMin: number | null
        distanceKm: number | null
      }
      duration: PeriodComparison
      distance: PeriodComparison
      sessions: PeriodComparison
      score: number | null
      conclusion: WeeklyLoadConclusion
    }
    intensity: {
      source: WeeklyIntensitySource
      totals: {
        trainingLoad: number | null
        intensityMinutes: number | null
        vigorousIntensityMinutes: number | null
        avgAerobicEffect: number | null
        avgAnaerobicEffect: number | null
      }
      trainingLoad: PeriodComparison
      intensityMinutes: PeriodComparison
      vigorousIntensityMinutes: PeriodComparison
      avgAerobicEffect: {
        actual: number | null
        monthAverage: number | null
        ratio: number | null
      }
      avgAnaerobicEffect: {
        actual: number | null
        monthAverage: number | null
        ratio: number | null
      }
      score: number | null
      conclusion: WeeklyLoadConclusion
    }
    recoverySignals: string[]
    overall: {
      conclusion: WeeklyOverallConclusion
      advice: string
      ruleReason: string
    }
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
  weeklyLoadAssessment: {
    loadConclusion: WeeklyLoadConclusion
    intensityConclusion: WeeklyLoadConclusion
    overallConclusion: WeeklyOverallConclusion
    advice: string
    reasonAnalysis: string
  }
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

function parseGarminDateTime(value: unknown, mode: "utc" | "shanghai") {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    const [, year, month, day, hour, minute, second = "00"] = match
    const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    return new Date(mode === "utc" ? utcMillis : utcMillis - 8 * 60 * 60 * 1000)
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getActivityStartDate(activity: ActivityInput) {
  const raw = asRecord(activity.raw)

  return parseGarminDateTime(raw?.startTimeGMT, "utc") ?? parseGarminDateTime(raw?.startTimeLocal, "shanghai") ?? activity.date
}

function ratio(numerator: number | null, denominator: number | null, digits = 2) {
  if (numerator == null || denominator == null || denominator <= 0) {
    return null
  }

  return round(numerator / denominator, digits)
}

function getWindowItems<T extends { date: Date }>(items: T[], referenceDate: Date, days: number) {
  const end = referenceDate.getTime()
  const start = end - (days - 1) * 24 * 60 * 60 * 1000
  return items.filter((item) => item.date.getTime() >= start && item.date.getTime() <= end)
}

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function startOfWeek(date: Date) {
  const value = startOfDay(date)
  const day = value.getDay()
  const offset = day === 0 ? 6 : day - 1
  value.setDate(value.getDate() - offset)
  return value
}

function startOfMonth(date: Date) {
  const value = startOfDay(date)
  value.setDate(1)
  return value
}

function getRangeItems<T extends { date: Date }>(items: T[], startDate: Date, endDate: Date) {
  const start = startDate.getTime()
  const end = endDate.getTime()
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

function estimateRecoveryHours(activity: {
  durationMin: number | null
  distanceKm: number | null
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
}) {
  const { durationMin, distanceKm, trainingLoad, aerobicTrainingEffect, anaerobicTrainingEffect, moderateIntensityMinutes, vigorousIntensityMinutes } = activity
  const hasSignal =
    durationMin != null ||
    distanceKm != null ||
    trainingLoad != null ||
    aerobicTrainingEffect != null ||
    anaerobicTrainingEffect != null ||
    moderateIntensityMinutes != null ||
    vigorousIntensityMinutes != null

  if (!hasSignal) {
    return null
  }

  const veryLightSession = (durationMin ?? 0) <= 35 && (trainingLoad ?? 0) < 80 && (vigorousIntensityMinutes ?? 0) < 20 && (anaerobicTrainingEffect ?? 0) < 1
  if (veryLightSession) {
    return 2
  }

  const longEnduranceSession = (durationMin ?? 0) >= 150 || (distanceKm ?? 0) >= 70
  if (longEnduranceSession) {
    return 36
  }

  const shortButDemandingSession =
    (durationMin ?? 0) <= 90 &&
    ((trainingLoad ?? 0) >= 80 || (vigorousIntensityMinutes ?? 0) >= 20 || (anaerobicTrainingEffect ?? 0) >= 2 || (aerobicTrainingEffect ?? 0) >= 3)
  if (shortButDemandingSession) {
    return 12
  }

  const mediumLongDemandingSession =
    (durationMin ?? 0) > 90 &&
    ((trainingLoad ?? 0) >= 150 || (vigorousIntensityMinutes ?? 0) >= 40 || (anaerobicTrainingEffect ?? 0) >= 2 || (aerobicTrainingEffect ?? 0) >= 3.5)
  if (mediumLongDemandingSession) {
    return 24
  }

  return 6
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
  }
}

function hasAnalyzableMetricValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
}

function isMetricUsableForAnalysis(metric: EnrichedMetric) {
  return [
    metric.sleepScore,
    metric.restingHr,
    metric.hrv,
    metric.stress,
    metric.sleepDurationHours,
    metric.deepSleepHours,
    metric.remSleepHours,
    metric.sleepInterruptions,
    metric.awakeDurationMinutes,
    metric.bodyBatteryHigh,
    metric.bodyBatteryLow,
    metric.respiration,
    metric.steps,
    metric.intensityMinutes,
    metric.moderateIntensityMinutes,
    metric.vigorousIntensityMinutes,
    metric.weight,
    metric.vo2Max,
    metric.lactateThresholdHr,
    metric.acuteTrainingLoad,
    metric.chronicTrainingLoad,
    metric.acuteChronicLoadRatio,
  ].some(hasAnalyzableMetricValue)
}

function enrichActivity(activity: ActivityInput): EnrichedActivity {
  const displayValues = getActivityDisplayValues(activity.raw)
  const correctedDate = getActivityStartDate(activity)
  const durationMin = activity.duration != null ? round(activity.duration / 60, 0) : null

  return {
    ...activity,
    date: correctedDate,
    ...displayValues,
    durationMin,
    distanceKm: activity.distance != null ? round(activity.distance / 1000, 1) : null,
    recoveryHours: estimateRecoveryHours({
      durationMin,
      distanceKm: activity.distance != null ? round(activity.distance / 1000, 1) : null,
      trainingLoad: displayValues.trainingLoad,
      aerobicTrainingEffect: displayValues.aerobicTrainingEffect,
      anaerobicTrainingEffect: displayValues.anaerobicTrainingEffect,
      moderateIntensityMinutes: displayValues.moderateIntensityMinutes,
      vigorousIntensityMinutes: displayValues.vigorousIntensityMinutes,
    }),
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
  const excessiveIntensity = metric.vigorousIntensityMinutes != null && metric.vigorousIntensityMinutes >= 90
  const overload = metric.acuteChronicLoadRatio != null && metric.acuteChronicLoadRatio > 1.5

  return !(poorSleep || shortSleep || tooManyInterruptions || highStress || excessiveIntensity || overload)
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

function getDaysDiff(later: Date, earlier: Date) {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)))
}

function getElapsedDaysInclusive(startDate: Date, endDate: Date) {
  return getDaysDiff(startOfDay(endDate), startOfDay(startDate)) + 1
}

function getSessionEndedAt(activity: EnrichedActivity | null) {
  if (!activity) {
    return null
  }

  const durationMs = typeof activity.duration === "number" && Number.isFinite(activity.duration) ? activity.duration * 1000 : 0
  return new Date(activity.date.getTime() + durationMs)
}

function getDaysSinceLastSession(referenceDate: Date, activities: EnrichedActivity[]) {
  const latest = activities[activities.length - 1]
  if (!latest) {
    return null
  }

  return getDaysDiff(referenceDate, latest.date)
}

function getConsecutiveRestDays(referenceDate: Date, activities: EnrichedActivity[]) {
  if (activities.length === 0) {
    return 0
  }

  const activityDays = new Set(activities.map((activity) => toDateKey(activity.date)))
  let restDays = 0
  const cursor = new Date(referenceDate)

  while (true) {
    const dayKey = toDateKey(cursor)
    if (activityDays.has(dayKey)) {
      return restDays
    }

    restDays += 1
    cursor.setDate(cursor.getDate() - 1)
    if (restDays > 30) {
      return restDays
    }
  }
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

function buildPeriodComparison(actual: number | null, monthTotal: number | null, weekElapsedDays: number, monthElapsedDays: number): PeriodComparison {
  const monthDailyAverage =
    monthTotal != null && monthElapsedDays > 0 ? monthTotal / monthElapsedDays : null
  const expectedToDate =
    monthDailyAverage != null ? monthDailyAverage * weekElapsedDays : null
  const projectedWeekTotal = actual != null && weekElapsedDays > 0 ? (actual / weekElapsedDays) * 7 : null
  const monthWeeklyAverage = monthDailyAverage != null ? monthDailyAverage * 7 : null

  return {
    actual: round(actual, 1),
    recent4WeekSameProgressAverage: null,
    expectedToDate: round(expectedToDate, 1),
    projectedWeekTotal: round(projectedWeekTotal, 1),
    monthWeeklyAverage: round(monthWeeklyAverage, 1),
    sameProgressRatio: null,
    weeklyAverageRatio: ratio(projectedWeekTotal, monthWeeklyAverage, 2),
  }
}

function getRecentComparableWeekStarts(referenceDate: Date, lookbackWeeks = 4) {
  const currentWeekStart = startOfWeek(referenceDate)
  return Array.from({ length: lookbackWeeks }, (_, index) => {
    const value = new Date(currentWeekStart)
    value.setDate(value.getDate() - (index + 1) * 7)
    return value
  })
}

function sumRangeByWeeks<T>(items: T[], getValue: (item: T) => number | null | undefined) {
  const total = sum(items.map(getValue))
  return total == null ? null : Number(total)
}

function buildSameProgressComparison<T extends { date: Date }>(options: {
  currentItems: T[]
  allItems: T[]
  referenceDate: Date
  weekElapsedDays: number
  getValue: (item: T) => number | null | undefined
}) {
  const { currentItems, allItems, referenceDate, weekElapsedDays, getValue } = options
  const currentTotal = sumRangeByWeeks(currentItems, getValue)
  const comparableWeekStarts = getRecentComparableWeekStarts(referenceDate, 4)
  const weekTotals = comparableWeekStarts
    .map((weekStart) => {
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + weekElapsedDays - 1)
      const rangeItems = getRangeItems(allItems, weekStart, weekEnd)
      return sumRangeByWeeks(rangeItems, getValue)
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  return {
    currentTotal,
    sameProgressAverage: weekTotals.length > 0 ? average(weekTotals) : null,
  }
}

function buildWeeklyProgressComparison(options: {
  actual: number | null
  monthTotal: number | null
  weekElapsedDays: number
  monthElapsedDays: number
  sameProgressAverage: number | null
}): PeriodComparison {
  const { actual, monthTotal, weekElapsedDays, monthElapsedDays, sameProgressAverage } = options
  const base = buildPeriodComparison(actual, monthTotal, weekElapsedDays, monthElapsedDays)

  return {
    ...base,
    recent4WeekSameProgressAverage: round(sameProgressAverage, 1),
    sameProgressRatio: ratio(actual, sameProgressAverage, 2),
  }
}

function getWeeklyLoadConclusion(score: number | null): WeeklyLoadConclusion {
  if (score == null) {
    return "未知"
  }
  if (score < 0.75) {
    return "不足"
  }
  if (score < 0.9) {
    return "偏低"
  }
  if (score <= 1.15) {
    return "合理"
  }
  if (score <= 1.3) {
    return "偏高"
  }
  return "过高"
}

function isDistanceType(activityType: string) {
  const normalized = activityType.toLowerCase()
  return ["run", "running", "ride", "cycling", "bike", "walk", "hike", "trail", "swim", "rowing"].some((keyword) =>
    normalized.includes(keyword)
  )
}

function getWeeklyLoadFocus(activities: EnrichedActivity[]): WeeklyLoadFocus {
  if (activities.length === 0) {
    return "duration"
  }

  const distanceCapableCount = activities.filter((activity) => activity.distanceKm != null && (activity.distanceKm ?? 0) > 0 && isDistanceType(activity.type)).length
  return distanceCapableCount >= Math.ceil(activities.length / 2) ? "distance" : "duration"
}

function buildWeeklyAssessment(options: {
  latestMetric: EnrichedMetric
  metrics: EnrichedMetric[]
  activities: EnrichedActivity[]
  loadRatio: number | null
  latestRecoveryHours: number | null
  abnormalities: TrainingContext["abnormalities"]
}) {
  const { latestMetric, metrics, activities, loadRatio, latestRecoveryHours, abnormalities } = options
  const referenceDate = latestMetric.date
  const weekStart = startOfWeek(referenceDate)
  const monthStart = startOfMonth(referenceDate)
  const weekElapsedDays = getElapsedDaysInclusive(weekStart, referenceDate)
  const monthElapsedDays = getElapsedDaysInclusive(monthStart, referenceDate)

  const weekActivities = getRangeItems(activities, weekStart, referenceDate)
  const monthActivities = getRangeItems(activities, monthStart, referenceDate)
  const weekMetrics = getRangeItems(metrics, weekStart, referenceDate)
  const monthMetrics = getRangeItems(metrics, monthStart, referenceDate)

  const weekDurationMin = sum(weekActivities.map((activity) => activity.durationMin))
  const monthDurationMin = sum(monthActivities.map((activity) => activity.durationMin))
  const weekDistanceKm = sum(weekActivities.map((activity) => activity.distanceKm))
  const monthDistanceKm = sum(monthActivities.map((activity) => activity.distanceKm))
  const weekSessions = weekActivities.length
  const monthSessions = monthActivities.length
  const weekTrainingLoad = sum(weekActivities.map((activity) => activity.trainingLoad))
  const monthTrainingLoad = sum(monthActivities.map((activity) => activity.trainingLoad))
  const weekIntensityMinutes = sum(weekMetrics.map((metric) => metric.intensityMinutes))
  const monthIntensityMinutes = sum(monthMetrics.map((metric) => metric.intensityMinutes))
  const weekVigorousMinutes = sum(weekMetrics.map((metric) => metric.vigorousIntensityMinutes))
  const monthVigorousMinutes = sum(monthMetrics.map((metric) => metric.vigorousIntensityMinutes))
  const weekAvgAerobicEffect = average(weekActivities.map((activity) => activity.aerobicTrainingEffect))
  const monthAvgAerobicEffect = average(monthActivities.map((activity) => activity.aerobicTrainingEffect))
  const weekAvgAnaerobicEffect = average(weekActivities.map((activity) => activity.anaerobicTrainingEffect))
  const monthAvgAnaerobicEffect = average(monthActivities.map((activity) => activity.anaerobicTrainingEffect))

  const durationProgress = buildSameProgressComparison({
    currentItems: weekActivities,
    allItems: activities,
    referenceDate,
    weekElapsedDays,
    getValue: (activity) => activity.durationMin,
  })
  const distanceProgress = buildSameProgressComparison({
    currentItems: weekActivities,
    allItems: activities,
    referenceDate,
    weekElapsedDays,
    getValue: (activity) => activity.distanceKm,
  })
  const sessionProgress = buildSameProgressComparison({
    currentItems: weekActivities,
    allItems: activities,
    referenceDate,
    weekElapsedDays,
    getValue: () => 1,
  })
  const trainingLoadProgress = buildSameProgressComparison({
    currentItems: weekActivities,
    allItems: activities,
    referenceDate,
    weekElapsedDays,
    getValue: (activity) => activity.trainingLoad,
  })
  const intensityMinutesProgress = buildSameProgressComparison({
    currentItems: weekMetrics,
    allItems: metrics,
    referenceDate,
    weekElapsedDays,
    getValue: (metric) => metric.intensityMinutes,
  })
  const vigorousMinutesProgress = buildSameProgressComparison({
    currentItems: weekMetrics,
    allItems: metrics,
    referenceDate,
    weekElapsedDays,
    getValue: (metric) => metric.vigorousIntensityMinutes,
  })

  const loadFocus = getWeeklyLoadFocus(weekActivities.length > 0 ? weekActivities : monthActivities)
  const durationComparison = buildWeeklyProgressComparison({
    actual: weekDurationMin,
    monthTotal: monthDurationMin,
    weekElapsedDays,
    monthElapsedDays,
    sameProgressAverage: durationProgress.sameProgressAverage,
  })
  const distanceComparison = buildWeeklyProgressComparison({
    actual: weekDistanceKm,
    monthTotal: monthDistanceKm,
    weekElapsedDays,
    monthElapsedDays,
    sameProgressAverage: distanceProgress.sameProgressAverage,
  })
  const sessionsComparison = buildWeeklyProgressComparison({
    actual: weekSessions,
    monthTotal: monthSessions,
    weekElapsedDays,
    monthElapsedDays,
    sameProgressAverage: sessionProgress.sameProgressAverage,
  })
  const trainingLoadComparison = buildWeeklyProgressComparison({
    actual: weekTrainingLoad,
    monthTotal: monthTrainingLoad,
    weekElapsedDays,
    monthElapsedDays,
    sameProgressAverage: trainingLoadProgress.sameProgressAverage,
  })
  const intensityMinutesComparison = buildWeeklyProgressComparison({
    actual: weekIntensityMinutes,
    monthTotal: monthIntensityMinutes,
    weekElapsedDays,
    monthElapsedDays,
    sameProgressAverage: intensityMinutesProgress.sameProgressAverage,
  })
  const vigorousMinutesComparison = buildWeeklyProgressComparison({
    actual: weekVigorousMinutes,
    monthTotal: monthVigorousMinutes,
    weekElapsedDays,
    monthElapsedDays,
    sameProgressAverage: vigorousMinutesProgress.sameProgressAverage,
  })

  const loadScore = round(
    weightedAverage(
      loadFocus === "distance"
        ? {
            duration: durationComparison.sameProgressRatio,
            distance: distanceComparison.sameProgressRatio,
            sessions: sessionsComparison.sameProgressRatio,
          }
        : {
            duration: durationComparison.sameProgressRatio,
            sessions: sessionsComparison.sameProgressRatio,
          },
      loadFocus === "distance"
        ? { duration: 0.45, distance: 0.35, sessions: 0.2 }
        : { duration: 0.7, sessions: 0.3 }
    ),
    2
  )

  const hasFullIntensityFields = trainingLoadComparison.sameProgressRatio != null && monthAvgAerobicEffect != null
  const hasPartialIntensityFields = trainingLoadComparison.sameProgressRatio != null
  const intensitySource: WeeklyIntensitySource = hasFullIntensityFields ? "full" : hasPartialIntensityFields ? "partial" : "minimal"
  const aerobicEffectRatio = ratio(weekAvgAerobicEffect, monthAvgAerobicEffect, 2)
  const anaerobicEffectRatio = ratio(weekAvgAnaerobicEffect, monthAvgAnaerobicEffect, 2)
  const intensityScore = round(
    weightedAverage(
      intensitySource === "full"
        ? {
            trainingLoad: trainingLoadComparison.sameProgressRatio,
            aerobic: aerobicEffectRatio,
            anaerobic: anaerobicEffectRatio,
            vigorous: vigorousMinutesComparison.sameProgressRatio,
          }
        : intensitySource === "partial"
          ? {
              trainingLoad: trainingLoadComparison.sameProgressRatio,
              intensityMinutes: intensityMinutesComparison.sameProgressRatio,
              vigorous: vigorousMinutesComparison.sameProgressRatio,
            }
          : {
              intensityMinutes: intensityMinutesComparison.sameProgressRatio,
              vigorous: vigorousMinutesComparison.sameProgressRatio,
              loadRatio: loadRatio,
            },
      intensitySource === "full"
        ? { trainingLoad: 0.45, aerobic: 0.2, anaerobic: 0.15, vigorous: 0.2 }
        : intensitySource === "partial"
          ? { trainingLoad: 0.55, intensityMinutes: 0.2, vigorous: 0.25 }
          : { intensityMinutes: 0.45, vigorous: 0.35, loadRatio: 0.2 }
    ),
    2
  )

  const recoverySignals: string[] = []
  if ((latestMetric.sleepScore ?? 100) < 60) {
    recoverySignals.push(`睡眠评分 ${latestMetric.sleepScore} 分偏低`)
  }
  if ((latestMetric.sleepInterruptions ?? 0) > 5) {
    recoverySignals.push(`睡眠中断 ${latestMetric.sleepInterruptions} 次`)
  }
  if (abnormalities.hrv.level === "mild" || abnormalities.hrv.level === "severe") {
    recoverySignals.push(`HRV 较基线下降 ${Math.round(Math.abs((abnormalities.hrv.deltaPct ?? 0) * 100))}%`)
  }
  if (abnormalities.restingHr.level === "mild" || abnormalities.restingHr.level === "severe") {
    recoverySignals.push(`静息心率较基线升高 ${Math.abs(abnormalities.restingHr.delta ?? 0)}bpm`)
  }
  if ((latestMetric.stress ?? 0) >= 60) {
    recoverySignals.push(`压力评分 ${latestMetric.stress} 偏高`)
  }
  if ((latestRecoveryHours ?? 0) >= 24) {
    recoverySignals.push(`估算恢复时长 ${latestRecoveryHours} 小时`)
  }

  const loadConclusion = getWeeklyLoadConclusion(loadScore)
  const intensityConclusion = getWeeklyLoadConclusion(intensityScore)
  const recoveryWeak = recoverySignals.length >= 2

  let overallConclusion: WeeklyOverallConclusion = "训练合理"
  let advice = "本周节奏基本合理，按当前计划推进即可。"
  let ruleReason = "本周训练量和训练强度与本月平均节奏大体一致，没有明显过量或不足。"

  if (
    (loadRatio != null && loadRatio > 1.5) ||
    (loadConclusion === "过高" && intensityConclusion === "过高") ||
    ((intensityScore ?? 0) > 1.3 && (latestRecoveryHours ?? 0) >= 24) ||
    ((vigorousMinutesComparison.sameProgressRatio ?? 0) > 1.3 && recoverySignals.length >= 2)
  ) {
    overallConclusion = "过度风险"
    advice = "本周负荷已经偏重，立即下调强度并优先恢复。"
    ruleReason = "本周截至当前周进度的训练强度已经明显高于最近 4 周同进度水平，且恢复信号已出现恶化，继续堆量存在过度训练风险。"
  } else if (
    (loadConclusion === "不足" || loadConclusion === "偏低") &&
    (intensityConclusion === "不足" || intensityConclusion === "偏低") &&
    ((loadScore ?? 1) < 0.75 || (intensityScore ?? 1) < 0.8 || (loadRatio ?? 1) < 0.5)
  ) {
    overallConclusion = "训练不足"
    advice = recoveryWeak ? "本周执行偏少，先修复恢复状态，再尽快回到正常训练频率。" : "本周训练明显偏少，接下来别再拖，尽快补回正常训练节奏。"
    ruleReason = recoveryWeak
      ? "本周截至当前周进度的训练量和训练强度都低于最近 4 周同进度水平，但当前恢复信号也不理想，说明不能简单视为执行懈怠。"
      : "本周截至当前周进度的训练量和训练强度都显著低于最近 4 周同进度水平，当前更像训练执行不足而不是恢复性减量。"
  } else if (
    loadConclusion === "偏高" ||
    intensityConclusion === "偏高" ||
    loadConclusion === "过高" ||
    intensityConclusion === "过高" ||
    (loadRatio != null && loadRatio >= 1.2 && loadRatio <= 1.5) ||
    recoveryWeak
  ) {
    overallConclusion = "训练偏多"
    advice = recoveryWeak ? "本周负荷已经偏重，后半周要主动控强度、保恢复。" : "本周训练略偏多，后续保持但别继续加码。"
    ruleReason = recoveryWeak
      ? "本周截至当前周进度的训练量或训练强度已经偏高，同时恢复信号开始走弱，需要及时收住训练刺激。"
      : "本周截至当前周进度的训练节奏略高于最近 4 周同进度水平，但尚未进入明确过度风险区间。"
  }

  return {
    referenceDate: toDateKey(referenceDate),
    weekStart: toDateKey(weekStart),
    monthStart: toDateKey(monthStart),
    weekElapsedDays,
    monthElapsedDays,
    load: {
      focus: loadFocus,
      totals: {
        sessions: weekSessions,
        durationMin: round(weekDurationMin, 0),
        distanceKm: round(weekDistanceKm, 1),
      },
      duration: durationComparison,
      distance: distanceComparison,
      sessions: sessionsComparison,
      score: loadScore,
      conclusion: loadConclusion,
    },
    intensity: {
      source: intensitySource,
      totals: {
        trainingLoad: round(weekTrainingLoad, 0),
        intensityMinutes: round(weekIntensityMinutes, 0),
        vigorousIntensityMinutes: round(weekVigorousMinutes, 0),
        avgAerobicEffect: round(weekAvgAerobicEffect, 1),
        avgAnaerobicEffect: round(weekAvgAnaerobicEffect, 1),
      },
      trainingLoad: trainingLoadComparison,
      intensityMinutes: intensityMinutesComparison,
      vigorousIntensityMinutes: vigorousMinutesComparison,
      avgAerobicEffect: {
        actual: round(weekAvgAerobicEffect, 1),
        monthAverage: round(monthAvgAerobicEffect, 1),
        ratio: aerobicEffectRatio,
      },
      avgAnaerobicEffect: {
        actual: round(weekAvgAnaerobicEffect, 1),
        monthAverage: round(monthAvgAnaerobicEffect, 1),
        ratio: anaerobicEffectRatio,
      },
      score: intensityScore,
      conclusion: intensityConclusion,
    },
    recoverySignals,
    overall: {
      conclusion: overallConclusion,
      advice,
      ruleReason,
    },
  }
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
  if (context.fatigue.totalScore != null) {
    parts.push(`综合疲劳得分 ${context.fatigue.totalScore} 分，处于${context.fatigue.level}区间`)
  }
  if (context.load.loadRatio != null) {
    parts.push(`负荷比值 ${context.load.loadRatio}，当前负荷${context.load.loadStatus === "balanced" ? "基本均衡" : context.load.loadStatus === "high" ? "偏高" : context.load.loadStatus === "low" ? "偏低" : "需继续观察"}`)
  }
  if (context.activity.latestSession) {
    parts.push(
      `最近一次训练 ${context.activity.latestSession.name}，时长 ${context.activity.latestSession.durationMin ?? "--"} 分钟${context.activity.latestSession.aerobicTrainingEffect != null ? `，有氧训练效果 ${context.activity.latestSession.aerobicTrainingEffect}` : ""}${context.activity.latestSession.recoveryHours != null ? `，估算恢复 ${context.activity.latestSession.recoveryHours} 小时` : ""}`
    )
  }
  parts.push(context.decision.ruleReason)

  const merged = `${parts.join("。")}。`
  return merged.length > 300 ? `${merged.slice(0, 297)}...` : merged
}

function buildFallbackWeeklyAssessment(context: TrainingContext) {
  const parts: string[] = []
  const weekly = context.weeklyAssessment
  const durationActual = weekly.load.duration.actual
  const durationSameProgress = weekly.load.duration.recent4WeekSameProgressAverage
  const distanceActual = weekly.load.distance.actual
  const distanceSameProgress = weekly.load.distance.recent4WeekSameProgressAverage
  const trainingLoadActual = weekly.intensity.trainingLoad.actual
  const trainingLoadSameProgress = weekly.intensity.trainingLoad.recent4WeekSameProgressAverage
  const vigorousActual = weekly.intensity.vigorousIntensityMinutes.actual
  const vigorousSameProgress = weekly.intensity.vigorousIntensityMinutes.recent4WeekSameProgressAverage

  parts.push(
    `本周一到今天累计训练 ${weekly.load.totals.sessions} 次${durationActual != null ? `、总时长 ${durationActual} 分钟` : ""}${distanceActual != null ? `、总距离 ${distanceActual}km` : ""}`
  )
  if (durationSameProgress != null || distanceSameProgress != null) {
    parts.push(
      `对比最近 4 周同样周进度${durationSameProgress != null ? `，同进度平均时长约 ${durationSameProgress} 分钟` : ""}${distanceSameProgress != null ? `${durationSameProgress != null ? "，" : "，"}同进度平均距离约 ${distanceSameProgress}km` : ""}`
    )
  }
  if (trainingLoadActual != null || vigorousActual != null) {
    parts.push(
      `训练强度方面${trainingLoadActual != null ? `，本周训练负荷 ${trainingLoadActual}` : ""}${trainingLoadSameProgress != null ? `，最近 4 周同进度平均约 ${trainingLoadSameProgress}` : ""}${vigorousActual != null ? `，高强度分钟 ${vigorousActual}` : ""}${vigorousSameProgress != null ? `，最近 4 周同进度平均约 ${vigorousSameProgress}` : ""}`
    )
  }
  if (context.load.loadRatio != null) {
    parts.push(`当前 ATL/CTL 为 ${context.load.loadRatio}`)
  }
  if (weekly.recoverySignals.length > 0) {
    parts.push(`恢复校正信号包括：${weekly.recoverySignals.slice(0, 2).join("、")}`)
  }
  parts.push(weekly.overall.ruleReason)

  const merged = `${parts.join("。")}。`
  return merged.length > 300 ? `${merged.slice(0, 297)}...` : merged
}

function fallbackAnalysis(context: TrainingContext): TrainingAnalysisResult {
  return {
    shouldTrain: context.decision.shouldTrain,
    todayAdvice: context.decision.todayAdvice,
    reasonAnalysis: buildFallbackReasonAnalysis(context),
    weeklyLoadAssessment: {
      loadConclusion: context.weeklyAssessment.load.conclusion,
      intensityConclusion: context.weeklyAssessment.intensity.conclusion,
      overallConclusion: context.weeklyAssessment.overall.conclusion,
      advice: context.weeklyAssessment.overall.advice,
      reasonAnalysis: buildFallbackWeeklyAssessment(context),
    },
  }
}

export function buildTrainingContext(metrics: DailyMetricInput[], activities: ActivityInput[]): TrainingContext {
  const sortedMetrics = [...metrics].sort((a, b) => a.date.getTime() - b.date.getTime()).map(enrichMetric)
  const sortedActivities = [...activities].sort((a, b) => a.date.getTime() - b.date.getTime()).map(enrichActivity)
  const latestMetric = [...sortedMetrics].reverse().find(isMetricUsableForAnalysis) ?? null
  const latestActivity = sortedActivities[sortedActivities.length - 1] ?? null
  const skippedRecentMetricDates = latestMetric
    ? sortedMetrics.filter((metric) => metric.date.getTime() > latestMetric.date.getTime() && !isMetricUsableForAnalysis(metric)).map((metric) => toDateKey(metric.date))
    : []

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
        daysSinceLastSession: null,
        consecutiveRestDays: 0,
        toneHint: "supportive",
        latestSession: null,
      },
      recovery: {
        recoveryHours: null,
        readyAt: null,
        lastHighIntensityDate: null,
        hoursToBaseline: null,
        recoveryCapacity: "unknown",
      },
      weeklyAssessment: {
        referenceDate: null,
        weekStart: null,
        monthStart: null,
        weekElapsedDays: 0,
        monthElapsedDays: 0,
        load: {
          focus: "duration",
          totals: { sessions: 0, durationMin: null, distanceKm: null },
          duration: { actual: null, recent4WeekSameProgressAverage: null, expectedToDate: null, projectedWeekTotal: null, monthWeeklyAverage: null, sameProgressRatio: null, weeklyAverageRatio: null },
          distance: { actual: null, recent4WeekSameProgressAverage: null, expectedToDate: null, projectedWeekTotal: null, monthWeeklyAverage: null, sameProgressRatio: null, weeklyAverageRatio: null },
          sessions: { actual: null, recent4WeekSameProgressAverage: null, expectedToDate: null, projectedWeekTotal: null, monthWeeklyAverage: null, sameProgressRatio: null, weeklyAverageRatio: null },
          score: null,
          conclusion: "未知",
        },
        intensity: {
          source: "minimal",
          totals: { trainingLoad: null, intensityMinutes: null, vigorousIntensityMinutes: null, avgAerobicEffect: null, avgAnaerobicEffect: null },
          trainingLoad: { actual: null, recent4WeekSameProgressAverage: null, expectedToDate: null, projectedWeekTotal: null, monthWeeklyAverage: null, sameProgressRatio: null, weeklyAverageRatio: null },
          intensityMinutes: { actual: null, recent4WeekSameProgressAverage: null, expectedToDate: null, projectedWeekTotal: null, monthWeeklyAverage: null, sameProgressRatio: null, weeklyAverageRatio: null },
          vigorousIntensityMinutes: { actual: null, recent4WeekSameProgressAverage: null, expectedToDate: null, projectedWeekTotal: null, monthWeeklyAverage: null, sameProgressRatio: null, weeklyAverageRatio: null },
          avgAerobicEffect: { actual: null, monthAverage: null, ratio: null },
          avgAnaerobicEffect: { actual: null, monthAverage: null, ratio: null },
          score: null,
          conclusion: "未知",
        },
        recoverySignals: [],
        overall: {
          conclusion: "未知",
          advice: "当前周训练数据不足，暂时无法评估本周训练量是否合理。",
          ruleReason: "缺少足够的本周训练与月度对照数据，无法形成可靠的周节奏判断。",
        },
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
  const daysSinceLastSession = getDaysSinceLastSession(latestMetric.date, sortedActivities)
  const consecutiveRestDays = getConsecutiveRestDays(latestMetric.date, sortedActivities)
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
  const latestRecoveryHours = latestActivity?.recoveryHours ?? null
  const latestSessionEndedAt = getSessionEndedAt(latestActivity)
  const recoveryReadyAt =
    latestSessionEndedAt && latestRecoveryHours != null
      ? new Date(latestSessionEndedAt.getTime() + latestRecoveryHours * 60 * 60 * 1000).toISOString()
      : null
  const weeklyAssessment = buildWeeklyAssessment({
    latestMetric,
    metrics: sortedMetrics,
    activities: sortedActivities,
    loadRatio,
    latestRecoveryHours,
    abnormalities,
  })

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

  if (latestRecoveryHours != null && latestRecoveryHours >= 48 && shouldTrain !== "不训") {
    shouldTrain = "慎训"
    todayAdvice = "建议继续恢复，避免高强度训练。"
    ruleReason = "最近一次训练的估算恢复时长仍偏长，身体尚未完全恢复。"
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

  const firmPushScenario =
    shouldTrain === "可训" &&
    consecutiveRestDays >= 2 &&
    (fatigueTotalScore == null || fatigueTotalScore >= 60) &&
    (loadRatio == null || loadRatio >= 0.5) &&
    (latestRecoveryHours == null || latestRecoveryHours < 24)

  let toneHint: ToneHint = "supportive"
  if (firmPushScenario) {
    toneHint = "firm"
    todayAdvice =
      consecutiveRestDays >= 4
        ? `你已经连续休息 ${consecutiveRestDays} 天，今天别再拖，必须恢复正常训练节奏。`
        : `你已经连续休息 ${consecutiveRestDays} 天，今天别再找理由，按计划完成训练。`
    ruleReason =
      consecutiveRestDays >= 4
        ? `身体状态允许训练，但你已经连续 ${consecutiveRestDays} 天没有完成训练，当前更需要重启执行而不是继续休息。`
        : `身体恢复指标允许训练，但你已经连续 ${consecutiveRestDays} 天没有训练，今天应优先恢复执行力。`
  }

  const missingData: string[] = []
  if (baseline.validDays < 7) {
    missingData.push("近 28 天有效基线样本不足，已回退到原始 28 天窗口估算。")
  }
  if (skippedRecentMetricDates.length > 0) {
    missingData.push(`已跳过最近 ${skippedRecentMetricDates.length} 天的空白 Garmin 日数据（${skippedRecentMetricDates.join("、")}），避免把未同步成功误判为休息日。`)
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
      daysSinceLastSession,
      consecutiveRestDays,
      toneHint,
      latestSession: latestActivity
        ? {
            date: toDateKey(latestActivity.date),
            startedAt: latestActivity.date.toISOString(),
            endedAt: latestSessionEndedAt?.toISOString() ?? null,
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
      readyAt: recoveryReadyAt,
      lastHighIntensityDate: lastHighIntensityDate ? toDateKey(lastHighIntensityDate) : null,
      hoursToBaseline,
      recoveryCapacity,
    },
    weeklyAssessment,
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

function normalizeWeeklyLoadConclusion(value: unknown, fallback: WeeklyLoadConclusion): WeeklyLoadConclusion {
  return value === "不足" || value === "偏低" || value === "合理" || value === "偏高" || value === "过高" || value === "未知" ? value : fallback
}

function normalizeWeeklyOverallConclusion(value: unknown, fallback: WeeklyOverallConclusion): WeeklyOverallConclusion {
  return value === "训练不足" || value === "训练合理" || value === "训练偏多" || value === "过度风险" || value === "未知" ? value : fallback
}

export function parseTrainingAnalysis(content: string, context: TrainingContext): TrainingAnalysisResult {
  const fallback = fallbackAnalysis(context)

  try {
    const data = JSON.parse(extractJsonObject(content)) as Partial<TrainingAnalysisResult>
    const reasonAnalysis =
      typeof data.reasonAnalysis === "string" && data.reasonAnalysis.trim().length > 0 ? data.reasonAnalysis.trim().slice(0, 300) : fallback.reasonAnalysis
    const weeklyData = typeof data.weeklyLoadAssessment === "object" && data.weeklyLoadAssessment ? data.weeklyLoadAssessment as Partial<TrainingAnalysisResult["weeklyLoadAssessment"]> : {}

    return {
      shouldTrain: normalizeDecisionStatus(data.shouldTrain, fallback.shouldTrain),
      todayAdvice: typeof data.todayAdvice === "string" && data.todayAdvice.trim() ? data.todayAdvice.trim() : fallback.todayAdvice,
      reasonAnalysis,
      weeklyLoadAssessment: {
        loadConclusion: normalizeWeeklyLoadConclusion(weeklyData.loadConclusion, fallback.weeklyLoadAssessment.loadConclusion),
        intensityConclusion: normalizeWeeklyLoadConclusion(weeklyData.intensityConclusion, fallback.weeklyLoadAssessment.intensityConclusion),
        overallConclusion: normalizeWeeklyOverallConclusion(weeklyData.overallConclusion, fallback.weeklyLoadAssessment.overallConclusion),
        advice: typeof weeklyData.advice === "string" && weeklyData.advice.trim() ? weeklyData.advice.trim() : fallback.weeklyLoadAssessment.advice,
        reasonAnalysis:
          typeof weeklyData.reasonAnalysis === "string" && weeklyData.reasonAnalysis.trim()
            ? weeklyData.reasonAnalysis.trim().slice(0, 300)
            : fallback.weeklyLoadAssessment.reasonAnalysis,
      },
    }
  } catch {
    return fallback
  }
}
