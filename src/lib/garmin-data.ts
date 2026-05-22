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

  // Garmin body composition often returns grams; normalize to kilograms for display.
  return value > 500 ? value / 1000 : value
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
    deepSleepHours: firstNumber(["sleep.dailySleepDTO.deepSleepSeconds", "sleep.deepSleepSeconds"], raw),
    remSleepHours: firstNumber(["sleep.dailySleepDTO.remSleepSeconds", "sleep.remSleepSeconds"], raw),
    sleepInterruptions: firstNumber(
      ["sleep.dailySleepDTO.awakeCount", "sleep.awakeningsCount", "sleep.restlessMomentsCount", "sleep.sleepScores.awakeningsCount"],
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
    moderateIntensityMinutes: firstNumber(
      ["intensity_minutes.moderateIntensityMinutes", "intensity_minutes.moderateMinutes"],
      raw
    ),
    vigorousIntensityMinutes: firstNumber(
      ["intensity_minutes.vigorousIntensityMinutes", "intensity_minutes.vigorousMinutes"],
      raw
    ),
    floors: firstNumber(["floors.totalFloorsClimbed", "floors.floorsAscended", "stats.floorsClimbed"], raw),
    sedentaryMinutes: firstNumber(
      ["stats.inactiveTimeInSeconds", "stats.sedentaryTimeInSeconds", "steps.sedentarySeconds", "steps.totalSedentarySeconds"],
      raw
    ),
    respiration: firstNumber(["respiration.avgWakingRespirationValue", "respiration.averageRespiration", "respiration.value"], raw),
    enduranceScore: firstNumber(["endurance_score.score", "endurance_score.value"], raw),
    hillScore: firstNumber(["hill_score.score", "hill_score.value"], raw),
    runningTolerance: firstNumber(["running_tolerance.value", "running_tolerance.score"], raw),
    vo2Max: firstNumber(["max_metrics.vo2Max", "max_metrics.cyclingVo2Max"], raw),
    trainingStatusScore: firstNumber(["training_status.score", "training_status.value"], raw),
    acuteTrainingLoad: firstNumber(
      [
        "training_status_aggregated.acuteTrainingLoad",
        "training_status.acuteTrainingLoad",
        "training_status.currentTrainingLoad",
        "training_status.trainingLoad",
      ],
      raw
    ),
    chronicTrainingLoad: firstNumber(
      [
        "training_status_aggregated.chronicTrainingLoad",
        "training_status.chronicTrainingLoad",
        "training_status.trainingLoadChronic",
      ],
      raw
    ),
    acuteChronicLoadRatio: firstNumber(
      [
        "training_status_aggregated.acuteChronicWorkloadRatio",
        "training_status.acuteChronicWorkloadRatio",
        "training_status.acwr",
        "training_status.loadRatio",
      ],
      raw
    ),
    lowAerobicLoad: firstNumber(
      [
        "training_status_aggregated.lowAerobicTrainingLoad",
        "training_status.lowAerobicTrainingLoad",
        "training_status.trainingLoadBalance.lowAerobicTrainingLoad",
      ],
      raw
    ),
    highAerobicLoad: firstNumber(
      [
        "training_status_aggregated.highAerobicTrainingLoad",
        "training_status.highAerobicTrainingLoad",
        "training_status.trainingLoadBalance.highAerobicTrainingLoad",
      ],
      raw
    ),
    anaerobicLoad: firstNumber(
      [
        "training_status_aggregated.anaerobicTrainingLoad",
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
      ],
      raw
    ),
    lactateThresholdHr: firstNumber(
      [
        "user_profile.userData.lactateThresholdHeartRate",
        "user_profile.userData.runningLactateThresholdHeartRate",
        "lactate_threshold.0.hearRate",
        "lactate_threshold.1.hearRate",
        "lactate_threshold.0.heartRateCycling",
        "lactate_threshold.1.heartRateCycling",
      ],
      raw
    ),
  }
}

