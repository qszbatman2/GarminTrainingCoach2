export type RecoveryEstimationInput = {
  durationMin: number | null
  distanceKm: number | null
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
}

const RECOVERY_MIN_HOURS = 1
const RECOVERY_MAX_HOURS = 48

// trainingLoad(EPOC 积分)→恢复时长的幂函数饱和映射：load^EXP × K。
// 锚点参考：load 50(轻松)≈12h、150(阈值课)≈26h、300(长时高强)≈41h、450+→封顶。
const LOAD_EXP = 0.68
const LOAD_K = 0.85

// 无氧训练效果(力量/冲刺造成的肌肉损伤未被 EPOC 完全捕捉)作为温和乘数，
// 每 1.0 TE 增加 8% 恢复需求(TE 0→×1.0, TE 4→×1.32)。线性，不再平方。
const ANAEROBIC_MULT_PER_TE = 0.08

// 缺乏可靠 trainingLoad 时，用时长/距离的 TRIMP 式回退估算。
const FALLBACK_DURATION_COEF = 0.12 // 小时/分钟
const FALLBACK_DISTANCE_COEF = 0.15 // 小时/公里

export function estimateRecoveryHours(activity: RecoveryEstimationInput) {
  const { durationMin, distanceKm, trainingLoad, anaerobicTrainingEffect } = activity

  // 数据守门：trainingLoad 与 时长/距离 全部缺失时无法估算，返回 null。
  // (仅有强度分钟/TE 而无体量信息不足以推断恢复时长)
  const hasLoad = trainingLoad != null && trainingLoad > 0
  const hasVolume = (durationMin != null && durationMin > 0) || (distanceKm != null && distanceKm > 0)
  if (!hasLoad && !hasVolume) {
    return null
  }

  // 应激主干：优先用 trainingLoad 的饱和幂曲线；缺失/为 0 时用时长+距离回退。
  const baseHours = hasLoad
    ? Math.pow(trainingLoad as number, LOAD_EXP) * LOAD_K
    : (durationMin ?? 0) * FALLBACK_DURATION_COEF + (distanceKm ?? 0) * FALLBACK_DISTANCE_COEF

  // 无氧温和乘数(唯一的强度修正，避免与已含强度的 trainingLoad 重复计算)。
  const anaerobicMultiplier = 1 + ANAEROBIC_MULT_PER_TE * Math.max(0, anaerobicTrainingEffect ?? 0)

  const rawHours = baseHours * anaerobicMultiplier
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
