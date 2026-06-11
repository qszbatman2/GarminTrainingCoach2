import { NextResponse } from "next/server"

import { getOrCreateAutomationAnalysisReport } from "@/lib/analysis-report"
import { buildCozeDailyReport } from "@/lib/coze-report"

export const dynamic = "force-dynamic"

function getReportToken() {
  return process.env.COZE_REPORT_TOKEN ?? process.env.CRON_SECRET ?? process.env.AUTH_SECRET ?? ""
}

function isAuthorized(request: Request, url: URL) {
  const token = getReportToken()

  if (!token) {
    return false
  }

  return request.headers.get("authorization") === `Bearer ${token}` || url.searchParams.get("token") === token
}

export async function GET(request: Request) {
  const url = new URL(request.url)

  if (!isAuthorized(request, url)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const userEmail = url.searchParams.get("email") ?? process.env.COZE_REPORT_USER_EMAIL
    const forceRefresh = url.searchParams.get("refresh") === "1"
    const { user, report } = await getOrCreateAutomationAnalysisReport({
      userEmail,
      forceRefresh,
    })
    const cozeReport = buildCozeDailyReport(report)

    return NextResponse.json({
      ok: true,
      source: "garmin-ai-coach",
      userEmail: user.email,
      ...cozeReport,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "获取 Coze 每日报告失败"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
