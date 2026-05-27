import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { getOrCreateLatestAnalysisReport } from "@/lib/analysis-report"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { forceRefresh?: boolean }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        trainingGoal: true,
        metrics: {
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            sleepScore: true,
            hrv: true,
            restingHr: true,
            stress: true,
            raw: true,
          },
        },
        activities: {
          orderBy: { date: "asc" },
          select: {
            id: true,
            name: true,
            type: true,
            distance: true,
            duration: true,
            date: true,
            raw: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    if (user.metrics.length === 0) {
      return NextResponse.json({ error: "还没有可分析的 Garmin 日级数据" }, { status: 400 })
    }

    const report = await getOrCreateLatestAnalysisReport({
      userId: user.id,
      trainingGoal: user.trainingGoal,
      metrics: user.metrics,
      activities: user.activities,
      forceRefresh: Boolean(body.forceRefresh),
    })

    return NextResponse.json({
      ok: true,
      ...report,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "生成训练分析失败"
    console.error("[Trae] Fix: API Error in analysis-generate:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
