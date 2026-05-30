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

function getValuesByPath(source: unknown, path: string): unknown[] {
  const segments = path.split(".")

  function visit(current: unknown, index: number): unknown[] {
    if (current == null) {
      return []
    }

    if (index >= segments.length) {
      return [current]
    }

    const key = segments[index]

    if (Array.isArray(current)) {
      if (key === "*") {
        return current.flatMap((item) => visit(item, index + 1))
      }

      const arrayIndex = Number(key)
      if (Number.isInteger(arrayIndex) && arrayIndex >= 0) {
        return visit(current[arrayIndex], index + 1)
      }

      // Garmin frequently returns arrays of day/device records. Keep traversing
      // the same key across every element so callers do not need hard-coded indexes.
      return current.flatMap((item) => visit(item, index))
    }

    const record = asRecord(current)
    if (!record) {
      return []
    }

    if (key === "*") {
      return Object.values(record).flatMap((item) => visit(item, index + 1))
    }

    return visit(record[key], index + 1)
  }

  return visit(source, 0)
}

function firstNumber(paths: string[], source: unknown): number | null {
  for (const path of paths) {
    const values = getValuesByPath(source, path)
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value
      }
    }
  }

  return null
}

function normalizeWeightKg(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  // Garmin body composition often returns grams; normalize to kilograms for display.
  return value > 500 ? value / 1000 : value
}

export function getRawNumber(paths: string[], source: unknown) {
  return firstNumber(paths, source)
}

function firstValue<T>(paths: string[], source: unknown): T | null {
  for (const path of paths) {
    const values = getValuesByPath(source, path)
    for (const value of values) {
      if (value != null) {
        return value as T
      }
    }
  }

  return null
}

type ActivityDetailDescriptor = {
  key?: string
  metricsIndex?: number
  unit?: {
    factor?: number
  }
}

type ActivityDetailPoint = {
  timestampMs: number | null
  movingDurationSec: number | null
  heartRate: number | null
  power: number | null
}

export type ActivityIntensityResult = {
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
  source: "detail_power" | "detail_heart_rate" | "summary_fallback" | "missing"
}

function normalizeDescriptorMetricValue(rawValue: unknown, factor: number | undefined) {
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return null
  }

  void factor
  return rawValue
}

function getActivityDetailSeries(raw: unknown): ActivityDetailPoint[] {
  const details = asRecord(asRecord(raw)?.details)
  const descriptors = Array.isArray(details?.metricDescriptors) ? (details.metricDescriptors as ActivityDetailDescriptor[]) : []
  const metrics = Array.isArray(details?.activityDetailMetrics) ? (details.activityDetailMetrics as Array<{ metrics?: unknown[] }>) : []

  if (descriptors.length === 0 || metrics.length === 0) {
    return []
  }

  const descriptorMap = new Map<string, ActivityDetailDescriptor>()
  for (const descriptor of descriptors) {
    if (descriptor?.key) {
      descriptorMap.set(descriptor.key, descriptor)
    }
  }

  function getPointValue(metricValues: unknown[] | undefined, key: string) {
    const descriptor = descriptorMap.get(key)
    const index = descriptor?.metricsIndex
    if (!metricValues || index == null || index < 0 || index >= metricValues.length) {
      return null
    }

    return normalizeDescriptorMetricValue(metricValues[index], descriptor?.unit?.factor)
  }

  return metrics
    .map((entry) => {
      const values = Array.isArray(entry?.metrics) ? entry.metrics : undefined
      return {
        timestampMs: getPointValue(values, "directTimestamp"),
        movingDurationSec: getPointValue(values, "sumMovingDuration"),
        heartRate: getPointValue(values, "directHeartRate"),
        power: getPointValue(values, "directPower"),
      }
    })
    .filter((point) => point.timestampMs != null || point.movingDurationSec != null)
}

