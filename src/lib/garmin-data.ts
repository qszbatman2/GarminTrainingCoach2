export type NumericPoint = {
  label: string
  value: number
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
    bloodOxygen: firstNumber(
      ["blood_oxygen.avgSpo2", "blood_oxygen.averageSpo2", "blood_oxygen.averageValue", "blood_oxygen.value"],
      raw
    ),
  }
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
