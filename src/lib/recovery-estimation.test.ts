import assert from "node:assert/strict"
import test from "node:test"

import * as recoveryEstimation from "./recovery-estimation.ts"

const { estimateRecoveryHours } = recoveryEstimation

test("returns 24 hours for a medium-long demanding session", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 105,
    distanceKm: 42,
    trainingLoad: 165,
    aerobicTrainingEffect: 3.6,
    anaerobicTrainingEffect: 1.2,
    moderateIntensityMinutes: 40,
    vigorousIntensityMinutes: 12,
  })

  assert.equal(recoveryHours, 24)
})

test("returns 2 hours for a very light session", () => {
  const recoveryHours = estimateRecoveryHours({
    durationMin: 30,
    distanceKm: 8,
    trainingLoad: 50,
    aerobicTrainingEffect: 0.8,
    anaerobicTrainingEffect: 0.2,
    moderateIntensityMinutes: 10,
    vigorousIntensityMinutes: 0,
  })

  assert.equal(recoveryHours, 2)
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
    24
  )
})