export function getActivityDisplayValues(raw: unknown) {
  return {
    averageHeartRate: firstNumber(
      [
        "summaryDTO.averageHR",
        "details.averageHR",
        "details.avgHr",
        "averageHR",
        "averageHeartRate",
        "summary.averageHeartRate",
      ],
      raw
    ),
    maxHeartRate: firstNumber(
      [
        "summaryDTO.maxHR",
        "details.maxHR",
        "details.maxHr",
        "maxHR",
        "maxHeartRate",
        "summary.maxHeartRate",
      ],
      raw
    ),
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
    recoveryHours: firstNumber(
      [
        "summaryDTO.recoveryTime",
        "details.recoveryTime",
        "recoveryTime",
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
      { key: "sleepDurationHours", title: "睡眠时长", unit: "h", source: "raw", paths: ["sleep.sleepTimeSeconds", "sleep.totalSleepSeconds"] },
      { key: "deepSleepHours", title: "深度睡眠", unit: "h", source: "raw", paths: ["sleep.dailySleepDTO.deepSleepSeconds", "sleep.deepSleepSeconds"] },
      { key: "remSleepHours", title: "REM 睡眠", unit: "h", source: "raw", paths: ["sleep.dailySleepDTO.remSleepSeconds", "sleep.remSleepSeconds"] },
      {
        key: "sleepInterruptions",
        title: "睡眠中断次数",
        unit: "",
        source: "raw",
        paths: ["sleep.dailySleepDTO.awakeCount", "sleep.awakeningsCount", "sleep.restlessMomentsCount"],
      },
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
      {
        key: "moderateIntensityMinutes",
        title: "中等强度分钟",
        unit: "min",
        source: "raw",
        paths: ["intensity_minutes.moderateIntensityMinutes", "intensity_minutes.moderateMinutes"],
      },
      {
        key: "vigorousIntensityMinutes",
        title: "高强度分钟",
        unit: "min",
        source: "raw",
        paths: ["intensity_minutes.vigorousIntensityMinutes", "intensity_minutes.vigorousMinutes"],
      },
      { key: "floors", title: "爬楼层数", unit: "floors", source: "raw", paths: ["floors.totalFloorsClimbed", "floors.floorsAscended"] },
      { key: "activeCalories", title: "活动消耗", unit: "kcal", source: "raw", paths: ["stats.activeKilocalories", "stats.activeCalories"] },
      {
        key: "sedentaryMinutes",
        title: "久坐时长",
        unit: "min",
        source: "raw",
        paths: ["stats.inactiveTimeInSeconds", "stats.sedentaryTimeInSeconds", "steps.sedentarySeconds"],
      },
      { key: "restingCalories", title: "静息消耗", unit: "kcal", source: "raw", paths: ["stats.bmrCalories", "stats.restingCalories"] },
      {
        key: "acuteTrainingLoad",
        title: "7 天急性负荷",
        unit: "",
        source: "raw",
        paths: [
          "training_status_aggregated.acuteTrainingLoad",
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
          "training_status.anaerobicTrainingLoad",
          "training_status.trainingLoadBalance.anaerobicTrainingLoad",
        ],
      },
      {
        key: "recoveryHours",
        title: "建议恢复时长",
        unit: "h",
        source: "raw",
        paths: ["training_status_aggregated.recoveryTime", "training_status.recoveryTime", "training_status.recoveryHours"],
      },
      { key: "enduranceScore", title: "耐力分数", unit: "", source: "raw", paths: ["endurance_score.score", "endurance_score.value"] },
      { key: "hillScore", title: "爬坡分数", unit: "", source: "raw", paths: ["hill_score.score", "hill_score.value"] },
      { key: "runningTolerance", title: "跑步耐受", unit: "", source: "raw", paths: ["running_tolerance.value", "running_tolerance.score"] },
      { key: "vo2Max", title: "VO2 Max", unit: "", source: "raw", paths: ["max_metrics.vo2Max", "max_metrics.cyclingVo2Max"] },
      {
        key: "lactateThresholdHr",
        title: "乳酸阈值心率",
        unit: "bpm",
        source: "raw",
        paths: [
          "user_profile.userData.lactateThresholdHeartRate",
          "user_profile.userData.runningLactateThresholdHeartRate",
          "lactate_threshold.0.hearRate",
          "lactate_threshold.1.hearRate",
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

            if (rawValue == null || !Number.isFinite(rawValue)) {
              return null
            }

            const normalizedValue =
              metric.key === "sleepDurationHours"
                ? Number(rawValue) / 3600
                : metric.key === "deepSleepHours" || metric.key === "remSleepHours"
                  ? Number(rawValue) / 3600
                : metric.key === "awakeDurationMinutes"
                  ? Number(rawValue) / 60
                  : metric.key === "sedentaryMinutes"
                    ? Number(rawValue) > 1440 ? Number(rawValue) / 60 : Number(rawValue)
                    : metric.key === "recoveryHours"
                      ? Number(rawValue) > 240 ? Number(rawValue) / 3600 : Number(rawValue)
                  : Number(rawValue)

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
