export type RecoveryEstimationInput = {
  durationMin: number | null
  distanceKm: number | null
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
}

const RECOVERY_MIN_HOURS = 2
const RECOVERY_MAX_HOURS = 48

export function estimateRecoveryHours(activity: RecoveryEstimationInput) {
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

  // 连续公式：恢复时长 = 耐力主干 + 强度叠加 + 超长时长加成，再夹紧到 [2, 48]。
  // 各因子单调贡献，避免此前 5 档跳变导致的"边界突变"。

  // 耐力主干：trainingLoad 是 Garmin 综合应激(EPOC)的最佳单一信号，优先使用；
  // 缺失时退回时长/距离估算。
  const enduranceHours =
    trainingLoad != null
      ? trainingLoad * 0.09
      : Math.max((durationMin ?? 0) * 0.1, (distanceKm ?? 0) * 0.12)

  // 强度叠加：高强度分钟、无氧训练效果(平方放大)、高有氧训练效果。
  const intensityHours =
    (vigorousIntensityMinutes ?? 0) * 0.15 +
    Math.pow(anaerobicTrainingEffect ?? 0, 2) * 1.0 +
    Math.max(0, (aerobicTrainingEffect ?? 0) - 2) * 1.5

  // 超长时长加成：超过 120 分钟后线性追加。
  const durationBonus = Math.max(0, (durationMin ?? 0) - 120) * 0.06

  const rawHours = enduranceHours + intensityHours + durationBonus
  const clamped = Math.min(RECOVERY_MAX_HOURS, Math.max(RECOVERY_MIN_HOURS, rawHours))

  return Number(clamped.toFixed(1))
}

export type RecoveryActivityInput = {
  duration: number | null
  distance: number | null
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
}

export function getEstimatedRecoveryHoursFromActivity(activity: RecoveryActivityInput | null | undefined) {
  if (!activity) {
    return null
  }

  return estimateRecoveryHours({
    durationMin: activity.duration != null ? Number((activity.duration / 60).toFixed(0)) : null,
    distanceKm: activity.distance != null ? Number((activity.distance / 1000).toFixed(1)) : null,
    trainingLoad: activity.trainingLoad,
    aerobicTrainingEffect: activity.aerobicTrainingEffect,
    anaerobicTrainingEffect: activity.anaerobicTrainingEffect,
    moderateIntensityMinutes: activity.moderateIntensityMinutes,
    vigorousIntensityMinutes: activity.vigorousIntensityMinutes,
  })
}
