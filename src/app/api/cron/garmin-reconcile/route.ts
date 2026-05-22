import { NextResponse } from "next/server"

import prisma from "@/lib/prisma"
import { getDateKey, syncGarminDateForUser } from "@/lib/garmin-sync"

function getYesterdayInShanghai() {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  return formatter.format(date)
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
    const targetDate = getYesterdayInShanghai()
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

    const results: Array<{ email: string; date: string; success: boolean; error?: string }> = []
    for (const user of users) {
      try {
        await syncGarminDateForUser({
          userId: user.id,
          garminEmail: user.garminEmail ?? "",
          garminPassword: user.garminPassword ?? "",
          date: getDateKey(targetDate),
        })

        results.push({ email: user.email, date: targetDate, success: true })
      } catch (error: unknown) {
        results.push({
          email: user.email,
          date: targetDate,
          success: false,
          error: error instanceof Error ? error.message : "同步失败",
        })
      }
    }

    return NextResponse.json({
      success: true,
      targetDate,
      usersCount: users.length,
      successCount: results.filter((item) => item.success).length,
      failureCount: results.filter((item) => !item.success).length,
      results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "定时补拉失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