export function computeActivityIntensityFromDetails(
  raw: unknown,
  options?: {
    averageHeartRate?: number | null
    maxHeartRate?: number | null
    averagePower?: number | null
    normalizedPower?: number | null
    lactateThresholdHr?: number | null
  }
): ActivityIntensityResult {
  const series = getActivityDetailSeries(raw)
  if (series.length < 2) {
    return {
      moderateIntensityMinutes: null,
      vigorousIntensityMinutes: null,
      source: "missing",
    }
  }

  const averageHeartRate = options?.averageHeartRate ?? null
  const maxHeartRate = options?.maxHeartRate ?? null
  const averagePower = options?.averagePower ?? null
  const normalizedPower = options?.normalizedPower ?? null
  const lactateThresholdHr = options?.lactateThresholdHr ?? null

  const moderateHeartRateThreshold =
    lactateThresholdHr != null
      ? lactateThresholdHr * 0.84
      : averageHeartRate != null && maxHeartRate != null
        ? Math.max(averageHeartRate, maxHeartRate * 0.78)
        : averageHeartRate != null
          ? averageHeartRate
          : maxHeartRate != null
            ? maxHeartRate * 0.78
            : null
  const vigorousHeartRateThreshold =
    lactateThresholdHr != null
      ? lactateThresholdHr * 0.95
      : averageHeartRate != null && maxHeartRate != null
        ? Math.max(averageHeartRate * 1.08, maxHeartRate * 0.88)
        : averageHeartRate != null
          ? averageHeartRate * 1.1
          : maxHeartRate != null
            ? maxHeartRate * 0.88
            : null

  const moderatePowerThreshold =
    normalizedPower != null ? normalizedPower * 0.78 : averagePower != null ? averagePower * 1.1 : null
  const vigorousPowerThreshold =
    normalizedPower != null ? normalizedPower * 0.92 : averagePower != null ? averagePower * 1.28 : null

  let moderateSeconds = 0
  let vigorousSeconds = 0
  let usedPower = false
  let usedHeartRate = false

  for (let index = 0; index < series.length - 1; index += 1) {
    const current = series[index]
    const next = series[index + 1]
    if (!current || !next) {
      continue
    }

    const movingDelta =
      current.movingDurationSec != null && next.movingDurationSec != null
        ? next.movingDurationSec - current.movingDurationSec
        : null
    const timestampDelta =
      current.timestampMs != null && next.timestampMs != null
        ? (next.timestampMs - current.timestampMs) / 1000
        : null
    const rawStepSeconds = movingDelta != null && movingDelta > 0 ? movingDelta : timestampDelta != null && timestampDelta > 0 ? timestampDelta : null
    if (rawStepSeconds == null) {
      continue
    }

    const stepSeconds = Math.min(rawStepSeconds, 60)
    if (stepSeconds <= 0) {
      continue
    }

    const heartRateQualified =
      current.heartRate != null &&
      ((vigorousHeartRateThreshold != null && current.heartRate >= vigorousHeartRateThreshold) ||
        (moderateHeartRateThreshold != null && current.heartRate >= moderateHeartRateThreshold))
    const powerQualified =
      current.power != null &&
      ((vigorousPowerThreshold != null && current.power >= vigorousPowerThreshold) ||
        (moderatePowerThreshold != null && current.power >= moderatePowerThreshold))

    if (!heartRateQualified && !powerQualified) {
      continue
    }

    if (powerQualified) {
      usedPower = true
    }
    if (heartRateQualified) {
      usedHeartRate = true
    }

    const isVigorous =
      (current.heartRate != null && vigorousHeartRateThreshold != null && current.heartRate >= vigorousHeartRateThreshold) ||
      (current.power != null && vigorousPowerThreshold != null && current.power >= vigorousPowerThreshold)

    if (isVigorous) {
      vigorousSeconds += stepSeconds
    } else {
      moderateSeconds += stepSeconds
    }
  }

  if (moderateSeconds === 0 && vigorousSeconds === 0) {
    return {
      moderateIntensityMinutes: null,
      vigorousIntensityMinutes: null,
      source: "missing",
    }
  }

  return {
    moderateIntensityMinutes: Math.round(moderateSeconds / 60),
    vigorousIntensityMinutes: Math.round(vigorousSeconds / 60),
    source: usedPower ? "detail_power" : usedHeartRate ? "detail_heart_rate" : "missing",
  }
}

