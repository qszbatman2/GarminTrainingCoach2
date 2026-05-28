import { NextResponse } from "next/server"

import { processBackfillJob } from "@/lib/backfill-jobs"
import prisma from "@/lib/prisma"
import { GarminSyncMode, GarminWriteStrategy, getDateKey, syncGarminDateForUser } from "@/lib/garmin-sync"
import { getShanghaiDateKeyWithOffset } from "@/lib/shanghai-time"

export const dynamic = "force-dynamic"

function getYesterdayInShanghai() {
  return getShanghaiDateKeyWithOffset(-1)
}

function getTodayInShanghai() {
  return getShanghaiDateKeyWithOffset(0)
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
    const syncTargets: Array<{ date: string; mode: GarminSyncMode; writeStrategy: GarminWriteStrategy }> = [
      { date: getYesterdayInShanghai(), mode: "full", writeStrategy: "prefer_incoming" },
      { date: getTodayInShanghai(), mode: "partial_today", writeStrategy: "merge_gaps" },
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

    const results: Array<{
      email: string
      date: string
      mode: GarminSyncMode
      writeStrategy: GarminWriteStrategy
      success: boolean
      error?: string
    }> = []
    for (const user of users) {
      for (const target of syncTargets) {
        try {
          await syncGarminDateForUser({
            userId: user.id,
            garminEmail: user.garminEmail ?? "",
            garminPassword: user.garminPassword ?? "",
            date: getDateKey(target.date),
            mode: target.mode,
            writeStrategy: target.writeStrategy,
          })

          results.push({
            email: user.email,
            date: target.date,
            mode: target.mode,
            writeStrategy: target.writeStrategy,
            success: true,
          })
        } catch (error: unknown) {
          results.push({
            email: user.email,
            date: target.date,
            mode: target.mode,
            writeStrategy: target.writeStrategy,
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
