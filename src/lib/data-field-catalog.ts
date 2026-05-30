import { getActivityDisplayValues, getMetricDisplayValues } from "@/lib/garmin-data"
import { formatShanghaiDateTime, parseGarminDateTime } from "@/lib/shanghai-time"

export type FieldSourceKey = "all" | "raw" | "garmin" | "derived"
export type FieldGroupKey = "recovery" | "energy" | "activity" | "load"

export type FieldMetricRecord = {
  date: string
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

export type FieldActivityRecord = {
  id: string
  garminId?: string
  name: string
  type: string
  distance: number | null
  duration: number | null
  date: string
  raw: unknown
}

export type DailyFieldEntry = {
  id: string
  label: string
  group: FieldGroupKey
  groupLabel: string
  source: Exclude<FieldSourceKey, "all">
  sourceLabel: string
  value: string
}

type DailyFieldContext = {
  metric: FieldMetricRecord | null
  activities: FieldActivityRecord[]
  metricDisplay: ReturnType<typeof getMetricDisplayValues> | null
  activityDisplays: Array<ReturnType<typeof getActivityDisplayValues>>
  latestActivity: FieldActivityRecord | null
  latestActivityDisplay: ReturnType<typeof getActivityDisplayValues> | null
  totalDistanceMeters: number | null
  totalDurationSeconds: number | null
  activityCount: number
  activityTypesLabel: string | null
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
  moderateVigorousMinutes: number | null
  intensityMinutes: number | null
  totalTrainingLoad: number | null
  averageAerobicTrainingEffect: number | null
  averageAnaerobicTrainingEffect: number | null
  lightSleepHours: number | null
}

type DailyFieldDefinition = {
  id: string
  label: string
  group: FieldGroupKey
  source: Exclude<FieldSourceKey, "all">
  getValue: (context: DailyFieldContext) => string
}

export const FIELD_GROUP_META: Array<{ key: FieldGroupKey; label: string }> = [
  { key: "recovery", label: "恢复睡眠" },
  { key: "energy", label: "能量心率" },
  { key: "activity", label: "活动代谢" },
  { key: "load", label: "训练负荷" },
]

export const FIELD_SOURCE_OPTIONS: Array<{ key: FieldSourceKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "raw", label: "原始数据" },
  { key: "garmin", label: "Garmin计算" },
  { key: "derived", label: "自建计算" },
]

function formatNumber(value: number | null | undefined, digits = 0, suffix = "") {
  if (value == null || !Number.isFinite(value)) {
    return "--"
  }

  return `${value.toFixed(digits)}${suffix}`
}

function toSleepHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  const normalized = value > 48 ? value / 3600 : value
  return Number(normalized.toFixed(1))
}

function toMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  const normalized = value > 240 ? value / 60 : value
  return Number(normalized.toFixed(0))
}

function toHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  const normalized = value > 240 ? value / 3600 : value
  return Number(normalized.toFixed(1))
}

function formatDistance(distanceMeters: number | null | undefined) {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return "--"
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`
}

function formatDuration(durationSeconds: number | null | undefined) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "--"
  }

  const totalMinutes = Math.round(durationSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes} min`
  }

  return `${hours}h ${minutes}m`
}

function sumNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (valid.length === 0) {
    return null
  }

  return valid.reduce((total, value) => total + value, 0)
}

function averageNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (valid.length === 0) {
    return null
  }

  return valid.reduce((total, value) => total + value, 0) / valid.length
}

function formatActivityTypes(activities: FieldActivityRecord[]) {
  if (activities.length === 0) {
    return null
  }

  const uniqueTypes = [...new Set(activities.map((activity) => activity.type.replaceAll("_", " ").trim()).filter(Boolean))]
  if (uniqueTypes.length === 0) {
    return null
  }

  return uniqueTypes.join(" / ")
}

function formatActivityDateTime(gmtValue: string | null | undefined, localValue: string | null | undefined) {
  const parsed = parseGarminDateTime(gmtValue, "utc") ?? parseGarminDateTime(localValue, "shanghai")
  return parsed ? formatShanghaiDateTime(parsed, { includeYear: false }) : "--"
}

