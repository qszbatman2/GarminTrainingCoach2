import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { createArkJsonCompletion } from "@/lib/ark"
import prisma from "@/lib/prisma"
import { buildTrainingContext, parseTrainingAnalysis } from "@/lib/training-analysis"

export async function POST() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        metrics: {
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            sleepScore: true,
            hrv: true,
            restingHr: true,
            stress: true,
            raw: true,
          },
        },
        activities: {
          orderBy: { date: "asc" },
          select: {
            id: true,
            name: true,
            type: true,
            distance: true,
            duration: true,
            date: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    if (user.metrics.length === 0) {
      return NextResponse.json({ error: "还没有可分析的 Garmin 日级数据" }, { status: 400 })
    }

    const context = buildTrainingContext(user.metrics, user.activities)
    const prompt = [
      "请基于下面的 Garmin 训练摘要，输出训练分析 JSON。",
      "要求：",
      "1. 只能根据输入数据判断，严禁编造缺失指标。",
      "2. 不要给医疗诊断，不要建议超出数据支持范围的结论。",
      "3. todayAdvice 和 next7DaysAdvice 必须可执行、具体、简洁。",
      "4. 输出必须是纯 JSON，字段固定为：",
      JSON.stringify(
        {
          summary: "string",
          recoveryStatus: "good | moderate | poor",
          loadStatus: "low | balanced | high",
          riskLevel: "low | medium | high",
          keyFindings: ["string"],
          todayAdvice: ["string"],
          next7DaysAdvice: ["string"],
          watchMetrics: ["string"],
          missingData: ["string"],
        },
        null,
        2
      ),
      "训练摘要：",
      JSON.stringify(context, null, 2),
    ].join("\n")

    const content = await createArkJsonCompletion([
      {
        role: "system",
        content: "你是一名谨慎的耐力训练教练，擅长根据恢复与训练负荷数据给出保守、可执行的训练建议。",
      },
      {
        role: "user",
        content: prompt,
      },
    ])

    const analysis = parseTrainingAnalysis(content, context)

    return NextResponse.json({
      ok: true,
      context,
      analysis,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "生成训练分析失败"
    console.error("[Trae] Fix: API Error in analysis-generate:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
