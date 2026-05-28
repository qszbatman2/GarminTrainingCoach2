import type { Metadata } from "next"

import { auth } from "@/auth"
import { AuthPanel } from "@/components/auth-panel"
import { DataSyncCenter, type SyncCalendarDay, type SyncCalendarMonth } from "@/components/data-sync-center"
import { AppPage } from "@/components/design-system"
import { isActivityComplete, isMetricComplete } from "@/lib/garmin-sync"
import prisma from "@/lib/prisma"
import {
  addShanghaiDays,
  formatShanghaiDateKey,
  getShanghaiDateParts,
  getShanghaiDayRange,
  getShanghaiMonthStart,
  getTodayShanghaiDateKey,
  parseDateKeyAsUtc,
} from "@/lib/shanghai-time"
import { getObservedSupportedFieldIds } from "@/lib/sync-supported-fields"

const SYNC_CALENDAR_MONTHS = 12

export const metadata: Metadata = {
  title: "同步",
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function buildSyncCalendarMonths(
  metrics: Array<{ date: Date; raw: unknown }>,
  activities: Array<{ date: Date; raw: unknown }>
): SyncCalendarMonth[] {
  const now = new Date()
  const todayKey = getTodayShanghaiDateKey(now)

  const metricByDate = new Map(metrics.map((item) => [formatShanghaiDateKey(item.date), item]))
  const activitiesByDate = new Map<string, Array<{ raw: unknown }>>()

  for (const activity of activities) {
    const dateKey = formatShanghaiDateKey(activity.date)
    const bucket = activitiesByDate.get(dateKey) ?? []
    bucket.push({ raw: activity.raw })
    activitiesByDate.set(dateKey, bucket)
  }

  return Array.from({ length: SYNC_CALENDAR_MONTHS }, (_, offset) => {
    const firstDay = getShanghaiMonthStart(now, -(SYNC_CALENDAR_MONTHS - 1 - offset))
    const { year, month, weekday } = getShanghaiDateParts(firstDay)
    const nextMonthStart = getShanghaiMonthStart(firstDay, 1)
    const daysInMonth = getShanghaiDateParts(addShanghaiDays(nextMonthStart, -1)).day
    const startWeekday = (weekday + 6) % 7
    const monthLabel = `${year}-${pad(month)}`
    const days: SyncCalendarDay[] = Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1
      const dateKey = `${monthLabel}-${String(dayNumber).padStart(2, "0")}`
      const metric = metricByDate.get(dateKey)
      const dayActivities = activitiesByDate.get(dateKey) ?? []
      const hasMetric = Boolean(metric)
      const metricComplete = metric ? isMetricComplete(metric.raw) : false
      const incompleteActivityCount = dayActivities.filter((item) => !isActivityComplete(item.raw)).length
      const activityCount = dayActivities.length
      const isToday = dateKey === todayKey

      const status =
        dateKey > todayKey
          ? "future"
          : isToday
            ? "partial"
            : hasMetric && metricComplete && incompleteActivityCount === 0
              ? "complete"
              : hasMetric || activityCount > 0
                ? "partial"
                : "empty"

      return {
        date: dateKey,
        dayNumber,
        status,
        hasMetric,
        metricComplete,
        activityCount,
        incompleteActivityCount,
        isToday,
      }
    })

    return {
      monthLabel,
      startWeekday,
      days,
    }
  })
}

export default async function DataSyncPage() {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return <AuthPanel />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      garminEmail: true,
      backfillJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          metrics: true,
          activities: true,
        },
      },
    },
  })

  if (!user) {
    return <AuthPanel />
  }

  const recentMetrics = await prisma.dailyMetric.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    take: 30,
    select: {
      date: true,
      raw: true,
    },
  })
  const metricDates = recentMetrics.map((item) => formatShanghaiDateKey(item.date))
  const last30MetricDates = new Set(metricDates.slice(0, 30))
  const earliestTrackedDate = metricDates[metricDates.length - 1] ?? null
  const recentActivities = await prisma.activity.findMany({
    where: {
      userId: session.user.id,
      ...(earliestTrackedDate
        ? {
            date: {
              gte: getShanghaiDayRange(parseDateKeyAsUtc(earliestTrackedDate)).start,
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 200,
    select: {
      date: true,
      raw: true,
    },
  })
  const last30ActivityDays = new Set(
    recentActivities.map((item) => formatShanghaiDateKey(item.date)).filter((date) => last30MetricDates.has(date))
  ).size
  const observedSupportedFieldIds = getObservedSupportedFieldIds(
    recentMetrics.map((item) => item.raw),
    recentActivities.map((item) => item.raw)
  )
  const now = new Date()
  const currentMonthStart = getShanghaiMonthStart(now, -(SYNC_CALENDAR_MONTHS - 1))
  const nextMonthStart = getShanghaiMonthStart(now, 1)
  const [monthMetrics, monthActivities] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: {
        userId: session.user.id,
        date: {
          gte: currentMonthStart,
          lt: nextMonthStart,
        },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        raw: true,
      },
    }),
    prisma.activity.findMany({
      where: {
        userId: session.user.id,
        date: {
          gte: currentMonthStart,
          lt: nextMonthStart,
        },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        raw: true,
      },
    }),
  ])
  const syncCalendarMonths = buildSyncCalendarMonths(monthMetrics, monthActivities)

  return (
    <AppPage>
      <DataSyncCenter
        activitiesCount={user._count.activities}
        activeSupportedFieldIds={observedSupportedFieldIds}
        garminEmail={user.garminEmail}
        initialBackfillJob={
          user.backfillJobs[0]
            ? {
                id: user.backfillJobs[0].id,
                status: user.backfillJobs[0].status,
                totalDates: user.backfillJobs[0].totalDates,
                currentIndex: user.backfillJobs[0].currentIndex,
                targetDates: user.backfillJobs[0].targetDates,
                syncedDates: user.backfillJobs[0].syncedDates,
                skippedDates: user.backfillJobs[0].skippedDates,
                failedDates: user.backfillJobs[0].failedDates,
                message: user.backfillJobs[0].message,
                lastError: user.backfillJobs[0].lastError,
                createdAt: user.backfillJobs[0].createdAt.toISOString(),
                updatedAt: user.backfillJobs[0].updatedAt.toISOString(),
                startedAt: user.backfillJobs[0].startedAt?.toISOString() ?? null,
                finishedAt: user.backfillJobs[0].finishedAt?.toISOString() ?? null,
                heartbeatAt: user.backfillJobs[0].heartbeatAt?.toISOString() ?? null,
              }
            : null
        }
        last30ActivityDays={last30ActivityDays}
        last30MetricCount={Math.min(metricDates.length, 30)}
        latestMetricDate={metricDates[0] ?? null}
        metricsCount={user._count.metrics}
        syncCalendarMonths={syncCalendarMonths}
      />
    </AppPage>
  )
}
