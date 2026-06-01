import assert from "node:assert/strict"
import test from "node:test"

import { getGarminFetchPolicy, shouldRetryGarminFetch } from "./garmin-fetch-policy.ts"

test("full sync uses a longer timeout and one retry by default", () => {
  assert.deepEqual(getGarminFetchPolicy("full", {}), {
    timeoutMs: 120_000,
    retryCount: 1,
  })
})

test("partial sync keeps a short timeout and disables retries by default", () => {
  assert.deepEqual(getGarminFetchPolicy("partial_today", {}), {
    timeoutMs: 45_000,
    retryCount: 0,
  })
})

test("env overrides are respected when provided", () => {
  assert.deepEqual(
    getGarminFetchPolicy("full", {
      GARMIN_FETCH_TIMEOUT_MS: "150000",
      GARMIN_FETCH_RETRY_COUNT: "2",
      GARMIN_PARTIAL_FETCH_TIMEOUT_MS: "30000",
    }),
    {
      timeoutMs: 150_000,
      retryCount: 2,
    }
  )
})

test("only timeout-like failures are retried within retry budget", () => {
  const abortError = new Error("aborted")
  abortError.name = "AbortError"

  assert.equal(shouldRetryGarminFetch(abortError, 0, 1), true)
  assert.equal(shouldRetryGarminFetch(new Error("Garmin 服务请求超时（>45s）"), 0, 1), true)
  assert.equal(shouldRetryGarminFetch(new Error("401 unauthorized"), 0, 1), false)
  assert.equal(shouldRetryGarminFetch(abortError, 1, 1), false)
})
