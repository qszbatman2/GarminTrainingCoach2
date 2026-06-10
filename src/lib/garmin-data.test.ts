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
