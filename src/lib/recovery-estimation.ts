export type RecoveryEstimationInput = {
  durationMin: number | null
  distanceKm: number | null
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  moderateIntensityMinutes: number | null
  vigorousIntensityMinutes: number | null
}

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

  const veryLightSession = (durationMin ?? 0) <= 35 && (trainingLoad ?? 0) < 80 && (vigorousIntensityMinutes ?? 0) < 20 && (anaerobicTrainingEffect ?? 0) < 1
  if (veryLightSession) {
    return 2
  }

  const longEnduranceSession = (durationMin ?? 0) >= 150 || (distanceKm ?? 0) >= 70
  if (longEnduranceSession) {
    return 36
  }

  const shortButDemandingSession =
    (durationMin ?? 0) <= 90 &&
    ((trainingLoad ?? 0) >= 80 || (vigorousIntensityMinutes ?? 0) >= 20 || (anaerobicTrainingEffect ?? 0) >= 2 || (aerobicTrainingEffect ?? 0) >= 3)
  if (shortButDemandingSession) {
    return 12
  }

  const mediumLongDemandingSession =
    (durationMin ?? 0) > 90 &&
    ((trainingLoad ?? 0) >= 150 || (vigorousIntensityMinutes ?? 0) >= 40 || (anaerobicTrainingEffect ?? 0) >= 2 || (aerobicTrainingEffect ?? 0) >= 3.5)
  if (mediumLongDemandingSession) {
    return 24
  }

  return 6
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
