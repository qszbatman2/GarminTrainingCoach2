import { Prisma } from "@prisma/client"

import { getGarminFetchPolicy, shouldRetryGarminFetch } from "@/lib/garmin-fetch-policy"
import prisma from "@/lib/prisma"
import { formatShanghaiDateKey, getShanghaiDayRange, parseDateKeyAsUtc, parseGarminDateTime } from "@/lib/shanghai-time"

type GarminPayload = {
  daily_metrics?: Record<string, unknown>
  activities?: Array<Record<string, unknown>>
}

export type GarminSyncMode = "full" | "partial_today"
export type GarminWriteStrategy = "merge_gaps" | "prefer_incoming"

type SyncUserInput = {
  userId: string
  garminEmail: string
  garminPassword: string
  date: string
  mode?: GarminSyncMode
  writeStrategy?: GarminWriteStrategy
}

type SyncResult = {
  metricId: string
  activitiesCount: number
  metricComplete: boolean
  incompleteActivitiesCount: number
  dataChanged: boolean
  activityChangesCount: number
  updatedFields: string[]
}

const REQUIRED_DAILY_KEYS = [
  "stats",
  "sleep",
  "hrv",
  "stress",
  "heart_rates",
  "body_battery",
  "daily_steps",
  "training_readiness",
]

const REQUIRED_ACTIVITY_KEYS = ["details", "splits", "split_summaries", "hr_in_timezones"]
const DAILY_UPDATE_LABELS: Record<string, string[]> = {
  stats: ["静息心率/压力/热量"],
  sleep: ["睡眠"],
  hrv: ["HRV"],
  stress: ["压力"],
  heart_rates: ["心率分时"],
  body_battery: ["Body Battery"],
  daily_steps: ["步数"],
  steps: ["步数"],
  training_readiness: ["训练准备度"],
  morning_training_readiness: ["训练准备度"],
  body_composition: ["体重/身体成分"],
  blood_oxygen: ["血氧"],
  respiration: ["呼吸频率"],
  intensity_minutes: ["强度分钟"],
  floors: ["爬楼层数"],
  max_metrics: ["VO2 Max"],
  training_status: ["训练负荷"],
  training_status_aggregated: ["训练负荷"],
  user_profile: ["乳酸阈值心率"],
  lactate_threshold: ["乳酸阈值心率"],
  endurance_score: ["耐力分数"],
  hill_score: ["爬坡分数"],
  running_tolerance: ["跑步耐受"],
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function getActivityStartDate(raw: unknown, fallback: string) {
  const record = asRecord(raw)

  return parseGarminDateTime(record?.startTimeGMT, "utc") ?? parseGarminDateTime(record?.startTimeLocal, "shanghai") ?? new Date(fallback)
}

function getByPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (Array.isArray(current)) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 0) {
        return current[index]
      }

      return undefined
    }

    const record = asRecord(current)
    if (!record) {
      return undefined
    }

    return record[key]
  }, source)
}

function firstNumber(paths: string[], source: unknown): number | null {
  for (const path of paths) {
    const value = getByPath(source, path)
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function normalizeWeightKg(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  return value > 500 ? value / 1000 : value
}

function dedupeLabels(labels: string[]) {
  return [...new Set(labels.filter(Boolean))]
}

function collectUpdatedMetricLabels(
  existing: unknown,
  incoming: Record<string, unknown>,
  writeStrategy: GarminWriteStrategy
) {
  const existingRecord = asRecord(existing) ?? {}
  const labels: string[] = []

  for (const [key, fieldLabels] of Object.entries(DAILY_UPDATE_LABELS)) {
    const result = mergeData(existingRecord[key], incoming[key], writeStrategy)
    if (result.changed) {
      labels.push(...fieldLabels)
    }
  }

  return dedupeLabels(labels)
}

export function mergeUpdatedFields(...fieldGroups: string[][]) {
  return dedupeLabels(fieldGroups.flat())
}

export function formatUpdatedFieldsSummary(updatedFields: string[]) {
  return updatedFields.length > 0 ? `已更新字段：${updatedFields.join("、")}` : "未发现新增字段"
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) {
    return false
  }

  if (typeof value === "string") {
    return value.trim().length > 0
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
  }

  if (typeof value === "boolean") {
    return true
  }

  if (Array.isArray(value)) {
    return value.length > 0 && value.some((item) => hasMeaningfulValue(item))
  }

  const record = asRecord(value)
  if (!record) {
    return false
  }

  return Object.values(record).some((item) => hasMeaningfulValue(item))
}

function completenessScore(value: unknown): number {
  if (!hasMeaningfulValue(value)) {
    return 0
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return 1
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + completenessScore(item), 0)
  }

  const record = asRecord(value)
  if (!record) {
    return 0
  }

  return Object.values(record).reduce<number>((sum, item) => sum + completenessScore(item), 0)
}

