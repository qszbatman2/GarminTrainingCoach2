import { NextResponse } from "next/server"

import { processBackfillJob } from "@/lib/backfill-jobs"
import prisma from "@/lib/prisma"
import { GarminSyncMode, getDateKey, syncGarminDateForUser } from "@/lib/garmin-sync"

export const dynamic = "force-dynamic"

function formatShanghaiDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  return formatter.format(date)
}

function getYesterdayInShanghai() {
  return formatShanghaiDate(-1)
}

function getTodayInShanghai() {
  return formatShanghaiDate(0)
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.AUTH_SECRET
  if (!secret) {
    return true
  }

  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const syncTargets: Array<{ date: string; mode: GarminSyncMode }> = [
      { date: getYesterdayInShanghai(), mode: "full" },
      { date: getTodayInShanghai(), mode: "partial_today" },
    ]
    const users = await prisma.user.findMany({
      where: {
        garminEmail: { not: null },
        garminPassword: { not: null },
      },
      select: {
        id: true,
        email: true,
        garminEmail: true,
        garminPassword: true,
      },
    })
    const pendingJobs = await prisma.backfillJob.findMany({
      where: {
        status: {
          in: ["pending", "running"],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 5,
      select: {
        id: true,
      },
    })

    const results: Array<{ email: string; date: string; mode: GarminSyncMode; success: boolean; error?: string }> = []
    for (const user of users) {
      for (const target of syncTargets) {
        try {
          await syncGarminDateForUser({
            userId: user.id,
            garminEmail: user.garminEmail ?? "",
            garminPassword: user.garminPassword ?? "",
            date: getDateKey(target.date),
            mode: target.mode,
          })

          results.push({ email: user.email, date: target.date, mode: target.mode, success: true })
        } catch (error: unknown) {
          results.push({
            email: user.email,
            date: target.date,
            mode: target.mode,
            success: false,
            error: error instanceof Error ? error.message : "同步失败",
          })
        }
      }
    }

    const jobResults: Array<{ jobId: string; success: boolean; error?: string }> = []
    for (const job of pendingJobs) {
      try {
        await processBackfillJob(job.id)
        jobResults.push({ jobId: job.id, success: true })
      } catch (error: unknown) {
        jobResults.push({
          jobId: job.id,
          success: false,
          error: error instanceof Error ? error.message : "任务续跑失败",
        })
      }
    }

    return NextResponse.json({
      success: true,
      syncTargets,
      usersCount: users.length,
      successCount: results.filter((item) => item.success).length,
      failureCount: results.filter((item) => !item.success).length,
      results,
      backfillJobsProcessed: jobResults.length,
      backfillJobResults: jobResults,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "定时补拉失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
