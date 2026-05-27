import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"

const MAX_TRAINING_GOAL_LENGTH = 500

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const { trainingGoal } = (await request.json().catch(() => ({}))) as { trainingGoal?: unknown }
    const normalizedTrainingGoal = String(trainingGoal ?? "").trim()

    if (normalizedTrainingGoal.length > MAX_TRAINING_GOAL_LENGTH) {
      return NextResponse.json({ error: `训练目标最多 ${MAX_TRAINING_GOAL_LENGTH} 个字符` }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        trainingGoal: normalizedTrainingGoal || null,
      },
      select: {
        trainingGoal: true,
      },
    })

    return NextResponse.json({
      success: true,
      trainingGoal: user.trainingGoal ?? "",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "保存训练目标失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
