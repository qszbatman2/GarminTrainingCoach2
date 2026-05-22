import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { getDateKey, isActivityComplete, isMetricComplete, syncGarminDateForUser } from "@/lib/garmin-sync"

function getDateRange(days: number) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const dates: string[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(yesterday)
    current.setDate(yesterday.getDate() - offset)
    dates.push(getDateKey(current))
  }

  return dates
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const days = Math.max(1, Math.min(Number(body.days) || 30, 30))

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        metrics: true,
        activities: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    if (!user.garminEmail || !user.garminPassword) {
      return NextResponse.json({ error: "请先绑定 Garmin 账号" }, { status: 400 })
    }

    const targetDates = getDateRange(days)
    const metricMap = new Map(user.metrics.map((metric) => [getDateKey(metric.date), metric]))
    const activitiesByDate = new Map<string, typeof user.activities>()

    for (const activity of user.activities) {
      const dateKey = getDateKey(activity.date)
      const current = activitiesByDate.get(dateKey) ?? []
      current.push(activity)
      activitiesByDate.set(dateKey, current)
    }

    const syncedDates: string[] = []
    const skippedDates: string[] = []

    for (const date of targetDates) {
      const metric = metricMap.get(date)
      const activities = activitiesByDate.get(date) ?? []
      const shouldSync =
        !metric || !isMetricComplete(metric.raw) || activities.some((activity) => !isActivityComplete(activity.raw))

      if (!shouldSync) {
        skippedDates.push(date)
        continue
      }

      await syncGarminDateForUser({
        userId: user.id,
        garminEmail: user.garminEmail,
        garminPassword: user.garminPassword,
        date,
      })
      syncedDates.push(date)
    }

    return NextResponse.json({
      success: true,
      checkedDays: targetDates.length,
      syncedCount: syncedDates.length,
      skippedCount: skippedDates.length,
      syncedDates,
      skippedDates,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "补拉失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
