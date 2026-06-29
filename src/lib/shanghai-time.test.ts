import assert from "node:assert/strict"
import test from "node:test"

import {
  formatShanghaiDateKey,
  getShanghaiDayRange,
  getShanghaiDateKeyWithOffset,
  parseGarminDateTime,
} from "./shanghai-time.ts"

test("UTC 16:00 belongs to next Shanghai date", () => {
  assert.equal(formatShanghaiDateKey("2026-06-28T16:00:00.000Z"), "2026-06-29")
})

test("Shanghai day range starts at previous UTC 16:00", () => {
  const range = getShanghaiDayRange("2026-06-29T12:00:00+08:00")

  assert.equal(range.start.toISOString(), "2026-06-28T16:00:00.000Z")
  assert.equal(range.endExclusive.toISOString(), "2026-06-29T16:00:00.000Z")
})

test("Shanghai offset date key uses Shanghai day boundaries", () => {
  assert.equal(getShanghaiDateKeyWithOffset(-1, "2026-06-29T00:30:00+08:00"), "2026-06-28")
})

test("Garmin local datetime can be parsed as Shanghai time", () => {
  const parsed = parseGarminDateTime("2026-06-29 07:30:00", "shanghai")

  assert.equal(parsed?.toISOString(), "2026-06-28T23:30:00.000Z")
})
