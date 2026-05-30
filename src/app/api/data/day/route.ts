import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { formatShanghaiDateKey, getShanghaiDayRange, parseDateKeyAsUtc } from "@/lib/shanghai-time"

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")

    if (!date) {
      return NextResponse.json({ error: "缺少 date 参数" }, { status: 400 })
    }

    const parsedDate = parseDateKeyAsUtc(date)
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "日期格式无效" }, { status: 400 })
    }

    const range = getShanghaiDayRange(parsedDate)
    const [metric, activities] = await Promise.all([
      prisma.dailyMetric.findFirst({
        where: {
          userId: session.user.id,
          date: {
            gte: range.start,
            lt: range.endExclusive,
          },
        },
        orderBy: { date: "desc" },
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
        where: {
          userId: session.user.id,
          date: {
            gte: range.start,
            lt: range.endExclusive,
          },
        },
        orderBy: { date: "desc" },
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
    ])

    return NextResponse.json({
      date,
      metric: metric
        ? {
            id: metric.id,
            date: formatShanghaiDateKey(metric.date),
            sleepScore: metric.sleepScore,
            hrv: metric.hrv,
            restingHr: metric.restingHr,
            stress: metric.stress,
            raw: metric.raw,
          }
        : null,
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
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "读取单日数据失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