function buildDailyFieldContext(metric: FieldMetricRecord | null, activities: FieldActivityRecord[]): DailyFieldContext {
  const metricDisplay = metric ? getMetricDisplayValues(metric.raw) : null
  const activityDisplays = activities.map((activity) => getActivityDisplayValues(activity.raw))
  const latestActivity = activities[0] ?? null
  const latestActivityDisplay = latestActivity ? getActivityDisplayValues(latestActivity.raw) : null
  const moderateIntensityMinutes = sumNullable(activityDisplays.map((activity) => activity.moderateIntensityMinutes))
  const vigorousIntensityMinutes = sumNullable(activityDisplays.map((activity) => activity.vigorousIntensityMinutes))
  const totalDistanceMeters = sumNullable(activities.map((activity) => activity.distance))
  const totalDurationSeconds = sumNullable(activities.map((activity) => activity.duration))
  const totalTrainingLoad = sumNullable(activityDisplays.map((activity) => activity.trainingLoad))
  const lightSleepHours =
    metricDisplay?.sleepDurationHours != null
      ? Math.max(
          Number(
            (
              toSleepHours(metricDisplay.sleepDurationHours)! -
              (toSleepHours(metricDisplay.deepSleepHours) ?? 0) -
              (toSleepHours(metricDisplay.remSleepHours) ?? 0)
            ).toFixed(1)
          ),
          0
        )
      : null

  return {
    metric,
    activities,
    metricDisplay,
    activityDisplays,
    latestActivity,
    latestActivityDisplay,
    totalDistanceMeters,
    totalDurationSeconds,
    activityCount: activities.length,
    activityTypesLabel: formatActivityTypes(activities),
    moderateIntensityMinutes,
    vigorousIntensityMinutes,
    moderateVigorousMinutes:
      moderateIntensityMinutes != null || vigorousIntensityMinutes != null ? (moderateIntensityMinutes ?? 0) + (vigorousIntensityMinutes ?? 0) : null,
    intensityMinutes:
      moderateIntensityMinutes != null || vigorousIntensityMinutes != null
        ? (moderateIntensityMinutes ?? 0) + (vigorousIntensityMinutes ?? 0) * 2
        : null,
    totalTrainingLoad,
    averageAerobicTrainingEffect: averageNullable(activityDisplays.map((activity) => activity.aerobicTrainingEffect)),
    averageAnaerobicTrainingEffect: averageNullable(activityDisplays.map((activity) => activity.anaerobicTrainingEffect)),
    lightSleepHours,
  }
}