function mergeGapData(existing: unknown, incoming: unknown): { value: unknown; changed: boolean } {
  if (incoming === undefined) {
    return { value: existing, changed: false }
  }

  if (!hasMeaningfulValue(existing)) {
    return { value: incoming, changed: hasMeaningfulValue(incoming) }
  }

  if (!hasMeaningfulValue(incoming)) {
    return { value: existing, changed: false }
  }

  if (Array.isArray(existing) || Array.isArray(incoming)) {
    if (!Array.isArray(existing) || !Array.isArray(incoming)) {
      return { value: existing, changed: false }
    }

    const existingScore = completenessScore(existing)
    const incomingScore = completenessScore(incoming)
    if (incomingScore > existingScore) {
      return { value: incoming, changed: JSON.stringify(existing) !== JSON.stringify(incoming) }
    }

    return { value: existing, changed: false }
  }

  const existingRecord = asRecord(existing)
  const incomingRecord = asRecord(incoming)
  if (existingRecord && incomingRecord) {
    const merged: Record<string, unknown> = { ...existingRecord }
    let changed = false

    for (const [key, incomingValue] of Object.entries(incomingRecord)) {
      const result = mergeGapData(existingRecord[key], incomingValue)
      merged[key] = result.value
      changed = changed || result.changed
    }

    return { value: merged, changed }
  }

  return { value: existing, changed: false }
}

function preferIncomingData(existing: unknown, incoming: unknown): { value: unknown; changed: boolean } {
  if (incoming === undefined) {
    return { value: existing, changed: false }
  }

  if (!hasMeaningfulValue(incoming)) {
    return { value: existing, changed: false }
  }

  if (!hasMeaningfulValue(existing)) {
    return { value: incoming, changed: true }
  }

  if (Array.isArray(existing) || Array.isArray(incoming)) {
    if (!Array.isArray(incoming)) {
      return { value: existing, changed: false }
    }

    return { value: incoming, changed: JSON.stringify(existing) !== JSON.stringify(incoming) }
  }

  const existingRecord = asRecord(existing)
  const incomingRecord = asRecord(incoming)
  if (existingRecord && incomingRecord) {
    const merged: Record<string, unknown> = { ...existingRecord }
    let changed = false

    for (const [key, incomingValue] of Object.entries(incomingRecord)) {
      const result = preferIncomingData(existingRecord[key], incomingValue)
      merged[key] = result.value
      changed = changed || result.changed
    }

    return { value: merged, changed }
  }

  return { value: incoming, changed: JSON.stringify(existing) !== JSON.stringify(incoming) }
}

function mergeData(existing: unknown, incoming: unknown, writeStrategy: GarminWriteStrategy) {
  if (writeStrategy === "prefer_incoming") {
    return preferIncomingData(existing, incoming)
  }

  return mergeGapData(existing, incoming)
}

function shallowEqualMetricSummary(
  left: ReturnType<typeof getMetricSummary>,
  right: ReturnType<typeof getMetricSummary>
) {
  return (
    left.sleepScore === right.sleepScore &&
    left.restingHr === right.restingHr &&
    left.stress === right.stress &&
    left.hrv === right.hrv &&
    left.weight === right.weight &&
    left.intensityMinutes === right.intensityMinutes &&
    left.steps === right.steps &&
    left.trainingReadiness === right.trainingReadiness
  )
}

