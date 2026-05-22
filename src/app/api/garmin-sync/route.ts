import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { syncGarminDateForUser } from "@/lib/garmin-sync"

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const { garminEmail, garminPassword, date } = await request.json()

    if (!date) {
      return NextResponse.json({ error: "请选择同步日期" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        garminEmail: true,
        garminPassword: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    const resolvedGarminEmail = String(garminEmail ?? user.garminEmail ?? "").trim().toLowerCase()
    const resolvedGarminPassword = String(garminPassword ?? user.garminPassword ?? "")

    if (!resolvedGarminEmail || !resolvedGarminPassword) {
      return NextResponse.json({ error: "请先绑定 Garmin 账号" }, { status: 400 })
    }

    if (resolvedGarminEmail !== user.garminEmail || resolvedGarminPassword !== user.garminPassword) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          garminEmail: resolvedGarminEmail,
          garminPassword: resolvedGarminPassword,
        },
      })
    }

    const syncResult = await syncGarminDateForUser({
      userId: user.id,
      garminEmail: resolvedGarminEmail,
      garminPassword: resolvedGarminPassword,
      date,
    })

    return NextResponse.json({
      success: true,
      message: "Garmin data synced successfully",
      metricId: syncResult.metricId,
      activitiesCount: syncResult.activitiesCount,
      metricComplete: syncResult.metricComplete,
      incompleteActivitiesCount: syncResult.incompleteActivitiesCount,
    })
  } catch (error: any) {
    console.error("[Trae] Fix: API Error in garmin-sync:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
