import type { GarminSyncMode } from "./garmin-sync"

type GarminFetchPolicy = {
  timeoutMs: number
  retryCount: number
}

type GarminFetchEnv = {
  GARMIN_FETCH_TIMEOUT_MS?: string
  GARMIN_FETCH_RETRY_COUNT?: string
  GARMIN_PARTIAL_FETCH_TIMEOUT_MS?: string
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getGarminFetchPolicy(mode: GarminSyncMode, env?: GarminFetchEnv): GarminFetchPolicy {
  const effectiveEnv = env ?? process.env

  if (mode === "partial_today") {
    return {
      timeoutMs: parsePositiveInt(effectiveEnv.GARMIN_PARTIAL_FETCH_TIMEOUT_MS, 45_000),
      retryCount: 0,
    }
  }

  return {
    timeoutMs: parsePositiveInt(effectiveEnv.GARMIN_FETCH_TIMEOUT_MS, 120_000),
    retryCount: parsePositiveInt(effectiveEnv.GARMIN_FETCH_RETRY_COUNT, 1),
  }
}

export function shouldRetryGarminFetch(error: unknown, attempt: number, retryCount: number) {
  if (attempt >= retryCount) {
    return false
  }

  if (!(error instanceof Error)) {
    return false
  }

  return error.name === "AbortError" || error.message.includes("超时")
}
