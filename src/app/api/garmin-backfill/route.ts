import { after } from "next/server"
import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { createBackfillJob, getLatestBackfillJob, triggerBackfillRunner } from "@/lib/backfill-jobs"

export const maxDuration = 60

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const latestJob = await getLatestBackfillJob(session.user.id)
  return NextResponse.json({ job: latestJob })
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const days = Math.max(1, Math.min(Number(body.days) || 30, 30))
    const job = await createBackfillJob(session.user.id, days)
    const origin = new URL(request.url).origin

    if (job.status === "pending") {
      after(async () => {
        await triggerBackfillRunner(origin, job.id)
      })
    }

    return NextResponse.json({
      success: true,
      job,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "补拉失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
