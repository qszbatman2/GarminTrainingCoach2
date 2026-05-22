import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { getBackfillJob } from "@/lib/backfill-jobs"

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
