import { after, NextResponse } from "next/server"

import { createAllUsersBackfillJobs, getBackfillSecret, triggerBackfillRunner } from "@/lib/backfill-jobs"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function isAuthorized(request: Request) {
  const secret = getBackfillSecret()
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
    const url = new URL(request.url)
    const days = Math.max(1, Math.min(Number(url.searchParams.get("days")) || 90, 90))
    const result = await createAllUsersBackfillJobs(days)
    const origin = url.origin

    if (result.createdJobs.length > 0) {
      after(async () => {
        await Promise.allSettled(result.createdJobs.map((job) => triggerBackfillRunner(origin, job.id)))
      })
    }

    return NextResponse.json({
      success: true,
      ...result,
      message:
        result.createdJobs.length > 0
          ? `已创建 ${result.createdJobs.length} 个补拉任务，开始补最近 ${result.days} 天缺失日期`
          : `所有 Garmin 账号最近 ${result.days} 天都已有数据，或已有任务正在执行`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "全账号补拉失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