export function getDateKey(date: Date | string) {
  if (typeof date === "string") {
    return date
  }

  return formatShanghaiDateKey(date)
}

export function isMetricComplete(raw: unknown) {
  const record = asRecord(raw)
  if (!record) {
    return false
  }

  return REQUIRED_DAILY_KEYS.every((key) => record[key] != null)
}

export function isActivityComplete(raw: unknown) {
  const record = asRecord(raw)
  if (!record) {
    return false
  }

  return REQUIRED_ACTIVITY_KEYS.every((key) => record[key] != null)
}

export function getMetricSummary(raw: unknown) {
  return {
    sleepScore: firstNumber(["sleep.dailySleepDTO.sleepScores.overall.value"], raw),
    restingHr: firstNumber(["stats.restingHeartRate"], raw),
    stress: firstNumber(["stats.averageStressLevel"], raw),
    hrv: firstNumber(["hrv.hrvSummary.lastNightAvg"], raw),
    weight: normalizeWeightKg(
      firstNumber(
        [
          "body_composition.dateWeightList.0.weight",
          "body_composition.totalAverage.weight",
          "body_composition.allMetrics.weight",
          "body_composition.weight",
        ],
        raw
      )
    ),
    intensityMinutes: firstNumber(["intensity_minutes.totalIntensityMinutes", "stats.activeTimeInMinutes"], raw),
    steps: firstNumber(["daily_steps.totalSteps", "steps.totalSteps", "stats.totalSteps"], raw),
    trainingReadiness: firstNumber(
      ["training_readiness.score", "training_readiness.readinessScore", "morning_training_readiness.score"],
      raw
    ),
  }
}

export async function fetchGarminPayload(
  garminEmail: string,
  garminPassword: string,
  date: string,
  mode: GarminSyncMode = "full"
): Promise<GarminPayload> {
  const pythonServiceUrl = process.env.GARMIN_SERVICE_URL || "http://127.0.0.1:8000"
  const policy = getGarminFetchPolicy(mode)
  let lastError: unknown

  for (let attempt = 0; attempt <= policy.retryCount; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs)

    try {
      const garminRes = await fetch(`${pythonServiceUrl}/api/garmin/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: garminEmail, password: garminPassword, date, mode }),
        signal: controller.signal,
      })

      if (!garminRes.ok) {
        const errorData = await garminRes.json().catch(() => ({}))
        const detail = typeof errorData?.detail === "string" ? errorData.detail : "Failed to fetch data from Garmin Service"
        throw new Error(detail)
      }

      const payload = await garminRes.json()
      return payload.data ?? {}
    } catch (error: unknown) {
      lastError = error
      if (!shouldRetryGarminFetch(error, attempt, policy.retryCount)) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Garmin 服务请求超时（>${Math.floor(policy.timeoutMs / 1000)}s）`)
        }

        throw error
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new Error(`Garmin 服务请求超时（>${Math.floor(policy.timeoutMs / 1000)}s）`)
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch data from Garmin Service")
}

