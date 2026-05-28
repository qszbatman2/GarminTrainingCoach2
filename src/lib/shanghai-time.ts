const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai"

type DateLike = Date | string | number

function toDate(value: DateLike) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function getShanghaiDateParts(value: DateLike) {
  const shifted = new Date(toDate(value).getTime() + SHANGHAI_OFFSET_MS)

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  }
}

export function formatShanghaiDateKey(value: DateLike) {
  const { year, month, day } = getShanghaiDateParts(value)
  return `${year}-${pad(month)}-${pad(day)}`
}

export function parseDateKeyAsUtc(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

export function getShanghaiDayStart(value: DateLike) {
  const { year, month, day } = getShanghaiDateParts(value)
  return new Date(Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS)
}

export function getShanghaiDayRange(value: DateLike) {
  const start = getShanghaiDayStart(value)
  return {
    start,
    endExclusive: new Date(start.getTime() + DAY_MS),
  }
}

export function addShanghaiDays(value: DateLike, offsetDays: number) {
  return new Date(getShanghaiDayStart(value).getTime() + offsetDays * DAY_MS)
}

export function getTodayShanghaiDateKey(now: DateLike = new Date()) {
  return formatShanghaiDateKey(now)
}

export function getShanghaiDateKeyWithOffset(offsetDays: number, now: DateLike = new Date()) {
  return formatShanghaiDateKey(addShanghaiDays(now, offsetDays))
}

export function getShanghaiMonthStart(value: DateLike, monthOffset = 0) {
  const { year, month } = getShanghaiDateParts(value)
  const absoluteMonth = year * 12 + (month - 1) + monthOffset
  const nextYear = Math.floor(absoluteMonth / 12)
  const nextMonth = (absoluteMonth % 12 + 12) % 12

  return new Date(Date.UTC(nextYear, nextMonth, 1) - SHANGHAI_OFFSET_MS)
}

export function formatShanghaiDateTime(
  value?: DateLike | null,
  options: {
    includeYear?: boolean
    includeSeconds?: boolean
  } = {}
) {
  if (!value) {
    return "--"
  }

  const date = toDate(value)
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "--"
  }

  const { includeYear = true, includeSeconds = false } = options

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    hour12: false,
    ...(includeYear ? { year: "numeric" } : {}),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  }).format(date)
}

export function parseGarminDateTime(value: unknown, mode: "utc" | "shanghai") {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    const [, year, month, day, hour, minute, second = "00"] = match
    const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    return new Date(mode === "utc" ? utcMillis : utcMillis - SHANGHAI_OFFSET_MS)
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
