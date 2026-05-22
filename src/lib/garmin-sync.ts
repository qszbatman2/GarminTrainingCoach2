import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"

type GarminPayload = {
  daily_metrics?: Record<string, unknown>
  activities?: Array<Record<string, unknown>>
}

type SyncUserInput = {
  userId: string
  garminEmail: string
  garminPassword: string
  date: string
}

type SyncResult = {
  metricId: string
  activitiesCount: number
  metricComplete: boolean
  incompleteActivitiesCount: number
  dataChanged: boolean
  activityChangesCount: number
}

const REQUIRED_DAILY_KEYS = [
  "stats",
  "sleep",
  "hrv",
  "stress",
  "heart_rates",
  "daily_steps",
  "training_readiness",
]

const REQUIRED_ACTIVITY_KEYS = ["details", "splits", "split_summaries", "hr_in_timezones"]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function getByPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
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

  return date.toISOString().slice(0, 10)
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
    weight: firstNumber(
      [
        "body_composition.dateWeightList.0.weight",
        "body_composition.totalAverage.weight",
        "body_composition.allMetrics.weight",
        "body_composition.weight",
      ],
      raw
    ),
    intensityMinutes: firstNumber(["intensity_minutes.totalIntensityMinutes", "stats.activeTimeInMinutes"], raw),
    steps: firstNumber(["daily_steps.totalSteps", "steps.totalSteps", "stats.totalSteps"], raw),
    trainingReadiness: firstNumber(
      ["training_readiness.score", "training_readiness.readinessScore", "morning_training_readiness.score"],
      raw
    ),
  }
}

export async function fetchGarminPayload(garminEmail: string, garminPassword: string, date: string): Promise<GarminPayload> {
  const pythonServiceUrl = process.env.GARMIN_SERVICE_URL || "http://127.0.0.1:8000"
  const garminRes = await fetch(`${pythonServiceUrl}/api/garmin/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: garminEmail, password: garminPassword, date }),
  })

  if (!garminRes.ok) {
    const errorData = await garminRes.json().catch(() => ({}))
    const detail = typeof errorData?.detail === "string" ? errorData.detail : "Failed to fetch data from Garmin Service"
    throw new Error(detail)
  }

  const payload = await garminRes.json()
  return payload.data ?? {}
}

export async function syncGarminDateForUser({ userId, garminEmail, garminPassword, date }: SyncUserInput): Promise<SyncResult> {
  const existingMetric = await prisma.dailyMetric.findUnique({
    where: {
      userId_date: {
        userId,
        date: new Date(date),
      },
    },
  })
  const existingActivities = await prisma.activity.findMany({
    where: {
      userId,
      date: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lt: new Date(`${date}T23:59:59.999Z`),
      },
    },
  })

  const data = await fetchGarminPayload(garminEmail, garminPassword, date)
  const remoteMetrics = asRecord(data.daily_metrics) ?? {}
  const activities = Array.isArray(data.activities) ? data.activities : []
  const metricMerge = mergeGapData(existingMetric?.raw, remoteMetrics)
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
          date: new Date(date),
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
        date: new Date(date),
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
    const activityMerge = mergeGapData(existingActivity?.raw, activityRecord)
    const mergedActivityRaw = (asRecord(activityMerge.value) ?? activityRecord) as Prisma.InputJsonValue
    const nextName = String(asRecord(mergedActivityRaw)?.activityName ?? existingActivity?.name ?? "Unknown Activity")
    const nextType = String(asRecord(asRecord(mergedActivityRaw)?.activityType)?.typeKey ?? existingActivity?.type ?? "unknown")
    const nextDistance = typeof asRecord(mergedActivityRaw)?.distance === "number" ? (asRecord(mergedActivityRaw)?.distance as number) : existingActivity?.distance ?? null
    const nextDuration = typeof asRecord(mergedActivityRaw)?.duration === "number" ? (asRecord(mergedActivityRaw)?.duration as number) : existingActivity?.duration ?? null
    const activityFieldChanged =
      !existingActivity ||
      existingActivity.name !== nextName ||
      existingActivity.type !== nextType ||
      existingActivity.distance !== nextDistance ||
      existingActivity.duration !== nextDuration

    if (!existingActivity || activityMerge.changed || activityFieldChanged) {
      activityChangesCount += 1
      await prisma.activity.upsert({
        where: { garminId },
        update: {
          name: nextName,
          type: nextType,
          distance: nextDistance,
          duration: nextDuration,
          raw: mergedActivityRaw,
        },
        create: {
          garminId,
          userId,
          name: nextName,
          type: nextType,
          distance: nextDistance,
          duration: nextDuration,
          date: new Date(String(asRecord(mergedActivityRaw)?.startTimeLocal ?? date)),
          raw: mergedActivityRaw,
        },
      })
    }
  }

  return {
    metricId: savedMetric.id,
    activitiesCount: activities.length,
    metricComplete: isMetricComplete(mergedMetricRaw),
    incompleteActivitiesCount,
    dataChanged: shouldWriteMetric || activityChangesCount > 0,
    activityChangesCount,
  }
}
