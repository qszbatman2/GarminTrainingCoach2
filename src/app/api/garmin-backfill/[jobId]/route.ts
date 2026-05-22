import { after, NextResponse } from "next/server"

import { auth } from "@/auth"
import { getBackfillJob, processBackfillJob, triggerBackfillRunner } from "@/lib/backfill-jobs"

export const maxDuration = 60

export async function GET(_request: Request, context: RouteContext<"/api/garmin-backfill/[jobId]">) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const { jobId } = await context.params
  const job = await getBackfillJob(jobId, session.user.id)

  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 })
  }

  return NextResponse.json({ job })
}

export async function POST(request: Request, context: RouteContext<"/api/garmin-backfill/[jobId]">) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const { jobId } = await context.params
  const existingJob = await getBackfillJob(jobId, session.user.id)

  if (!existingJob) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 })
  }

  if (existingJob.status === "completed") {
    return NextResponse.json({ success: true, resumed: false, job: existingJob })
  }

  try {
    const result = await processBackfillJob(jobId)
    const job = await getBackfillJob(jobId, session.user.id)

    if (!result.done) {
      const origin = new URL(request.url).origin
      after(async () => {
        await triggerBackfillRunner(origin, jobId)
      })
    }

    return NextResponse.json({
      success: true,
      resumed: true,
      result,
      job,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "恢复补拉任务失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
