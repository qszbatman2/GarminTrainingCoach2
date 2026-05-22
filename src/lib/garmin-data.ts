export type NumericPoint = {
  label: string
  value: number
}

export type DailyTrendSource = {
  date: string
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

export type TrendMetricDefinition = {
  key: string
  title: string
  unit: string
  source: "stored" | "raw"
  storedKey?: keyof Omit<DailyTrendSource, "date" | "raw">
  paths?: string[]
}

export type TrendMetricGroup = {
  key: string
  title: string
  description: string
  metrics: TrendMetricDefinition[]
}

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

export function getRawNumber(paths: string[], source: unknown) {
  return firstNumber(paths, source)
}

function firstValue<T>(paths: string[], source: unknown): T | null {
  for (const path of paths) {
    const value = getByPath(source, path)
    if (value != null) {
      return value as T
    }
  }

  return null
}

function formatTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function parseTimestamp(rawValue: unknown): Date | null {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const millis = rawValue > 1e12 ? rawValue : rawValue * 1000
    const date = new Date(millis)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  if (typeof rawValue === "string") {
    const date = new Date(rawValue)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  return null
}

function compressPoints(points: NumericPoint[], maxPoints = 48) {
  if (points.length <= maxPoints) {
    return points
  }

  const step = Math.ceil(points.length / maxPoints)
  return points.filter((_, index) => index % step === 0)
}

function normalizePoint(item: unknown, index: number, valueKeys: string[]): NumericPoint | null {
  if (Array.isArray(item)) {
    const [first, second] = item
    const timestamp = parseTimestamp(first)
    if (timestamp && typeof second === "number" && Number.isFinite(second)) {
      return {
        label: formatTimeLabel(timestamp),
        value: second,
      }
    }

    if (typeof first === "number" && Number.isFinite(first)) {
      return {
        label: String(index),
        value: first,
      }
    }
  }

  const record = asRecord(item)
  if (!record) {
    return null
  }

  const value = firstValue<number>(
    [...valueKeys, "value", "heartRate", "stressLevel", "bodyBattery", "averageHeartRate"],
    record
  )
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null
  }

  const timestamp = firstValue<unknown>(
    [
      "timestamp",
      "measurementTimestamp",
      "startTimeInSeconds",
      "startTimeLocal",
      "calendarDate",
      "startGMT",
      "startTimeGMT",
    ],
    record
  )
  const date = parseTimestamp(timestamp)
  if (date) {
    return {
      label: formatTimeLabel(date),
      value,
    }
  }

  const minuteOfDay = firstValue<number>(["minuteOfDay", "offsetInMinutes"], record)
  if (typeof minuteOfDay === "number" && Number.isFinite(minuteOfDay)) {
    const hours = Math.floor(minuteOfDay / 60)
    const minutes = minuteOfDay % 60
    return {
      label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      value,
    }
  }

  return {
    label: String(index),
    value,
  }
}

function normalizeSeries(source: unknown, valueKeys: string[]): NumericPoint[] {
  if (Array.isArray(source)) {
    return compressPoints(
      source
        .map((item, index) => normalizePoint(item, index, valueKeys))
        .filter((item): item is NumericPoint => item !== null)
        .sort((a, b) => a.label.localeCompare(b.label))
    )
  }

  const record = asRecord(source)
  if (!record) {
    return []
  }

  for (const value of Object.values(record)) {
    const nested = normalizeSeries(value, valueKeys)
    if (nested.length >= 2) {
      return nested
    }
  }

  if (Object.values(record).every((value) => typeof value === "number")) {
    return compressPoints(
      Object.entries(record)
        .map(([label, value]) => ({ label, value: Number(value) }))
        .filter((point) => Number.isFinite(point.value) && point.value >= 0)
    )
  }

  return []
}

export function getMetricDisplayValues(raw: unknown) {
  return {
    steps: firstNumber(["daily_steps.totalSteps", "steps.totalSteps", "stats.totalSteps"], raw),
    trainingReadiness: firstNumber(
      ["training_readiness.score", "training_readiness.readinessScore", "morning_training_readiness.score"],
      raw
    ),
    bodyBatteryHigh: firstNumber(
      ["body_battery.bodyBatteryChargedValue", "body_battery.maxBodyBattery", "body_battery.highBodyBattery"],
      raw
    ),
    sleepDurationHours: firstNumber(
      ["sleep.sleepTimeSeconds", "sleep.totalSleepSeconds", "sleep.duration", "sleep.sleepDurationSeconds"],
      raw
    ),
    awakeDurationMinutes: firstNumber(["sleep.awakeSleepSeconds", "sleep.awakeTimeSeconds", "sleep.awakeDurationInSeconds"], raw),
    bodyBatteryLow: firstNumber(
      ["body_battery.bodyBatteryDrainedValue", "body_battery.minBodyBattery", "body_battery.lowBodyBattery"],
      raw
    ),
    bloodOxygen: firstNumber(
      ["blood_oxygen.avgSpo2", "blood_oxygen.averageSpo2", "blood_oxygen.averageValue", "blood_oxygen.value"],
      raw
    ),
    restingCalories: firstNumber(["stats.bmrCalories", "stats.restingCalories"], raw),
    activeCalories: firstNumber(["stats.activeKilocalories", "stats.activeCalories"], raw),
    intensityMinutes: firstNumber(
      ["intensity_minutes.moderateIntensityMinutes", "intensity_minutes.totalIntensityMinutes", "stats.activeTimeInMinutes"],
      raw
    ),
    floors: firstNumber(["floors.totalFloorsClimbed", "floors.floorsAscended", "stats.floorsClimbed"], raw),
    respiration: firstNumber(["respiration.avgWakingRespirationValue", "respiration.averageRespiration", "respiration.value"], raw),
    enduranceScore: firstNumber(["endurance_score.score", "endurance_score.value"], raw),
    hillScore: firstNumber(["hill_score.score", "hill_score.value"], raw),
    runningTolerance: firstNumber(["running_tolerance.value", "running_tolerance.score"], raw),
    vo2Max: firstNumber(["max_metrics.vo2Max", "max_metrics.cyclingVo2Max"], raw),
    trainingStatusScore: firstNumber(["training_status.score", "training_status.value"], raw),
  }
}

export const DAILY_TREND_GROUPS: TrendMetricGroup[] = [
  {
    key: "recovery",
    title: "恢复与睡眠",
    description: "聚焦恢复质量、夜间恢复与体能储备。",
    metrics: [
      { key: "sleepScore", title: "睡眠评分", unit: "", source: "stored", storedKey: "sleepScore" },
      { key: "sleepDurationHours", title: "睡眠时长", unit: "h", source: "raw", paths: ["sleep.sleepTimeSeconds", "sleep.totalSleepSeconds"] },
      { key: "awakeDurationMinutes", title: "清醒时长", unit: "min", source: "raw", paths: ["sleep.awakeSleepSeconds", "sleep.awakeTimeSeconds"] },
      { key: "hrv", title: "夜间 HRV", unit: "ms", source: "stored", storedKey: "hrv" },
      {
        key: "trainingReadiness",
        title: "训练准备度",
        unit: "",
        source: "raw",
        paths: ["training_readiness.score", "training_readiness.readinessScore", "morning_training_readiness.score"],
      },
      {
        key: "bodyBatteryHigh",
        title: "Body Battery 高点",
        unit: "",
        source: "raw",
        paths: ["body_battery.bodyBatteryChargedValue", "body_battery.maxBodyBattery", "body_battery.highBodyBattery"],
      },
      {
        key: "bodyBatteryLow",
        title: "Body Battery 低点",
        unit: "",
        source: "raw",
        paths: ["body_battery.bodyBatteryDrainedValue", "body_battery.minBodyBattery", "body_battery.lowBodyBattery"],
      },
    ],
  },
  {
    key: "cardio",
    title: "心率与压力",
    description: "关注心血管负荷、压力与呼吸恢复。",
    metrics: [
      { key: "restingHr", title: "静息心率", unit: "bpm", source: "stored", storedKey: "restingHr" },
      { key: "stress", title: "平均压力", unit: "", source: "stored", storedKey: "stress" },
      {
        key: "bloodOxygen",
        title: "血氧",
        unit: "%",
        source: "raw",
        paths: ["blood_oxygen.avgSpo2", "blood_oxygen.averageSpo2", "blood_oxygen.averageValue", "blood_oxygen.value"],
      },
      {
        key: "respiration",
        title: "呼吸频率",
        unit: "brpm",
        source: "raw",
        paths: ["respiration.avgWakingRespirationValue", "respiration.averageRespiration", "respiration.value"],
      },
    ],
  },
  {
    key: "activity",
    title: "活动与训练",
    description: "看训练负荷、日常活动量和运动能力指标。",
    metrics: [
      { key: "steps", title: "步数", unit: "steps", source: "raw", paths: ["daily_steps.totalSteps", "steps.totalSteps", "stats.totalSteps"] },
      {
        key: "intensityMinutes",
        title: "强度分钟",
        unit: "min",
        source: "raw",
        paths: ["intensity_minutes.moderateIntensityMinutes", "intensity_minutes.totalIntensityMinutes", "stats.activeTimeInMinutes"],
      },
      { key: "floors", title: "爬楼层数", unit: "floors", source: "raw", paths: ["floors.totalFloorsClimbed", "floors.floorsAscended"] },
      { key: "activeCalories", title: "活动消耗", unit: "kcal", source: "raw", paths: ["stats.activeKilocalories", "stats.activeCalories"] },
      { key: "restingCalories", title: "静息消耗", unit: "kcal", source: "raw", paths: ["stats.bmrCalories", "stats.restingCalories"] },
      { key: "enduranceScore", title: "耐力分数", unit: "", source: "raw", paths: ["endurance_score.score", "endurance_score.value"] },
      { key: "hillScore", title: "爬坡分数", unit: "", source: "raw", paths: ["hill_score.score", "hill_score.value"] },
      { key: "runningTolerance", title: "跑步耐受", unit: "", source: "raw", paths: ["running_tolerance.value", "running_tolerance.score"] },
      { key: "vo2Max", title: "VO2 Max", unit: "", source: "raw", paths: ["max_metrics.vo2Max", "max_metrics.cyclingVo2Max"] },
      { key: "trainingStatusScore", title: "训练状态分", unit: "", source: "raw", paths: ["training_status.score", "training_status.value"] },
    ],
  },
]

export function buildDailyTrendGroups(metrics: DailyTrendSource[]) {
  const sortedMetrics = [...metrics].sort((a, b) => a.date.localeCompare(b.date))

  return DAILY_TREND_GROUPS.map((group) => ({
    ...group,
    metrics: group.metrics
      .map((metric) => {
        const data = sortedMetrics
          .map((item) => {
            const rawValue =
              metric.source === "stored" && metric.storedKey
                ? item[metric.storedKey]
                : metric.paths
                  ? getRawNumber(metric.paths, item.raw)
                  : null

            if (rawValue == null || !Number.isFinite(rawValue)) {
              return null
            }

            const normalizedValue =
              metric.key === "sleepDurationHours"
                ? Number(rawValue) / 3600
                : metric.key === "awakeDurationMinutes"
                  ? Number(rawValue) / 60
                  : Number(rawValue)

            return {
              label: item.date.slice(5),
              value: Number(normalizedValue.toFixed(metric.key === "sleepDurationHours" ? 1 : 0)),
            }
          })
          .filter((point): point is NumericPoint => point !== null)

        return {
          ...metric,
          data,
        }
      })
      .filter((metric) => metric.data.length > 0),
  })).filter((group) => group.metrics.length > 0)
}

export function getHeartRateSeries(raw: unknown) {
  const source =
    firstValue(
      [
        "heart_rates.heartRateValues",
        "heart_rates.heartRateValuesArray",
        "heart_rates",
        "stats.heartRateValues",
      ],
      raw
    ) ?? raw

  return normalizeSeries(source, ["heartRate", "value"])
}

export function getStressSeries(raw: unknown) {
  const source =
    firstValue(
      ["stress.stressValuesArray", "stress.stressValues", "stress", "body_battery.stressValuesArray", "body_battery"],
      raw
    ) ?? raw

  return normalizeSeries(source, ["stressLevel", "value"])
}

export function getBodyBatterySeries(raw: unknown) {
  const source = firstValue(["body_battery.bodyBatteryValuesArray", "body_battery.bodyBatteryValues", "body_battery"], raw) ?? raw
  return normalizeSeries(source, ["bodyBattery", "value"])
}
