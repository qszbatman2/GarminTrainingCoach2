import assert from "node:assert/strict"
import test from "node:test"

import * as recoveryEstimation from "./recovery-estimation.ts"

const { estimateRecoveryHours } = recoveryEstimation

test("maps training load to recovery via a saturating power curve", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 105,
    distanceKm: 42,
    trainingLoad: 165,
    aerobicTrainingEffect: 3.6,
    anaerobicTrainingEffect: 1.2,
    moderateIntensityMinutes: 40,
    vigorousIntensityMinutes: 12,
  })

  // 165^0.68 * 0.85 * (1 + 0.08*1.2) ≈ 27.37 * 1.096 ≈ 30.0
  assert.equal(recoveryHours, 30)
})

test("uses duration/distance fallback when training load is missing", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 30,
    distanceKm: 8,
    trainingLoad: null,
    aerobicTrainingEffect: 0.8,
    anaerobicTrainingEffect: 0.2,
    moderateIntensityMinutes: 10,
    vigorousIntensityMinutes: 0,
  })

  // (30*0.12 + 8*0.15) * (1 + 0.08*0.2) = 4.8 * 1.016 ≈ 4.9
  assert.equal(recoveryHours, 4.9)
})

test("returns null when both load and volume are missing (data guard)", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: null,
    distanceKm: null,
    trainingLoad: null,
    aerobicTrainingEffect: 4,
    anaerobicTrainingEffect: 3,
    moderateIntensityMinutes: 50,
    vigorousIntensityMinutes: 20,
  })

  assert.equal(recoveryHours, null)
})

test("is monotonic: a harder session never recovers faster than an easier one", () => {
  const easy = estimateRecoveryHours({
    durationMin: 60,
    distanceKm: 12,
    trainingLoad: 80,
    aerobicTrainingEffect: 2.5,
    anaerobicTrainingEffect: 0.5,
    moderateIntensityMinutes: 30,
    vigorousIntensityMinutes: 5,
  })
  const hard = estimateRecoveryHours({
    durationMin: 180,
    distanceKm: 60,
    trainingLoad: 220,
    aerobicTrainingEffect: 4.2,
    anaerobicTrainingEffect: 2.5,
    moderateIntensityMinutes: 120,
    vigorousIntensityMinutes: 40,
  })

  assert.ok(easy != null && hard != null && hard > easy)
})

test("clamps extreme sessions to the 48h ceiling", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 600,
    distanceKm: 200,
    trainingLoad: 500,
    aerobicTrainingEffect: 5,
    anaerobicTrainingEffect: 4,
    moderateIntensityMinutes: 300,
    vigorousIntensityMinutes: 120,
  })

  assert.equal(recoveryHours, 48)
})

test("can derive estimated recovery hours from a latest activity object", () => {
  const getEstimatedRecoveryHoursFromActivity = (
    recoveryEstimation as { getEstimatedRecoveryHoursFromActivity?: (activity: { duration: number | null; distance: number | null; raw: unknown }) => number | null }
  ).getEstimatedRecoveryHoursFromActivity

  assert.equal(typeof getEstimatedRecoveryHoursFromActivity, "function")
  assert.equal(
    getEstimatedRecoveryHoursFromActivity?.({
      duration: 105 * 60,
      distance: 42000,
      trainingLoad: 165,
      aerobicTrainingEffect: 3.6,
      anaerobicTrainingEffect: 1.2,
      moderateIntensityMinutes: 40,
      vigorousIntensityMinutes: 12,
    }),
    30
  )
})
