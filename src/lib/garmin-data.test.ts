import assert from "node:assert/strict"
import test from "node:test"

import { getActivityDisplayValues } from "./garmin-data.ts"

test("getActivityDisplayValues reads AP and cadence from Garmin summary aliases", () => {
  const values = getActivityDisplayValues({
    summary: {
      avgPower: 212,
      normalizedPower: 228,
      averageBikingCadenceInRevPerMinute: 86,
    },
  })

  assert.equal(values.averagePower, 212)
  assert.equal(values.normalizedPower, 228)
  assert.equal(values.averageCadence, 86)
})

test("getActivityDisplayValues reads cycling cadence from legacy detail alias", () => {
  const values = getActivityDisplayValues({
    details: {
      averageBikingCadenceInRevPerMinute: 91,
    },
  })

  assert.equal(values.averageCadence, 91)
})

test("getActivityDisplayValues counts only zone 3+ heart rate or power as vigorous intensity", () => {
  const values = getActivityDisplayValues({
    summaryDTO: {
      averageHR: 135,
      maxHR: 158,
      averagePower: 110,
      normalizedPower: 119,
      functionalThresholdPower: 227,
    },
    hr_in_timezones: [
      { zoneNumber: 1, zoneLowBoundary: 97, secsInZone: 0 },
      { zoneNumber: 2, zoneLowBoundary: 117, secsInZone: 120 },
      { zoneNumber: 3, zoneLowBoundary: 155, secsInZone: 0 },
    ],
    power_in_timezones: [
      { zoneNumber: 1, zoneLowBoundary: 0, secsInZone: 0 },
      { zoneNumber: 2, zoneLowBoundary: 120, secsInZone: 120 },
      { zoneNumber: 3, zoneLowBoundary: 170, secsInZone: 0 },
    ],
    details: {
      metricDescriptors: [
        { key: "directTimestamp", metricsIndex: 0, unit: { factor: 0 } },
        { key: "sumMovingDuration", metricsIndex: 1, unit: { factor: 1000 } },
        { key: "directHeartRate", metricsIndex: 2, unit: { factor: 1 } },
        { key: "directPower", metricsIndex: 3, unit: { factor: 1 } },
      ],
      activityDetailMetrics: [
        { metrics: [0, 0, 150, 130] },
        { metrics: [60000, 60, 150, 130] },
        { metrics: [120000, 120, 150, 130] },
      ],
    },
  })

  assert.equal(values.moderateIntensityMinutes, 2)
  assert.equal(values.vigorousIntensityMinutes, 0)
})
