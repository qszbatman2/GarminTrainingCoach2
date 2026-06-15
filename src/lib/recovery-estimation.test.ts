import assert from "node:assert/strict"
import test from "node:test"

import * as recoveryEstimation from "./recovery-estimation.ts"

const { estimateRecoveryHours } = recoveryEstimation

test("scales recovery hours with training load and intensity (continuous)", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 105,
    distanceKm: 42,
    trainingLoad: 165,
    aerobicTrainingEffect: 3.6,
    anaerobicTrainingEffect: 1.2,
    moderateIntensityMinutes: 40,
    vigorousIntensityMinutes: 12,
  })

  // 165*0.09 + 12*0.15 + 1.2^2 + (3.6-2)*1.5 = 14.85 + 1.8 + 1.44 + 2.4 = 20.49
  assert.equal(recoveryHours, 20.5)
})

test("returns a low value for a very light session and clamps to the 2h floor", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 30,
    distanceKm: 8,
    trainingLoad: 10,
    aerobicTrainingEffect: 0.8,
    anaerobicTrainingEffect: 0.2,
    moderateIntensityMinutes: 10,
    vigorousIntensityMinutes: 0,
  })

  // 10*0.09 = 0.9 -> clamped to floor 2
  assert.equal(recoveryHours, 2)
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
    20.5
  )
})
