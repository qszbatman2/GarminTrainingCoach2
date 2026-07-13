import { createHash } from "crypto"

import { Prisma } from "@prisma/client"

import { ANALYSIS_GRAPH_VERSION, runTrainingAnalysisGraph } from "@/lib/ai/analysis-graph"
import { createArkJsonCompletion } from "@/lib/ark"
import prisma from "@/lib/prisma"
import { buildTrainingAnalysisMessages } from "@/lib/training-prompt"
import {
  buildTrainingContext,
  parseTrainingAnalysis,
  type ActivityInput,
  type DailyMetricInput,
  type TrainingAnalysisPayload,
} from "@/lib/training-analysis"

const REPORT_TYPE = "latest"
const ANALYSIS_VERSION = ANALYSIS_GRAPH_VERSION

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
    raw: activity.raw,
  }))
}

function normalizeTrainingGoal(trainingGoal?: string | null) {
  return String(trainingGoal ?? "").trim()
}

export function computeAnalysisInputHash(metrics: DailyMetricInput[], activities: ActivityInput[], trainingGoal?: string | null) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: ANALYSIS_VERSION,
        trainingGoal: normalizeTrainingGoal(trainingGoal),
        metrics: serializeMetrics(metrics),
        activities: serializeActivities(activities),
      })
    )
    .digest("hex")
}

async function generateAnalysisPayload(metrics: DailyMetricInput[], activities: ActivityInput[], trainingGoal?: string | null) {
  const context = buildTrainingContext(metrics, activities, trainingGoal)
  const normalizedTrainingGoal = normalizeTrainingGoal(trainingGoal)

  if (process.env.AI_ANALYSIS_MODE === "single") {
    const content = await createArkJsonCompletion(
      buildTrainingAnalysisMessages({
        context,
        trainingGoal: normalizedTrainingGoal,
      })
    )

    return {
      context,
      analysis: {
        ...parseTrainingAnalysis(content, context),
        meta: {
          analysisMode: "single",
          graphVersion: ANALYSIS_VERSION,
          generatedBy: "single-prompt",
          agentTraceAvailable: false,
        },
      },
    }
  }

  const analysis = await runTrainingAnalysisGraph({
    context,
    trainingGoal: normalizedTrainingGoal,
  })

  return {
    context,
    analysis,
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
  trainingGoal?: string | null
  metrics: DailyMetricInput[]
  activities: ActivityInput[]
  forceRefresh?: boolean
}) {
  const { userId, trainingGoal, metrics, activities, forceRefresh = false } = options
  const inputHash = computeAnalysisInputHash(metrics, activities, trainingGoal)
  const saved = await getLatestSavedAnalysisReport(userId)

  if (!forceRefresh && saved && saved.inputHash === inputHash) {
    return {
      context: saved.context,
      analysis: saved.analysis,
      updatedAt: saved.updatedAt,
    }
  }

  const payload = await generateAnalysisPayload(metrics, activities, trainingGoal)
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

export async function getAnalysisReportAutomationUser(userEmail?: string | null) {
  const email = String(userEmail ?? "").trim()
  const select = {
    id: true,
    email: true,
    trainingGoal: true,
    metrics: {
      orderBy: { date: "asc" as const },
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
      orderBy: { date: "asc" as const },
      select: {
        id: true,
        name: true,
        type: true,
        distance: true,
        duration: true,
        date: true,
        raw: true,
      },
    },
  }

  if (email) {
    return prisma.user.findUnique({
      where: { email },
      select,
    })
  }

  return prisma.user.findFirst({
    where: {
      metrics: {
        some: {},
      },
    },
    orderBy: { updatedAt: "desc" },
    select,
  })
}

export async function getOrCreateAutomationAnalysisReport(options: {
  userEmail?: string | null
  forceRefresh?: boolean
}) {
  const user = await getAnalysisReportAutomationUser(options.userEmail)

  if (!user) {
    throw new Error("没有找到可生成日报的用户")
  }

  if (user.metrics.length === 0) {
    throw new Error("还没有可分析的 Garmin 日级数据")
  }

  const report = await getOrCreateLatestAnalysisReport({
    userId: user.id,
    trainingGoal: user.trainingGoal,
    metrics: user.metrics,
    activities: user.activities,
    forceRefresh: options.forceRefresh,
  })

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    report,
  }
}
