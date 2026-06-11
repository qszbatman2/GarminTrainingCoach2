import { NextResponse } from "next/server"

import { getOrCreateLatestAnalysisReport } from "@/lib/analysis-report"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.AUTH_SECRET

  if (!secret) {
    return true
  }

  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        metrics: {
          some: {},
        },
      },
      select: {
        id: true,
        email: true,
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

    const results: Array<{ email: string; success: boolean; updatedAt?: string; error?: string }> = []

    for (const user of users) {
      try {
        const report = await getOrCreateLatestAnalysisReport({
          userId: user.id,
          trainingGoal: user.trainingGoal,
          metrics: user.metrics,
          activities: user.activities,
          forceRefresh: true,
        })

        results.push({
          email: user.email,
          success: true,
          updatedAt: report.updatedAt,
        })
      } catch (error: unknown) {
        results.push({
          email: user.email,
          success: false,
          error: error instanceof Error ? error.message : "日报生成失败",
        })
      }
    }

    return NextResponse.json({
      ok: true,
      usersCount: users.length,
      successCount: results.filter((item) => item.success).length,
      failureCount: results.filter((item) => !item.success).length,
      results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "定时生成训练日报失败"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
