import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { formatShanghaiDateKey } from "@/lib/shanghai-time"

const DEFAULT_METRICS_LIMIT = 21
const DEFAULT_ACTIVITIES_LIMIT = 12
const MAX_LIMIT = 60

function parseNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function clampLimit(value: string | null, fallback: number) {
  return Math.min(parseNumber(value, fallback), MAX_LIMIT)
}

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const metricOffset = parseNumber(searchParams.get("metricOffset"), 0)
    const metricLimit = clampLimit(searchParams.get("metricLimit"), DEFAULT_METRICS_LIMIT)
    const activityOffset = parseNumber(searchParams.get("activityOffset"), 0)
    const activityLimit = clampLimit(searchParams.get("activityLimit"), DEFAULT_ACTIVITIES_LIMIT)

    const [metrics, activities, counts] = await Promise.all([
      prisma.dailyMetric.findMany({
        where: { userId: session.user.id },
        orderBy: { date: "desc" },
        skip: metricOffset,
        take: metricLimit,
        select: {
          id: true,
          date: true,
          sleepScore: true,
          hrv: true,
          restingHr: true,
          stress: true,
          raw: true,
        },
      }),
      prisma.activity.findMany({
        where: { userId: session.user.id },
        orderBy: { date: "desc" },
        skip: activityOffset,
        take: activityLimit,
        select: {
          id: true,
          garminId: true,
          name: true,
          type: true,
          distance: true,
          duration: true,
          date: true,
          raw: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          _count: {
            select: {
              metrics: true,
              activities: true,
            },
          },
        },
      }),
    ])

    return NextResponse.json({
      metrics: metrics.map((metric) => ({
        id: metric.id,
        date: formatShanghaiDateKey(metric.date),
        sleepScore: metric.sleepScore,
        hrv: metric.hrv,
        restingHr: metric.restingHr,
        stress: metric.stress,
        raw: metric.raw,
      })),
      activities: activities.map((activity) => ({
        id: activity.id,
        garminId: activity.garminId,
        name: activity.name,
        type: activity.type,
        distance: activity.distance,
        duration: activity.duration,
        date: formatShanghaiDateKey(activity.date),
        raw: activity.raw,
      })),
      totals: {
        metrics: counts?._count.metrics ?? 0,
        activities: counts?._count.activities ?? 0,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "读取数据失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