const DAILY_FIELD_DEFINITIONS: DailyFieldDefinition[] = [
  {
    id: "sleepScore",
    label: "睡眠评分",
    group: "recovery",
    source: "garmin",
    getValue: ({ metric }) => formatNumber(metric?.sleepScore),
  },
  {
    id: "sleepDurationHours",
    label: "睡眠时长",
    group: "recovery",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(toSleepHours(metricDisplay?.sleepDurationHours), 1, " h"),
  },
  {
    id: "deepSleepHours",
    label: "深睡",
    group: "recovery",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(toSleepHours(metricDisplay?.deepSleepHours), 1, " h"),
  },
  {
    id: "remSleepHours",
    label: "REM",
    group: "recovery",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(toSleepHours(metricDisplay?.remSleepHours), 1, " h"),
  },
  {
    id: "lightSleepHours",
    label: "浅睡",
    group: "recovery",
    source: "derived",
    getValue: ({ lightSleepHours }) => formatNumber(lightSleepHours, 1, " h"),
  },
  {
    id: "awakeDurationMinutes",
    label: "清醒时长",
    group: "recovery",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(toMinutes(metricDisplay?.awakeDurationMinutes), 0, " min"),
  },
  {
    id: "sleepInterruptions",
    label: "睡眠中断",
    group: "recovery",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.sleepInterruptions),
  },
  {
    id: "hrv",
    label: "HRV",
    group: "recovery",
    source: "raw",
    getValue: ({ metric }) => formatNumber(metric?.hrv, 0, " ms"),
  },
  {
    id: "trainingReadiness",
    label: "训练准备度",
    group: "recovery",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.trainingReadiness),
  },
  {
    id: "bodyBatteryHigh",
    label: "Body Battery 高点",
    group: "energy",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.bodyBatteryHigh),
  },
  {
    id: "bodyBatteryLow",
    label: "Body Battery 低点",
    group: "energy",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.bodyBatteryLow),
  },
  {
    id: "restingHr",
    label: "静息心率",
    group: "energy",
    source: "raw",
    getValue: ({ metric }) => formatNumber(metric?.restingHr, 0, " bpm"),
  },
  {
    id: "stress",
    label: "压力",
    group: "energy",
    source: "garmin",
    getValue: ({ metric }) => formatNumber(metric?.stress),
  },
  {
    id: "bloodOxygen",
    label: "血氧",
    group: "energy",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.bloodOxygen, 0, " %"),
  },
  {
    id: "respiration",
    label: "呼吸频率",
    group: "energy",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.respiration, 0, " brpm"),
  },
  {
    id: "steps",
    label: "步数",
    group: "activity",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.steps),
  },
  {
    id: "activityCount",
    label: "活动数",
    group: "activity",
    source: "derived",
    getValue: ({ activityCount }) => (activityCount > 0 ? String(activityCount) : "--"),
  },
  {
    id: "activityTypes",
    label: "活动类型",
    group: "activity",
    source: "derived",
    getValue: ({ activityTypesLabel }) => activityTypesLabel ?? "--",
  },
  {
    id: "activityDistance",
    label: "活动总距离",
    group: "activity",
    source: "derived",
    getValue: ({ totalDistanceMeters }) => formatDistance(totalDistanceMeters),
  },
  {
    id: "activityDuration",
    label: "活动总时长",
    group: "activity",
    source: "derived",
    getValue: ({ totalDurationSeconds }) => formatDuration(totalDurationSeconds),
  },
  {
    id: "latestActivityName",
    label: "最近活动名称",
    group: "activity",
    source: "derived",
    getValue: ({ latestActivity }) => latestActivity?.name ?? "--",
  },
  {
    id: "latestActivityType",
    label: "最近活动类型",
    group: "activity",
    source: "derived",
    getValue: ({ latestActivity }) => latestActivity?.type.replaceAll("_", " ") ?? "--",
  },
  {
    id: "latestActivityStartTime",
    label: "最近活动开始",
    group: "activity",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatActivityDateTime(latestActivityDisplay?.startedAtGmt, latestActivityDisplay?.startedAtLocal),
  },
  {
    id: "latestActivityEndTime",
    label: "最近活动结束",
    group: "activity",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatActivityDateTime(latestActivityDisplay?.endedAtGmt, latestActivityDisplay?.endedAtLocal),
  },
  {
    id: "latestActivityDistance",
    label: "最近活动距离",
    group: "activity",
    source: "raw",
    getValue: ({ latestActivity }) => formatDistance(latestActivity?.distance),
  },
  {
    id: "latestActivityDuration",
    label: "最近活动时长",
    group: "activity",
    source: "raw",
    getValue: ({ latestActivity }) => formatDuration(latestActivity?.duration),
  },
  {
    id: "intensityMinutes",
    label: "加权强度分钟",
    group: "activity",
    source: "derived",
    getValue: ({ intensityMinutes }) => formatNumber(intensityMinutes, 0, " min"),
  },
  {
    id: "moderateVigorousMinutes",
    label: "中高强度分钟",
    group: "activity",
    source: "derived",
    getValue: ({ moderateVigorousMinutes }) => formatNumber(moderateVigorousMinutes, 0, " min"),
  },
  {
    id: "moderateIntensityMinutes",
    label: "中等强度",
    group: "activity",
    source: "derived",
    getValue: ({ moderateIntensityMinutes }) => formatNumber(moderateIntensityMinutes, 0, " min"),
  },
  {
    id: "vigorousIntensityMinutes",
    label: "高强度",
    group: "activity",
    source: "derived",
    getValue: ({ vigorousIntensityMinutes }) => formatNumber(vigorousIntensityMinutes, 0, " min"),
  },
  {
    id: "activeCalories",
    label: "活动消耗",
    group: "activity",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.activeCalories, 0, " kcal"),
  },
  {
    id: "restingCalories",
    label: "静息消耗",
    group: "activity",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.restingCalories, 0, " kcal"),
  },
  {
    id: "floors",
    label: "爬楼层数",
    group: "activity",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.floors),
  },
  {
    id: "weight",
    label: "体重",
    group: "activity",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.weight, 1, " kg"),
  },
  {
    id: "sedentaryMinutes",
    label: "久坐时长",
    group: "activity",
    source: "raw",
    getValue: ({ metricDisplay }) => formatNumber(toMinutes(metricDisplay?.sedentaryMinutes), 0, " min"),
  },
  {
    id: "latestActivityAverageHeartRate",
    label: "最近活动平均心率",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.averageHeartRate, 0, " bpm"),
  },
  {
    id: "latestActivityMaxHeartRate",
    label: "最近活动最大心率",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.maxHeartRate, 0, " bpm"),
  },
  {
    id: "latestActivityAveragePower",
    label: "最近活动 AP",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.averagePower, 0, " W"),
  },
  {
    id: "latestActivityNormalizedPower",
    label: "最近活动 NP",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.normalizedPower, 0, " W"),
  },
  {
    id: "latestActivityAverageCadence",
    label: "最近活动平均踏频",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.averageCadence, 0, " rpm"),
  },
  {
    id: "latestActivityTrainingLoad",
    label: "最近活动训练负荷",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.trainingLoad),
  },
  {
    id: "totalTrainingLoad",
    label: "当日活动训练负荷",
    group: "load",
    source: "derived",
    getValue: ({ totalTrainingLoad }) => formatNumber(totalTrainingLoad),
  },
  {
    id: "latestActivityAerobicTrainingEffect",
    label: "最近活动有氧效果",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.aerobicTrainingEffect, 1),
  },
  {
    id: "latestActivityAnaerobicTrainingEffect",
    label: "最近活动无氧效果",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(latestActivityDisplay?.anaerobicTrainingEffect, 1),
  },
  {
    id: "averageAerobicTrainingEffect",
    label: "当日有氧效果均值",
    group: "load",
    source: "derived",
    getValue: ({ averageAerobicTrainingEffect }) => formatNumber(averageAerobicTrainingEffect, 1),
  },
  {
    id: "averageAnaerobicTrainingEffect",
    label: "当日无氧效果均值",
    group: "load",
    source: "derived",
    getValue: ({ averageAnaerobicTrainingEffect }) => formatNumber(averageAnaerobicTrainingEffect, 1),
  },
  {
    id: "latestActivityRecoveryHours",
    label: "最近活动恢复时间",
    group: "load",
    source: "garmin",
    getValue: ({ latestActivityDisplay }) => formatNumber(toHours(latestActivityDisplay?.recoveryHours), 1, " h"),
  },
  {
    id: "acuteTrainingLoad",
    label: "急性负荷",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.acuteTrainingLoad),
  },
  {
    id: "chronicTrainingLoad",
    label: "慢性负荷",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.chronicTrainingLoad),
  },
  {
    id: "acuteChronicLoadRatio",
    label: "急慢性负荷比",
    group: "load",
    source: "derived",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.acuteChronicLoadRatio, 2),
  },
  {
    id: "lowAerobicLoad",
    label: "低有氧负荷",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.lowAerobicLoad),
  },
  {
    id: "highAerobicLoad",
    label: "高有氧负荷",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.highAerobicLoad),
  },
  {
    id: "anaerobicLoad",
    label: "无氧负荷",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.anaerobicLoad),
  },
  {
    id: "recoveryHours",
    label: "建议恢复时长",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(toHours(metricDisplay?.recoveryHours), 1, " h"),
  },
  {
    id: "vo2Max",
    label: "VO2 Max",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.vo2Max),
  },
  {
    id: "enduranceScore",
    label: "耐力分数",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.enduranceScore),
  },
  {
    id: "hillScore",
    label: "爬坡分数",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.hillScore),
  },
  {
    id: "runningTolerance",
    label: "跑步耐受",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.runningTolerance),
  },
  {
    id: "lactateThresholdHr",
    label: "乳酸阈值心率",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.lactateThresholdHr, 0, " bpm"),
  },
  {
    id: "trainingStatusScore",
    label: "训练状态分",
    group: "load",
    source: "garmin",
    getValue: ({ metricDisplay }) => formatNumber(metricDisplay?.trainingStatusScore),
  },
]

export function buildDailyFieldEntries({
  metric,
  activities,
}: {
  metric: FieldMetricRecord | null
  activities: FieldActivityRecord[]
}) {
  const context = buildDailyFieldContext(metric, activities)
  const groupLabelByKey = new Map(FIELD_GROUP_META.map((group) => [group.key, group.label]))
  const sourceLabelByKey = new Map(FIELD_SOURCE_OPTIONS.map((option) => [option.key, option.label]))

  return DAILY_FIELD_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    group: definition.group,
    groupLabel: groupLabelByKey.get(definition.group) ?? definition.group,
    source: definition.source,
    sourceLabel: sourceLabelByKey.get(definition.source) ?? definition.source,
    value: definition.getValue(context),
  })).filter((entry) => entry.value !== "--")
}

export function getTopLevelKeys(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return []
  }

  return Object.keys(raw as Record<string, unknown>).sort()
}
