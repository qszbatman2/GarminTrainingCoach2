type ExistingDateLookup = {
  date: string
  metricDates: ReadonlySet<string>
  activityDates: ReadonlySet<string>
}

type MissingBackfillDatesInput = {
  days: number
  rangeEndDate: string
  metricDates: string[]
  activityDates: string[]
}

function parseDateKey(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function hasAnyExistingGarminDataForDate({ date, metricDates, activityDates }: ExistingDateLookup) {
  return metricDates.has(date) || activityDates.has(date)
}

export function getMissingBackfillDates({
  days,
  rangeEndDate,
  metricDates,
  activityDates,
}: MissingBackfillDatesInput) {
  const boundedDays = Math.max(1, days)
  const endDate = parseDateKey(rangeEndDate)
  const metricDateSet = new Set(metricDates)
  const activityDateSet = new Set(activityDates)
  const missingDates: string[] = []

  for (let offset = boundedDays - 1; offset >= 0; offset -= 1) {
    const currentDate = formatDateKey(addUtcDays(endDate, -offset))
    if (
      !hasAnyExistingGarminDataForDate({
        date: currentDate,
        metricDates: metricDateSet,
        activityDates: activityDateSet,
      })
    ) {
      missingDates.push(currentDate)
    }
  }

  return missingDates
}
