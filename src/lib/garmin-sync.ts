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
  const data = await fetchGarminPayload(garminEmail, garminPassword, date)
  const metrics = asRecord(data.daily_metrics) ?? {}
  const activities = Array.isArray(data.activities) ? data.activities : []
  const metricSummary = getMetricSummary(metrics)

  const savedMetricRaw = metrics as Prisma.InputJsonValue
  const savedMetric = await prisma.dailyMetric.upsert({
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
      raw: savedMetricRaw,
    },
    create: {
      userId,
      date: new Date(date),
      sleepScore: metricSummary.sleepScore,
      restingHr: metricSummary.restingHr,
      hrv: metricSummary.hrv,
      stress: metricSummary.stress,
      raw: savedMetricRaw,
    },
  })

  let incompleteActivitiesCount = 0
  for (const activity of activities) {
    const activityRecord = asRecord(activity) ?? {}
    if (!isActivityComplete(activityRecord)) {
      incompleteActivitiesCount += 1
    }

    await prisma.activity.upsert({
      where: { garminId: String(activityRecord.activityId ?? "") },
      update: {
        name: String(activityRecord.activityName ?? "Unknown Activity"),
        type: String(asRecord(activityRecord.activityType)?.typeKey ?? "unknown"),
        distance: typeof activityRecord.distance === "number" ? activityRecord.distance : null,
        duration: typeof activityRecord.duration === "number" ? activityRecord.duration : null,
        raw: activityRecord as Prisma.InputJsonValue,
      },
      create: {
        garminId: String(activityRecord.activityId ?? ""),
        userId,
        name: String(activityRecord.activityName ?? "Unknown Activity"),
        type: String(asRecord(activityRecord.activityType)?.typeKey ?? "unknown"),
        distance: typeof activityRecord.distance === "number" ? activityRecord.distance : null,
        duration: typeof activityRecord.duration === "number" ? activityRecord.duration : null,
        date: new Date(String(activityRecord.startTimeLocal ?? date)),
        raw: activityRecord as Prisma.InputJsonValue,
      },
    })
  }

  return {
    metricId: savedMetric.id,
    activitiesCount: activities.length,
    metricComplete: isMetricComplete(metrics),
    incompleteActivitiesCount,
  }
}
