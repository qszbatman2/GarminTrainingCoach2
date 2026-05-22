import { createHash } from "crypto"

import { Prisma } from "@prisma/client"

import { createArkJsonCompletion } from "@/lib/ark"
import prisma from "@/lib/prisma"
import {
  buildTrainingContext,
  parseTrainingAnalysis,
  type ActivityInput,
  type DailyMetricInput,
  type TrainingAnalysisPayload,
} from "@/lib/training-analysis"

const REPORT_TYPE = "latest"

function buildAnalysisPrompt(context: ReturnType<typeof buildTrainingContext>) {
  return [
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
}

function normalizeJson<T>(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as T
}

function serializeMetrics(metrics: DailyMetricInput[]) {
  return metrics.map((metric) => ({
    date: metric.date.toISOString(),
    sleepScore: metric.sleepScore,
    hrv: metric.hrv,
    restingHr: metric.restingHr,
    stress: metric.stress,
    raw: metric.raw,
  }))
}

function serializeActivities(activities: ActivityInput[]) {
  return activities.map((activity) => ({
    date: activity.date.toISOString(),
    name: activity.name,
    type: activity.type,
    distance: activity.distance,
    duration: activity.duration,
  }))
}

export function computeAnalysisInputHash(metrics: DailyMetricInput[], activities: ActivityInput[]) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        metrics: serializeMetrics(metrics),
        activities: serializeActivities(activities),
      })
    )
    .digest("hex")
}

async function generateAnalysisPayload(metrics: DailyMetricInput[], activities: ActivityInput[]) {
  const context = buildTrainingContext(metrics, activities)
  const content = await createArkJsonCompletion([
    {
      role: "system",
      content: "你是一名谨慎的耐力训练教练，擅长根据恢复与训练负荷数据给出保守、可执行的训练建议。",
    },
    {
      role: "user",
      content: buildAnalysisPrompt(context),
    },
  ])

  return {
    context,
    analysis: parseTrainingAnalysis(content, context),
  }
}

function mapStoredReport(report: {
  context: Prisma.JsonValue
  analysis: Prisma.JsonValue
  updatedAt: Date
}): TrainingAnalysisPayload {
  return {
    context: normalizeJson<TrainingAnalysisPayload["context"]>(report.context),
    analysis: normalizeJson<TrainingAnalysisPayload["analysis"]>(report.analysis),
    updatedAt: report.updatedAt.toISOString(),
  }
}

export async function getLatestSavedAnalysisReport(userId: string) {
  const report = await prisma.analysisReport.findUnique({
    where: {
      userId_reportType: {
        userId,
        reportType: REPORT_TYPE,
      },
    },
    select: {
      context: true,
      analysis: true,
      updatedAt: true,
      inputHash: true,
    },
  })

  if (!report) {
    return null
  }

  return {
    ...mapStoredReport(report),
    inputHash: report.inputHash,
  }
}

export async function getOrCreateLatestAnalysisReport(options: {
  userId: string
  metrics: DailyMetricInput[]
  activities: ActivityInput[]
  forceRefresh?: boolean
}) {
  const { userId, metrics, activities, forceRefresh = false } = options
  const inputHash = computeAnalysisInputHash(metrics, activities)
  const saved = await getLatestSavedAnalysisReport(userId)

  if (!forceRefresh && saved && saved.inputHash === inputHash) {
    return {
      context: saved.context,
      analysis: saved.analysis,
      updatedAt: saved.updatedAt,
    }
  }

  const payload = await generateAnalysisPayload(metrics, activities)
  const report = await prisma.analysisReport.upsert({
    where: {
      userId_reportType: {
        userId,
        reportType: REPORT_TYPE,
      },
    },
    update: {
      inputHash,
      context: payload.context as Prisma.InputJsonValue,
      analysis: payload.analysis as Prisma.InputJsonValue,
    },
    create: {
      userId,
      reportType: REPORT_TYPE,
      inputHash,
      context: payload.context as Prisma.InputJsonValue,
      analysis: payload.analysis as Prisma.InputJsonValue,
    },
    select: {
      context: true,
      analysis: true,
      updatedAt: true,
    },
  })

  return mapStoredReport(report)
}