export async function syncGarminDateForUser({
  userId,
  garminEmail,
  garminPassword,
  date,
  mode = "full",
  writeStrategy = "merge_gaps",
}: SyncUserInput): Promise<SyncResult> {
  const metricDate = parseDateKeyAsUtc(date)
  const activityDateRange = getShanghaiDayRange(metricDate)
  const existingMetric = await prisma.dailyMetric.findUnique({
    where: {
      userId_date: {
        userId,
        date: metricDate,
      },
    },
  })
  const existingActivities = await prisma.activity.findMany({
    where: {
      userId,
      date: {
        gte: activityDateRange.start,
        lt: activityDateRange.endExclusive,
      },
    },
  })

  const data = await fetchGarminPayload(garminEmail, garminPassword, date, mode)
  const remoteMetrics = asRecord(data.daily_metrics) ?? {}
  const metricUpdatedFields = collectUpdatedMetricLabels(existingMetric?.raw, remoteMetrics, writeStrategy)
  const activities = Array.isArray(data.activities) ? data.activities : []
  const metricMerge = mergeData(existingMetric?.raw, remoteMetrics, writeStrategy)
  const mergedMetricRaw = (asRecord(metricMerge.value) ?? remoteMetrics) as Prisma.InputJsonValue
  const metricSummary = getMetricSummary(mergedMetricRaw)
  const previousSummary = getMetricSummary(existingMetric?.raw)
  const metricSummaryChanged = !shallowEqualMetricSummary(previousSummary, metricSummary)

  let savedMetric = existingMetric
  const shouldWriteMetric = !existingMetric || metricMerge.changed || metricSummaryChanged
  if (shouldWriteMetric) {
    savedMetric = await prisma.dailyMetric.upsert({
      where: {
        userId_date: {
          userId,
          date: metricDate,
        },
      },
      update: {
        sleepScore: metricSummary.sleepScore,
        restingHr: metricSummary.restingHr,
        hrv: metricSummary.hrv,
        stress: metricSummary.stress,
        raw: mergedMetricRaw,
      },
      create: {
        userId,
        date: metricDate,
        sleepScore: metricSummary.sleepScore,
        restingHr: metricSummary.restingHr,
        hrv: metricSummary.hrv,
        stress: metricSummary.stress,
        raw: mergedMetricRaw,
      },
    })
  } else if (!savedMetric) {
    throw new Error("保存每日指标失败")
  }

  let incompleteActivitiesCount = 0
  let activityChangesCount = 0
  const existingActivityMap = new Map(existingActivities.map((activity) => [activity.garminId, activity]))
  for (const activity of activities) {
    const activityRecord = asRecord(activity) ?? {}
    if (!isActivityComplete(activityRecord)) {
      incompleteActivitiesCount += 1
    }

    const garminId = String(activityRecord.activityId ?? "")
    if (!garminId) {
      continue
    }

    const existingActivity = existingActivityMap.get(garminId)
    const activityMerge = mergeData(existingActivity?.raw, activityRecord, writeStrategy)
    const mergedActivityRaw = (asRecord(activityMerge.value) ?? activityRecord) as Prisma.InputJsonValue
    const nextName = String(asRecord(mergedActivityRaw)?.activityName ?? existingActivity?.name ?? "Unknown Activity")
    const nextType = String(asRecord(asRecord(mergedActivityRaw)?.activityType)?.typeKey ?? existingActivity?.type ?? "unknown")
    const nextDistance = typeof asRecord(mergedActivityRaw)?.distance === "number" ? (asRecord(mergedActivityRaw)?.distance as number) : existingActivity?.distance ?? null
    const nextDuration = typeof asRecord(mergedActivityRaw)?.duration === "number" ? (asRecord(mergedActivityRaw)?.duration as number) : existingActivity?.duration ?? null
    const nextDate = getActivityStartDate(mergedActivityRaw, date)
    const activityFieldChanged =
      !existingActivity ||
      existingActivity.name !== nextName ||
      existingActivity.type !== nextType ||
      existingActivity.distance !== nextDistance ||
      existingActivity.duration !== nextDuration ||
      existingActivity.date.getTime() !== nextDate.getTime()

    if (!existingActivity || activityMerge.changed || activityFieldChanged) {
      activityChangesCount += 1
      await prisma.activity.upsert({
        where: { garminId },
        update: {
          name: nextName,
          type: nextType,
          distance: nextDistance,
          duration: nextDuration,
          date: nextDate,
          raw: mergedActivityRaw,
        },
        create: {
          garminId,
          userId,
          name: nextName,
          type: nextType,
          distance: nextDistance,
          duration: nextDuration,
          date: nextDate,
          raw: mergedActivityRaw,
        },
      })
    }
  }

  const updatedFields = mergeUpdatedFields(metricUpdatedFields, activityChangesCount > 0 ? ["运动活动明细"] : [])

  return {
    metricId: savedMetric.id,
    activitiesCount: activities.length,
    metricComplete: isMetricComplete(mergedMetricRaw),
    incompleteActivitiesCount,
    dataChanged: shouldWriteMetric || activityChangesCount > 0,
    activityChangesCount,
    updatedFields,
  }
}
