export type SupportedFieldDefinition = {
  id: string
  label: string
  metricPaths?: string[]
  activityPaths?: string[]
}

export type SupportedFieldGroup = {
  title: string
  fields: SupportedFieldDefinition[]
}

export const SUPPORTED_FIELD_GROUPS: SupportedFieldGroup[] = [
  {
    title: "恢复与睡眠",
    fields: [
      { id: "sleepScore", label: "睡眠评分", metricPaths: ["sleep.dailySleepDTO.sleepScores.overall.value", "sleep.sleepScores.overall.value"] },
      { id: "sleepDuration", label: "睡眠时长", metricPaths: ["sleep.sleepTimeSeconds", "sleep.totalSleepSeconds", "sleep.sleepDurationSeconds"] },
      { id: "deepSleep", label: "深睡", metricPaths: ["sleep.dailySleepDTO.deepSleepSeconds", "sleep.deepSleepSeconds"] },
      { id: "remSleep", label: "REM", metricPaths: ["sleep.dailySleepDTO.remSleepSeconds", "sleep.remSleepSeconds"] },
      {
        id: "sleepInterruptions",
        label: "睡眠中断",
        metricPaths: ["sleep.dailySleepDTO.awakeCount", "sleep.awakeningsCount", "sleep.restlessMomentsCount", "sleep.sleepScores.awakeningsCount"],
      },
      { id: "awakeDuration", label: "清醒时长", metricPaths: ["sleep.awakeSleepSeconds", "sleep.awakeTimeSeconds", "sleep.awakeDurationInSeconds"] },
      { id: "hrv", label: "HRV", metricPaths: ["hrv.hrvSummary.lastNightAvg"] },
      { id: "trainingReadiness", label: "训练准备度", metricPaths: ["training_readiness.score", "training_readiness.readinessScore", "morning_training_readiness.score"] },
    ],
  },
  {
    title: "心率与能量",
    fields: [
      { id: "restingHr", label: "静息心率", metricPaths: ["stats.restingHeartRate"] },
      { id: "heartRateSeries", label: "心率分时", metricPaths: ["heart_rates.heartRateValues", "heart_rates.heartRateValuesArray", "stats.heartRateValues"] },
      { id: "stress", label: "压力", metricPaths: ["stats.averageStressLevel", "stress.stressValues", "stress.stressValuesArray"] },
      { id: "bodyBatteryHigh", label: "Body Battery 高点", metricPaths: ["body_battery.bodyBatteryChargedValue", "body_battery.maxBodyBattery", "body_battery.highBodyBattery"] },
      { id: "bodyBatteryLow", label: "Body Battery 低点", metricPaths: ["body_battery.bodyBatteryDrainedValue", "body_battery.minBodyBattery", "body_battery.lowBodyBattery"] },
      { id: "bodyBatterySeries", label: "Body Battery 分时", metricPaths: ["body_battery.bodyBatteryValuesArray", "body_battery.bodyBatteryValues"] },
      { id: "respiration", label: "呼吸频率", metricPaths: ["respiration.avgWakingRespirationValue", "respiration.averageRespiration", "respiration.value"] },
      { id: "bloodOxygen", label: "血氧", metricPaths: ["blood_oxygen.avgSpo2", "blood_oxygen.averageSpo2", "blood_oxygen.averageValue", "blood_oxygen.value"] },
    ],
  },
  {
    title: "活动与代谢",
    fields: [
      { id: "steps", label: "步数", metricPaths: ["daily_steps.totalSteps", "steps.totalSteps", "stats.totalSteps"] },
      { id: "activeCalories", label: "活动消耗", metricPaths: ["stats.activeKilocalories", "stats.activeCalories"] },
      { id: "restingCalories", label: "静息消耗", metricPaths: ["stats.bmrCalories", "stats.restingCalories"] },
      { id: "sedentary", label: "久坐时长", metricPaths: ["stats.inactiveTimeInSeconds", "stats.sedentaryTimeInSeconds", "steps.sedentarySeconds", "steps.totalSedentarySeconds"] },
      { id: "intensityMinutes", label: "强度分钟", metricPaths: ["intensity_minutes.totalIntensityMinutes", "stats.activeTimeInMinutes", "intensity_minutes.moderateIntensityMinutes"] },
      { id: "moderateVigorous", label: "中高强度分钟", metricPaths: ["intensity_minutes.moderateIntensityMinutes", "intensity_minutes.vigorousIntensityMinutes"] },
      { id: "floors", label: "爬楼层数", metricPaths: ["floors.totalFloorsClimbed", "floors.floorsAscended", "stats.floorsClimbed"] },
      { id: "weight", label: "体重", metricPaths: ["body_composition.dateWeightList.0.weight", "body_composition.totalAverage.weight", "body_composition.allMetrics.weight", "body_composition.weight"] },
    ],
  },
  {
    title: "训练负荷与能力",
    fields: [
      { id: "acuteTrainingLoad", label: "7 天急性负荷", metricPaths: ["training_status_aggregated.acuteTrainingLoad", "training_status.acuteTrainingLoad", "training_status.currentTrainingLoad"] },
      { id: "chronicTrainingLoad", label: "长期慢性负荷", metricPaths: ["training_status_aggregated.chronicTrainingLoad", "training_status.chronicTrainingLoad", "training_status.trainingLoadChronic"] },
      { id: "acwr", label: "急慢性负荷比", metricPaths: ["training_status_aggregated.acuteChronicWorkloadRatio", "training_status.acuteChronicWorkloadRatio", "training_status.acwr", "training_status.loadRatio"] },
      { id: "lowAerobicLoad", label: "低有氧负荷", metricPaths: ["training_status_aggregated.lowAerobicTrainingLoad", "training_status.lowAerobicTrainingLoad", "training_status.trainingLoadBalance.lowAerobicTrainingLoad"] },
      { id: "highAerobicLoad", label: "高有氧负荷", metricPaths: ["training_status_aggregated.highAerobicTrainingLoad", "training_status.highAerobicTrainingLoad", "training_status.trainingLoadBalance.highAerobicTrainingLoad"] },
      { id: "anaerobicLoad", label: "无氧负荷", metricPaths: ["training_status_aggregated.anaerobicTrainingLoad", "training_status.anaerobicTrainingLoad", "training_status.trainingLoadBalance.anaerobicTrainingLoad"] },
      { id: "recoveryHours", label: "建议恢复时长", metricPaths: ["training_status_aggregated.recoveryTime", "training_status.recoveryTime", "training_status.recoveryHours"] },
      { id: "vo2Max", label: "VO2 Max", metricPaths: ["max_metrics.vo2Max", "max_metrics.cyclingVo2Max"] },
      { id: "lactateThresholdHr", label: "乳酸阈值心率", metricPaths: ["user_profile.userData.lactateThresholdHeartRate", "user_profile.userData.runningLactateThresholdHeartRate", "lactate_threshold.0.hearRate", "lactate_threshold.1.hearRate"] },
      { id: "enduranceScore", label: "耐力分数", metricPaths: ["endurance_score.score", "endurance_score.value"] },
      { id: "hillScore", label: "爬坡分数", metricPaths: ["hill_score.score", "hill_score.value"] },
      { id: "runningTolerance", label: "跑步耐受", metricPaths: ["running_tolerance.value", "running_tolerance.score"] },
    ],
  },
  {
    title: "活动明细",
    fields: [
      { id: "activitySummary", label: "活动概要", activityPaths: ["activityId", "activityName", "activityType.typeKey"] },
      { id: "activityDetails", label: "活动详情", activityPaths: ["details"] },
      { id: "activitySplits", label: "Splits", activityPaths: ["splits"] },
      { id: "activitySplitSummaries", label: "Split Summaries", activityPaths: ["split_summaries"] },
      { id: "activityHrZones", label: "心率分区", activityPaths: ["hr_in_timezones"] },
      { id: "activityDistance", label: "距离", activityPaths: ["distance"] },
      { id: "activityDuration", label: "时长", activityPaths: ["duration"] },
    ],
  },
]

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
    return value.some((item) => hasMeaningfulValue(item))
  }

  const record = asRecord(value)
  if (!record) {
    return false
  }

  return Object.values(record).some((item) => hasMeaningfulValue(item))
}

function hasDataAtPaths(source: unknown, paths?: string[]) {
  if (!paths || paths.length === 0) {
    return false
  }

  return paths.some((path) => hasMeaningfulValue(getByPath(source, path)))
}

export function getObservedSupportedFieldIds(metricRaws: unknown[], activityRaws: unknown[]) {
  const fieldIds = new Set<string>()

  for (const group of SUPPORTED_FIELD_GROUPS) {
    for (const field of group.fields) {
      const metricHit = field.metricPaths ? metricRaws.some((raw) => hasDataAtPaths(raw, field.metricPaths)) : false
      const activityHit = field.activityPaths ? activityRaws.some((raw) => hasDataAtPaths(raw, field.activityPaths)) : false

      if (metricHit || activityHit) {
        fieldIds.add(field.id)
      }
    }
  }

  return [...fieldIds]
}
