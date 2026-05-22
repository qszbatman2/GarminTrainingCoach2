import { after, NextResponse } from "next/server"

import { getBackfillJob, getBackfillSecret, processBackfillJob, triggerBackfillRunner } from "@/lib/backfill-jobs"

export const maxDuration = 60

function isAuthorized(request: Request) {
  const secret = getBackfillSecret()
  if (!secret) {
    return true
  }

  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function POST(request: Request, context: RouteContext<"/api/garmin-backfill/[jobId]/run">) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { jobId } = await context.params

  try {
    const result = await processBackfillJob(jobId)
    const job = await getBackfillJob(jobId)

    if (!result.done) {
      const origin = new URL(request.url).origin
      after(async () => {
        await triggerBackfillRunner(origin, jobId)
      })
    }

    return NextResponse.json({
      success: true,
      result,
      job,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "执行补拉任务失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