function deriveIntensityMinutes(moderateMinutes: number | null, vigorousMinutes: number | null) {
  if (moderateMinutes == null && vigorousMinutes == null) {
    return null
  }

  // Garmin goals often count vigorous minutes double; use the same fallback
  // when only split minutes are available but a total intensity field is absent.
  return (moderateMinutes ?? 0) + (vigorousMinutes ?? 0) * 2
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
  if (maxPoints <= 0) {
    return points
  }

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

function normalizeSeries(source: unknown, valueKeys: string[], maxPoints = 48): NumericPoint[] {
  if (Array.isArray(source)) {
    return compressPoints(
      source
        .map((item, index) => normalizePoint(item, index, valueKeys))
        .filter((item): item is NumericPoint => item !== null)
        .sort((a, b) => a.label.localeCompare(b.label)),
      maxPoints
    )
  }

  const record = asRecord(source)
  if (!record) {
    return []
  }

  for (const value of Object.values(record)) {
    const nested = normalizeSeries(value, valueKeys, maxPoints)
    if (nested.length >= 2) {
      return nested
    }
  }

  if (Object.values(record).every((value) => typeof value === "number")) {
    return compressPoints(
      Object.entries(record)
        .map(([label, value]) => ({ label, value: Number(value) }))
        .filter((point) => Number.isFinite(point.value) && point.value >= 0),
      maxPoints
    )
  }

  return []
}

export function getMetricDisplayValues(raw: unknown) {
  const trainingReadiness = firstNumber(
    [
      "training_readiness.score",
      "training_readiness.readinessScore",
      "training_readiness.value",
      "morning_training_readiness.score",
      "morning_training_readiness.readinessScore",
      "morning_training_readiness.value",
    ],
    raw
  )

  const bodyBatteryHigh = firstNumber(
    [
      "stats.bodyBatteryHighestValue",
      "stats.bodyBatteryChargedValue",
      "body_battery.bodyBatteryChargedValue",
      "body_battery.bodyBatteryHighestValue",
      "body_battery.charged",
      "body_battery.maxBodyBattery",
      "body_battery.highBodyBattery",
    ],
    raw
  )

  const bodyBatteryLow = firstNumber(
    [
      "stats.bodyBatteryLowestValue",
      "stats.bodyBatteryDrainedValue",
      "body_battery.bodyBatteryDrainedValue",
      "body_battery.bodyBatteryLowestValue",
      "body_battery.drained",
      "body_battery.minBodyBattery",
      "body_battery.lowBodyBattery",
    ],
    raw
  )

  const moderateIntensityMinutes = firstNumber(
    [
      "intensity_minutes.moderateIntensityMinutes",
      "intensity_minutes.moderateMinutes",
      "stats.moderateIntensityMinutes",
    ],
    raw
  )

  const vigorousIntensityMinutes = firstNumber(
    [
      "intensity_minutes.vigorousIntensityMinutes",
      "intensity_minutes.vigorousMinutes",
      "stats.vigorousIntensityMinutes",
    ],
    raw
  )

  const intensityMinutes =
    firstNumber(
      [
        "intensity_minutes.totalIntensityMinutes",
        "intensity_minutes.intensityMinutes",
        "stats.activeTimeInMinutes",
      ],
      raw
    ) ?? deriveIntensityMinutes(moderateIntensityMinutes, vigorousIntensityMinutes)

  const acuteTrainingLoad = firstNumber(
    [
      "training_status_aggregated.acuteTrainingLoad",
      "training_status.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadAcute",
      "training_status.mostRecentTrainingStatus.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadAcute",
      "training_status.acuteTrainingLoad",
      "training_status.currentTrainingLoad",
      "training_status.trainingLoad",
    ],
    raw
  )

  const chronicTrainingLoad = firstNumber(
    [
      "training_status_aggregated.chronicTrainingLoad",
      "training_status.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadChronic",
      "training_status.mostRecentTrainingStatus.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadChronic",
      "training_status.chronicTrainingLoad",
      "training_status.trainingLoadChronic",
    ],
    raw
  )

  const acuteChronicLoadRatio =
    firstNumber(
      [
        "training_status_aggregated.acuteChronicWorkloadRatio",
        "training_status.acuteChronicWorkloadRatio",
        "training_status.acwr",
        "training_status.loadRatio",
      ],
      raw
    ) ??
    (acuteTrainingLoad != null && chronicTrainingLoad != null && chronicTrainingLoad > 0
      ? acuteTrainingLoad / chronicTrainingLoad
      : null)

  return {
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
    steps: firstNumber(["daily_steps.totalSteps", "steps.totalSteps", "stats.totalSteps"], raw),
    trainingReadiness,
    bodyBatteryHigh,
    sleepDurationHours: firstNumber(
      [
        "sleep.dailySleepDTO.sleepTimeSeconds",
        "sleep.sleepTimeSeconds",
        "sleep.totalSleepSeconds",
        "sleep.duration",
        "sleep.sleepDurationSeconds",
        "stats.measurableAsleepDuration",
      ],
      raw
    ),
    deepSleepHours: firstNumber(["sleep.dailySleepDTO.deepSleepSeconds", "sleep.deepSleepSeconds"], raw),
    remSleepHours: firstNumber(["sleep.dailySleepDTO.remSleepSeconds", "sleep.remSleepSeconds"], raw),
    sleepInterruptions: firstNumber(
      ["sleep.dailySleepDTO.awakeCount", "sleep.awakeningsCount", "sleep.restlessMomentsCount", "sleep.sleepScores.awakeningsCount"],
      raw
    ),
    awakeDurationMinutes: firstNumber(
      [
        "sleep.dailySleepDTO.awakeSleepSeconds",
        "sleep.awakeSleepSeconds",
        "sleep.awakeTimeSeconds",
        "sleep.awakeDurationInSeconds",
        "stats.measurableAwakeDuration",
      ],
      raw
    ),
    bodyBatteryLow,
    bloodOxygen: firstNumber(
      [
        "blood_oxygen.avgSpo2",
        "blood_oxygen.averageSpo2",
        "blood_oxygen.averageSpO2",
        "blood_oxygen.averageValue",
        "blood_oxygen.latestSpO2",
        "blood_oxygen.value",
        "stats.averageSpo2",
        "stats.latestSpo2",
      ],
      raw
    ),
    restingCalories: firstNumber(["stats.bmrKilocalories", "stats.bmrCalories", "stats.restingCalories"], raw),
    activeCalories: firstNumber(["stats.activeKilocalories", "stats.activeCalories"], raw),
    intensityMinutes,
    moderateIntensityMinutes,
    vigorousIntensityMinutes,
    floors: firstNumber(["stats.floorsAscended", "floors.totalFloorsClimbed", "floors.floorsAscended", "stats.floorsClimbed"], raw),
    sedentaryMinutes: firstNumber(
      ["stats.sedentarySeconds", "stats.inactiveTimeInSeconds", "stats.sedentaryTimeInSeconds", "steps.sedentarySeconds", "steps.totalSedentarySeconds"],
      raw
    ),
    respiration: firstNumber(
      [
        "respiration.avgWakingRespirationValue",
        "respiration.avgSleepRespirationValue",
        "respiration.averageRespiration",
        "respiration.value",
        "stats.avgWakingRespirationValue",
      ],
      raw
    ),
    enduranceScore: firstNumber(["endurance_score.score", "endurance_score.value"], raw),
    hillScore: firstNumber(["hill_score.score", "hill_score.value"], raw),
    runningTolerance: firstNumber(["running_tolerance.value", "running_tolerance.score"], raw),
    vo2Max: firstNumber(
      [
        "max_metrics.vo2Max",
        "max_metrics.cyclingVo2Max",
        "training_status.mostRecentVO2Max.generic.vo2MaxValue",
        "training_status.mostRecentVO2Max.cycling.vo2MaxValue",
      ],
      raw
    ),
    trainingStatusScore: firstNumber(["training_status.score", "training_status.value"], raw),
    acuteTrainingLoad,
    chronicTrainingLoad,
    acuteChronicLoadRatio,
    lowAerobicLoad: firstNumber(
      [
        "training_status_aggregated.lowAerobicTrainingLoad",
        "training_status.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap.*.monthlyLoadAerobicLow",
        "training_status.lowAerobicTrainingLoad",
        "training_status.trainingLoadBalance.lowAerobicTrainingLoad",
      ],
      raw
    ),
    highAerobicLoad: firstNumber(
      [
        "training_status_aggregated.highAerobicTrainingLoad",
        "training_status.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap.*.monthlyLoadAerobicHigh",
        "training_status.highAerobicTrainingLoad",
        "training_status.trainingLoadBalance.highAerobicTrainingLoad",
      ],
      raw
    ),
    anaerobicLoad: firstNumber(
      [
        "training_status_aggregated.anaerobicTrainingLoad",
        "training_status.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap.*.monthlyLoadAnaerobic",
        "training_status.anaerobicTrainingLoad",
        "training_status.trainingLoadBalance.anaerobicTrainingLoad",
      ],
      raw
    ),
    recoveryHours: firstNumber(
      [
        "training_status_aggregated.recoveryTime",
        "training_status.recoveryTime",
        "training_status.recoveryHours",
        "training_status.mostRecentTrainingStatus.latestTrainingStatusData.*.recoveryTime",
      ],
      raw
    ),
    lactateThresholdHr: firstNumber(
      [
        "user_profile.userData.lactateThresholdHeartRate",
        "user_profile.userData.runningLactateThresholdHeartRate",
        "lactate_threshold.speed_and_heart_rate.heartRate",
        "lactate_threshold.speed_and_heart_rate.hearRate",
        "lactate_threshold.speed_and_heart_rate.heartRateCycling",
        "lactate_threshold.heartRate",
        "lactate_threshold.hearRate",
        "lactate_threshold.heartRateCycling",
      ],
      raw
    ),
  }
}

export function getActivityDisplayValues(raw: unknown) {
  const averageHeartRate = firstNumber(
    [
      "summaryDTO.averageHR",
      "details.averageHR",
      "details.avgHr",
      "averageHR",
      "averageHeartRate",
      "summary.averageHeartRate",
    ],
    raw
  )
  const maxHeartRate = firstNumber(
    [
      "summaryDTO.maxHR",
      "details.maxHR",
      "details.maxHr",
      "maxHR",
      "maxHeartRate",
      "summary.maxHeartRate",
    ],
    raw
  )
  const averagePower = firstNumber(
    [
      "summaryDTO.averagePower",
      "details.averagePower",
      "details.avgPower",
      "averagePower",
    ],
    raw
  )
  const normalizedPower = firstNumber(
    [
      "summaryDTO.normalizedPower",
      "summaryDTO.normPower",
      "details.normalizedPower",
      "details.normPower",
      "normalizedPower",
      "normPower",
    ],
    raw
  )
  const lactateThresholdHr = firstNumber(
    [
      "user_profile.userData.lactateThresholdHeartRate",
      "user_profile.userData.runningLactateThresholdHeartRate",
      "lactate_threshold.speed_and_heart_rate.heartRate",
      "lactate_threshold.speed_and_heart_rate.hearRate",
      "lactate_threshold.speed_and_heart_rate.heartRateCycling",
      "lactate_threshold.heartRate",
      "lactate_threshold.hearRate",
      "lactate_threshold.heartRateCycling",
    ],
    raw
  )
  const summaryModerateIntensityMinutes = firstNumber(
    [
      "summaryDTO.moderateIntensityMinutes",
      "details.moderateIntensityMinutes",
      "moderateIntensityMinutes",
    ],
    raw
  )
  const summaryVigorousIntensityMinutes = firstNumber(
    [
      "summaryDTO.vigorousIntensityMinutes",
      "details.vigorousIntensityMinutes",
      "vigorousIntensityMinutes",
    ],
    raw
  )
  const detailIntensity = computeActivityIntensityFromDetails(raw, {
    averageHeartRate,
    maxHeartRate,
    averagePower,
    normalizedPower,
    lactateThresholdHr,
  })

  return {
    startedAtGmt: firstValue<string>(
      [
        "summaryDTO.startTimeGMT",
        "details.startTimeGMT",
        "startTimeGMT",
      ],
      raw
    ),
    startedAtLocal: firstValue<string>(
      [
        "summaryDTO.startTimeLocal",
        "details.startTimeLocal",
        "startTimeLocal",
      ],
      raw
    ),
    endedAtGmt: firstValue<string>(
      [
        "summaryDTO.endTimeGMT",
        "details.endTimeGMT",
        "endTimeGMT",
      ],
      raw
    ),
    endedAtLocal: firstValue<string>(
      [
        "summaryDTO.endTimeLocal",
        "details.endTimeLocal",
        "endTimeLocal",
      ],
      raw
    ),
    averageHeartRate,
    maxHeartRate,
    averageCadence: firstNumber(
      [
        "summaryDTO.averageBikeCadence",
        "summaryDTO.averageBikeCadenceInRoundsPerMinute",
        "summaryDTO.averageCadence",
        "summaryDTO.averageCadenceInStepsPerMinute",
        "summaryDTO.averageRunningCadenceInStepsPerMinute",
        "summaryDTO.averageRunCadence",
        "summaryDTO.averageRunningCadence",
        "details.averageCadence",
        "details.averageBikeCadence",
        "details.averageBikeCadenceInRoundsPerMinute",
        "details.averageCadenceInStepsPerMinute",
        "details.averageRunningCadenceInStepsPerMinute",
        "details.averageRunningCadence",
        "details.averageRunCadence",
        "details.avgCadence",
        "averageCadence",
        "averageBikeCadence",
        "averageRunningCadenceInStepsPerMinute",
        "averageRunningCadence",
        "averageRunCadence",
        "split_summaries.*.averageBikeCadence",
        "split_summaries.*.averageCadence",
        "laps.*.averageBikeCadence",
        "laps.*.averageCadence",
      ],
      raw
    ),
    averagePower,
    normalizedPower,
    aerobicTrainingEffect: firstNumber(
      [
        "summaryDTO.aerobicTrainingEffect",
        "details.aerobicTrainingEffect",
        "aerobicTrainingEffect",
        "trainingEffect.aerobic",
      ],
      raw
    ),
    anaerobicTrainingEffect: firstNumber(
      [
        "summaryDTO.anaerobicTrainingEffect",
        "details.anaerobicTrainingEffect",
        "anaerobicTrainingEffect",
        "trainingEffect.anaerobic",
      ],
      raw
    ),
    trainingLoad: firstNumber(
      [
        "summaryDTO.exerciseTrainingLoad",
        "summaryDTO.activityTrainingLoad",
        "details.exerciseTrainingLoad",
        "details.trainingLoad",
        "exerciseTrainingLoad",
        "activityTrainingLoad",
      ],
      raw
    ),
    moderateIntensityMinutes: detailIntensity.moderateIntensityMinutes ?? summaryModerateIntensityMinutes,
    vigorousIntensityMinutes: detailIntensity.vigorousIntensityMinutes ?? summaryVigorousIntensityMinutes,
    intensitySource:
      detailIntensity.source !== "missing"
        ? detailIntensity.source
        : summaryModerateIntensityMinutes != null || summaryVigorousIntensityMinutes != null
          ? "summary_fallback"
          : "missing",
    recoveryHours: firstNumber(
      [
        "summaryDTO.recoveryTime",
        "summaryDTO.recoveryTimeInSeconds",
        "summaryDTO.recoveryHours",
        "details.recoveryTime",
        "details.recoveryTimeInSeconds",
        "details.recoveryHours",
        "recoveryTime",
        "recoveryTimeInSeconds",
        "recoveryHours",
        "recommendedRecovery",
      ],
      raw
    ),
    averageSpeed: firstNumber(
      [
        "summaryDTO.averageSpeed",
        "details.averageSpeed",
        "averageSpeed",
      ],
      raw
    ),
    maxSpeed: firstNumber(
      [
        "summaryDTO.maxSpeed",
        "details.maxSpeed",
        "maxSpeed",
      ],
      raw
    ),
    averagePaceSeconds: firstNumber(
      [
        "summaryDTO.averagePaceInSeconds",
        "details.averagePaceInSeconds",
        "averagePaceInSeconds",
        "summaryDTO.avgPace",
      ],
      raw
    ),
    sportLabel: firstValue<string>(
      [
        "activityType.typeKey",
        "summaryDTO.activityTypeDTO.typeKey",
        "details.activityType.typeKey",
      ],
      raw
    ),
  }
}

export const DAILY_TREND_GROUPS: TrendMetricGroup[] = [
  {
    key: "recovery",
    title: "恢复与睡眠",
    description: "聚焦恢复质量、夜间恢复与体能储备。",
    metrics: [
      { key: "sleepScore", title: "睡眠评分", unit: "", source: "stored", storedKey: "sleepScore" },
      {
        key: "weight",
        title: "体重",
        unit: "kg",
        source: "raw",
        paths: ["body_composition.dateWeightList.0.weight", "body_composition.totalAverage.weight", "body_composition.weight"],
      },
      {
        key: "sleepDurationHours",
        title: "睡眠时长",
        unit: "h",
        source: "raw",
        paths: ["sleep.dailySleepDTO.sleepTimeSeconds", "sleep.sleepTimeSeconds", "sleep.totalSleepSeconds", "stats.measurableAsleepDuration"],
      },
      { key: "deepSleepHours", title: "深度睡眠", unit: "h", source: "raw", paths: ["sleep.dailySleepDTO.deepSleepSeconds", "sleep.deepSleepSeconds"] },
      { key: "remSleepHours", title: "REM 睡眠", unit: "h", source: "raw", paths: ["sleep.dailySleepDTO.remSleepSeconds", "sleep.remSleepSeconds"] },
      {
        key: "sleepInterruptions",
        title: "睡眠中断次数",
        unit: "",
        source: "raw",
        paths: ["sleep.dailySleepDTO.awakeCount", "sleep.awakeningsCount", "sleep.restlessMomentsCount"],
      },
      {
        key: "awakeDurationMinutes",
        title: "清醒时长",
        unit: "min",
        source: "raw",
        paths: [
          "sleep.dailySleepDTO.awakeSleepSeconds",
          "sleep.awakeSleepSeconds",
          "sleep.awakeTimeSeconds",
          "stats.measurableAwakeDuration",
        ],
      },
      { key: "hrv", title: "夜间 HRV", unit: "ms", source: "stored", storedKey: "hrv" },
      {
        key: "trainingReadiness",
        title: "训练准备度",
        unit: "",
        source: "raw",
        paths: [
          "training_readiness.score",
          "training_readiness.readinessScore",
          "training_readiness.value",
          "morning_training_readiness.score",
          "morning_training_readiness.readinessScore",
        ],
      },
      {
        key: "bodyBatteryHigh",
        title: "Body Battery 高点",
        unit: "",
        source: "raw",
        paths: [
          "stats.bodyBatteryHighestValue",
          "stats.bodyBatteryChargedValue",
          "body_battery.bodyBatteryChargedValue",
          "body_battery.bodyBatteryHighestValue",
          "body_battery.charged",
          "body_battery.maxBodyBattery",
          "body_battery.highBodyBattery",
        ],
      },
      {
        key: "bodyBatteryLow",
        title: "Body Battery 低点",
        unit: "",
        source: "raw",
        paths: [
          "stats.bodyBatteryLowestValue",
          "stats.bodyBatteryDrainedValue",
          "body_battery.bodyBatteryDrainedValue",
          "body_battery.bodyBatteryLowestValue",
          "body_battery.drained",
          "body_battery.minBodyBattery",
          "body_battery.lowBodyBattery",
        ],
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
        paths: [
          "blood_oxygen.avgSpo2",
          "blood_oxygen.averageSpo2",
          "blood_oxygen.averageSpO2",
          "blood_oxygen.averageValue",
          "blood_oxygen.latestSpO2",
          "stats.averageSpo2",
        ],
      },
      {
        key: "respiration",
        title: "呼吸频率",
        unit: "brpm",
        source: "raw",
        paths: [
          "respiration.avgWakingRespirationValue",
          "respiration.avgSleepRespirationValue",
          "respiration.averageRespiration",
          "respiration.value",
          "stats.avgWakingRespirationValue",
        ],
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
        title: "加权强度分钟",
        unit: "min",
        source: "raw",
        paths: [
          "intensity_minutes.totalIntensityMinutes",
          "intensity_minutes.intensityMinutes",
          "intensity_minutes.moderateIntensityMinutes",
          "stats.moderateIntensityMinutes",
          "stats.vigorousIntensityMinutes",
          "stats.activeTimeInMinutes",
        ],
      },
      {
        key: "moderateIntensityMinutes",
        title: "中等强度分钟",
        unit: "min",
        source: "raw",
        paths: ["intensity_minutes.moderateIntensityMinutes", "intensity_minutes.moderateMinutes", "stats.moderateIntensityMinutes"],
      },
      {
        key: "vigorousIntensityMinutes",
        title: "高强度分钟",
        unit: "min",
        source: "raw",
        paths: ["intensity_minutes.vigorousIntensityMinutes", "intensity_minutes.vigorousMinutes", "stats.vigorousIntensityMinutes"],
      },
      { key: "floors", title: "爬楼层数", unit: "floors", source: "raw", paths: ["stats.floorsAscended", "floors.totalFloorsClimbed", "floors.floorsAscended"] },
      { key: "activeCalories", title: "活动消耗", unit: "kcal", source: "raw", paths: ["stats.activeKilocalories", "stats.activeCalories"] },
      {
        key: "sedentaryMinutes",
        title: "久坐时长",
        unit: "min",
        source: "raw",
        paths: ["stats.sedentarySeconds", "stats.inactiveTimeInSeconds", "stats.sedentaryTimeInSeconds", "steps.sedentarySeconds"],
      },
      { key: "restingCalories", title: "静息消耗", unit: "kcal", source: "raw", paths: ["stats.bmrKilocalories", "stats.bmrCalories", "stats.restingCalories"] },
      {
        key: "acuteTrainingLoad",
        title: "7 天急性负荷",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.acuteTrainingLoad",
          "training_status.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadAcute",
          "training_status.mostRecentTrainingStatus.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadAcute",
          "training_status.acuteTrainingLoad",
          "training_status.currentTrainingLoad",
        ],
      },
      {
        key: "chronicTrainingLoad",
        title: "长期慢性负荷",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.chronicTrainingLoad",
          "training_status.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadChronic",
          "training_status.mostRecentTrainingStatus.latestTrainingStatusData.*.acuteTrainingLoadDTO.dailyTrainingLoadChronic",
          "training_status.chronicTrainingLoad",
          "training_status.trainingLoadChronic",
        ],
      },
      {
        key: "acuteChronicLoadRatio",
        title: "急慢性负荷比",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.acuteChronicWorkloadRatio",
          "training_status.acuteChronicWorkloadRatio",
          "training_status.acwr",
          "training_status.loadRatio",
        ],
      },
      {
        key: "lowAerobicLoad",
        title: "低有氧负荷",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.lowAerobicTrainingLoad",
          "training_status.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap.*.monthlyLoadAerobicLow",
          "training_status.lowAerobicTrainingLoad",
          "training_status.trainingLoadBalance.lowAerobicTrainingLoad",
        ],
      },
      {
        key: "highAerobicLoad",
        title: "高有氧负荷",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.highAerobicTrainingLoad",
          "training_status.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap.*.monthlyLoadAerobicHigh",
          "training_status.highAerobicTrainingLoad",
          "training_status.trainingLoadBalance.highAerobicTrainingLoad",
        ],
      },
      {
        key: "anaerobicLoad",
        title: "无氧负荷",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.anaerobicTrainingLoad",
          "training_status.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap.*.monthlyLoadAnaerobic",
          "training_status.anaerobicTrainingLoad",
          "training_status.trainingLoadBalance.anaerobicTrainingLoad",
        ],
      },
      {
        key: "recoveryHours",
        title: "建议恢复时长",
        unit: "h",
        source: "raw",
        paths: [
          "training_status_aggregated.recoveryTime",
          "training_status.recoveryTime",
          "training_status.recoveryHours",
          "training_status.mostRecentTrainingStatus.latestTrainingStatusData.*.recoveryTime",
        ],
      },
      { key: "enduranceScore", title: "耐力分数", unit: "", source: "raw", paths: ["endurance_score.score", "endurance_score.value"] },
      { key: "hillScore", title: "爬坡分数", unit: "", source: "raw", paths: ["hill_score.score", "hill_score.value"] },
      { key: "runningTolerance", title: "跑步耐受", unit: "", source: "raw", paths: ["running_tolerance.value", "running_tolerance.score"] },
      {
        key: "vo2Max",
        title: "VO2 Max",
        unit: "",
        source: "raw",
        paths: [
          "max_metrics.vo2Max",
          "max_metrics.cyclingVo2Max",
          "training_status.mostRecentVO2Max.generic.vo2MaxValue",
          "training_status.mostRecentVO2Max.cycling.vo2MaxValue",
        ],
      },
      {
        key: "lactateThresholdHr",
        title: "乳酸阈值心率",
        unit: "bpm",
        source: "raw",
        paths: [
          "user_profile.userData.lactateThresholdHeartRate",
          "user_profile.userData.runningLactateThresholdHeartRate",
          "lactate_threshold.speed_and_heart_rate.heartRate",
          "lactate_threshold.speed_and_heart_rate.hearRate",
          "lactate_threshold.heartRate",
          "lactate_threshold.hearRate",
        ],
      },
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

            const fallbackValue =
              rawValue ??
              (metric.source === "raw"
                ? (getMetricDisplayValues(item.raw) as Record<string, number | null>)[metric.key] ?? null
                : null)

            if (fallbackValue == null || !Number.isFinite(fallbackValue)) {
              return null
            }

            const normalizedValue =
              metric.key === "sleepDurationHours"
                ? Number(fallbackValue) / 3600
                : metric.key === "deepSleepHours" || metric.key === "remSleepHours"
                  ? Number(fallbackValue) / 3600
                : metric.key === "awakeDurationMinutes"
                  ? Number(fallbackValue) / 60
                  : metric.key === "sedentaryMinutes"
                    ? Number(fallbackValue) > 1440 ? Number(fallbackValue) / 60 : Number(fallbackValue)
                    : metric.key === "recoveryHours"
                      ? Number(fallbackValue) > 240 ? Number(fallbackValue) / 3600 : Number(fallbackValue)
                  : Number(fallbackValue)

            return {
              label: item.date.slice(5),
              value: Number(
                normalizedValue.toFixed(
                  metric.key === "sleepDurationHours" ||
                    metric.key === "deepSleepHours" ||
                    metric.key === "remSleepHours" ||
                    metric.key === "acuteChronicLoadRatio"
                    ? 1
                    : 0
                )
              ),
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

export function getHeartRateSeries(raw: unknown, maxPoints = 48) {
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

  return normalizeSeries(source, ["heartRate", "value"], maxPoints)
}

export function getStressSeries(raw: unknown, maxPoints = 48) {
  const source =
    firstValue(
      ["stress.stressValuesArray", "stress.stressValues", "stress", "body_battery.stressValuesArray", "body_battery"],
      raw
    ) ?? raw

  return normalizeSeries(source, ["stressLevel", "value"], maxPoints)
}

export function getBodyBatterySeries(raw: unknown, maxPoints = 48) {
  const source =
    firstValue(
      [
        "stress.bodyBatteryValuesArray",
        "body_battery.bodyBatteryValuesArray",
        "body_battery.bodyBatteryValues",
        "body_battery",
      ],
      raw
    ) ?? raw
  return normalizeSeries(source, ["bodyBattery", "value"], maxPoints)
}
