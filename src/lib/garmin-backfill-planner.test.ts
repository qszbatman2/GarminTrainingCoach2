import assert from "node:assert/strict"
import test from "node:test"

import { getMissingBackfillDates, hasAnyExistingGarminDataForDate } from "./garmin-backfill-planner.ts"

test("hasAnyExistingGarminDataForDate returns true when metric exists", () => {
  assert.equal(
    hasAnyExistingGarminDataForDate({
      date: "2026-05-01",
      metricDates: new Set(["2026-05-01"]),
      activityDates: new Set(),
    }),
    true
  )
})

test("hasAnyExistingGarminDataForDate returns true when activity exists", () => {
  assert.equal(
    hasAnyExistingGarminDataForDate({
      date: "2026-05-02",
      metricDates: new Set(),
      activityDates: new Set(["2026-05-02"]),
    }),
    true
  )
})

test("getMissingBackfillDates keeps only uncovered dates inside the 90-day window", () => {
  assert.deepEqual(
    getMissingBackfillDates({
      days: 3,
      rangeEndDate: "2026-05-03",
      metricDates: ["2026-05-01"],
      activityDates: ["2026-05-02"],
    }),
    ["2026-05-03"]
  )
})

test("getMissingBackfillDates returns empty array when all dates already have Garmin data", () => {
  assert.deepEqual(
    getMissingBackfillDates({
      days: 3,
      rangeEndDate: "2026-05-03",
      metricDates: ["2026-05-01", "2026-05-03"],
      activityDates: ["2026-05-02"],
    }),
    []
  )
})
