import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const { garminEmail, garminPassword, date } = await request.json()

    if (!date) {
      return NextResponse.json({ error: "请选择同步日期" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        garminEmail: true,
        garminPassword: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    const resolvedGarminEmail = String(garminEmail ?? user.garminEmail ?? "").trim().toLowerCase()
    const resolvedGarminPassword = String(garminPassword ?? user.garminPassword ?? "")

    if (!resolvedGarminEmail || !resolvedGarminPassword) {
      return NextResponse.json({ error: "请先绑定 Garmin 账号" }, { status: 400 })
    }

    if (resolvedGarminEmail !== user.garminEmail || resolvedGarminPassword !== user.garminPassword) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          garminEmail: resolvedGarminEmail,
          garminPassword: resolvedGarminPassword,
        },
      })
    }

    // 1. 调用 Python 微服务抓取全量数据
    const pythonServiceUrl = process.env.GARMIN_SERVICE_URL || "http://127.0.0.1:8000"
    const garminRes = await fetch(`${pythonServiceUrl}/api/garmin/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resolvedGarminEmail, password: resolvedGarminPassword, date }),
    })

    if (!garminRes.ok) {
      const errorData = await garminRes.json()
      throw new Error(errorData.detail || "Failed to fetch data from Garmin Service")
    }

    const { data } = await garminRes.json()
    const metrics = data.daily_metrics
    const activities = data.activities

    // 3. 数据清洗与提取关键指标
    // 由于 Garmin API 经常变动，通过 safe get 避免报错
    const sleepScore = metrics.sleep?.dailySleepDTO?.sleepScores?.overall?.value || null
    const restingHr = metrics.stats?.restingHeartRate || null
    const stress = metrics.stats?.averageStressLevel || null
    const hrv = metrics.hrv?.hrvSummary?.lastNightAvg || null

    // 4. 落库：保存或更新每日核心数据与全量 JSON
    const savedMetric = await prisma.dailyMetric.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: new Date(date),
        },
      },
      update: {
        sleepScore,
        restingHr,
        hrv,
        stress,
        raw: metrics, // Phase 1 要求存全量数据
      },
      create: {
        userId: user.id,
        date: new Date(date),
        sleepScore,
        restingHr,
        hrv,
        stress,
        raw: metrics,
      },
    })

    // 5. 落库：保存所有的运动记录
    const savedActivities = []
    if (Array.isArray(activities)) {
      for (const act of activities) {
        const savedAct = await prisma.activity.upsert({
          where: { garminId: String(act.activityId) },
          update: {
            name: act.activityName || "Unknown Activity",
            type: act.activityType?.typeKey || "unknown",
            distance: act.distance || null,
            duration: act.duration || null,
            raw: act,
          },
          create: {
            garminId: String(act.activityId),
            userId: user.id,
            name: act.activityName || "Unknown Activity",
            type: act.activityType?.typeKey || "unknown",
            distance: act.distance || null,
            duration: act.duration || null,
            date: new Date(act.startTimeLocal),
            raw: act,
          },
        })
        savedActivities.push(savedAct)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Garmin data synced successfully",
      metricId: savedMetric.id,
      activitiesCount: savedActivities.length,
    })
  } catch (error: any) {
    console.error("[Trae] Fix: API Error in garmin-sync:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
