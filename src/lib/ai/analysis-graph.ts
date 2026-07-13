import { Annotation, END, START, StateGraph } from "@langchain/langgraph"

import { runBodyStatusAgent } from "@/lib/ai/agents/body-status-agent"
import { runFinalCoachAgent } from "@/lib/ai/agents/final-coach-agent"
import { runPlanModifierAgent } from "@/lib/ai/agents/plan-modifier-agent"
import { runPlanReviewAgent } from "@/lib/ai/agents/plan-review-agent"
import { createArkChatModel } from "@/lib/ai/ark-model"
import type { BodyAssessment, FinalAnalysis, PlanDraft, PlanReview } from "@/lib/ai/schemas"
import {
  parseTrainingAnalysis,
  type TrainingAnalysisResult,
  type TrainingContext,
} from "@/lib/training-analysis"

export const ANALYSIS_GRAPH_VERSION = "training-rule-v19-weekly-target-aware"
const MAX_REVISIONS = 1

// LangGraph 在每个节点之间传递的共享状态。
// 规则引擎生成的 context 是底座，后续 Agent 只能补充分析，不能改写硬结论。
type AnalysisGraphState = {
  context: TrainingContext
  trainingGoal: string
  bodyAssessment?: BodyAssessment
  planDraft?: PlanDraft
  reviewResult?: PlanReview
  finalAnalysis?: TrainingAnalysisResult
  retryCount: number
  errors: string[]
}

// Annotation 定义每个状态字段如何被节点写入或合并。
// 大部分字段采用“后写覆盖前写”，errors 采用追加，方便保留完整失败原因。
const AnalysisState = Annotation.Root({
  context: Annotation<TrainingContext>(),
  trainingGoal: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  bodyAssessment: Annotation<BodyAssessment | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  planDraft: Annotation<PlanDraft | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  reviewResult: Annotation<PlanReview | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  finalAnalysis: Annotation<TrainingAnalysisResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  retryCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (current, next) => [...current, ...next],
    default: () => [],
  }),
})

// 兜底分析完全依赖 training-analysis.ts 的规则解析结果。
// 当 LLM、结构化输出或审核链路失败时，用它保证页面仍有稳定结论。
function fallbackAnalysis(context: TrainingContext) {
  return parseTrainingAnalysis("{}", context)
}

// 把多 Agent 执行元信息和各 Agent 原始输出挂到最终 analysis 上。
// 这样数据库里的报告可以回溯：是哪种模式生成、是否 fallback、每步输出是什么。
function attachGraphMeta(
  analysis: TrainingAnalysisResult,
  state: Pick<AnalysisGraphState, "bodyAssessment" | "planDraft" | "reviewResult" | "retryCount" | "errors">,
  analysisMode: "multi-agent" | "multi-agent-fallback"
): TrainingAnalysisResult {
  return {
    ...analysis,
    meta: {
      analysisMode,
      graphVersion: ANALYSIS_GRAPH_VERSION,
      generatedBy: "langgraph",
      agentTraceAvailable: true,
      retryCount: state.retryCount,
      errors: state.errors.length > 0 ? state.errors : undefined,
    },
    agentTrace: {
      bodyAssessment: state.bodyAssessment,
      planDraft: state.planDraft,
      reviewResult: state.reviewResult,
    },
  }
}

// 最终展示字段仍以规则引擎为准：
// shouldTrain 和 weekly conclusions 强制来自 context，避免 FinalCoachAgent 改写硬结论。
function normalizeFinalAnalysis(analysis: FinalAnalysis, context: TrainingContext): TrainingAnalysisResult {
  const fallback = fallbackAnalysis(context)

  return {
    shouldTrain: context.decision.shouldTrain,
    todayAdvice: analysis.todayAdvice.trim() || fallback.todayAdvice,
    reasonAnalysis: (analysis.reasonAnalysis.trim() || fallback.reasonAnalysis).slice(0, 400),
    weeklyLoadAssessment: {
      loadConclusion: context.weeklyAssessment.load.conclusion,
      intensityConclusion: context.weeklyAssessment.intensity.conclusion,
      overallConclusion: context.weeklyAssessment.overall.conclusion,
      advice: analysis.weeklyLoadAssessment.advice.trim() || fallback.weeklyLoadAssessment.advice,
      reasonAnalysis: (analysis.weeklyLoadAssessment.reasonAnalysis.trim() || fallback.weeklyLoadAssessment.reasonAnalysis).slice(0, 400),
    },
  }
}

// 审核节点后的路由：
// 通过则进入最终教练；不通过先给 PlanModifierAgent 一次修正机会；仍不通过则回退。
function routeAfterReview(state: AnalysisGraphState) {
  if (state.reviewResult?.approved) {
    return "finalCoach"
  }

  if (state.retryCount < MAX_REVISIONS) {
    return "planModifier"
  }

  return "fallbackFinal"
}

// 多 Agent 主流程：
// 1. BodyStatusAgent 评估身体状态
// 2. PlanModifierAgent 生成今日训练草案
// 3. PlanReviewAgent 做安全审核
// 4. FinalCoachAgent 合成用户可读结果
function buildAnalysisGraph() {
  const model = createArkChatModel()

  return new StateGraph(AnalysisState)
    .addNode("bodyStatus", async (state) => ({
      bodyAssessment: await runBodyStatusAgent(model, state.context),
    }))
    .addNode("planModifier", async (state) => {
      if (!state.bodyAssessment) {
        throw new Error("缺少身体状态评估，无法修改训练计划")
      }

      return {
        planDraft: await runPlanModifierAgent(model, {
          context: state.context,
          bodyAssessment: state.bodyAssessment,
          reviewResult: state.reviewResult,
        }),
        retryCount: state.reviewResult?.approved === false ? state.retryCount + 1 : state.retryCount,
      }
    })
    .addNode("planReview", async (state) => {
      if (!state.bodyAssessment || !state.planDraft) {
        throw new Error("缺少计划草案，无法审核")
      }

      return {
        reviewResult: await runPlanReviewAgent(model, {
          context: state.context,
          bodyAssessment: state.bodyAssessment,
          planDraft: state.planDraft,
        }),
      }
    })
    .addNode("finalCoach", async (state) => {
      if (!state.bodyAssessment || !state.planDraft || !state.reviewResult) {
        throw new Error("缺少 Agent 输出，无法合成最终分析")
      }

      const final = await runFinalCoachAgent(model, {
        context: state.context,
        bodyAssessment: state.bodyAssessment,
        planDraft: state.planDraft,
        reviewResult: state.reviewResult,
      })

      return {
        finalAnalysis: attachGraphMeta(normalizeFinalAnalysis(final, state.context), state, "multi-agent"),
      }
    })
    .addNode("fallbackFinal", async (state) => ({
      finalAnalysis: attachGraphMeta(
        fallbackAnalysis(state.context),
        {
          ...state,
          errors: state.reviewResult?.violations ?? ["多 Agent 分析未通过审核，已回退到规则分析"],
        },
        "multi-agent-fallback"
      ),
      errors: state.reviewResult?.violations ?? ["多 Agent 分析未通过审核，已回退到规则分析"],
    }))
    .addEdge(START, "bodyStatus")
    .addEdge("bodyStatus", "planModifier")
    .addEdge("planModifier", "planReview")
    .addConditionalEdges("planReview", routeAfterReview, {
      finalCoach: "finalCoach",
      planModifier: "planModifier",
      fallbackFinal: "fallbackFinal",
    })
    .addEdge("finalCoach", END)
    .addEdge("fallbackFinal", END)
    .compile()
}

// 对外暴露的多 Agent 分析入口。
// 任一异常都会被捕获并回退到规则分析，避免 AI 链路故障影响核心报告生成。
export async function runTrainingAnalysisGraph(options: {
  context: TrainingContext
  trainingGoal: string
}) {
  try {
    const graph = buildAnalysisGraph()
    const result = await graph.invoke({
      context: options.context,
      trainingGoal: options.trainingGoal,
      retryCount: 0,
      errors: [],
    })

    return (
      result.finalAnalysis ??
      attachGraphMeta(
        fallbackAnalysis(options.context),
        {
          retryCount: 0,
          errors: ["多 Agent 分析没有返回最终结果，已回退到规则分析"],
        },
        "multi-agent-fallback"
      )
    )
  } catch (error) {
    console.error("[Trae] Multi-agent analysis failed:", error)
    const message = error instanceof Error ? error.message : "多 Agent 分析异常，已回退到规则分析"
    return attachGraphMeta(
      fallbackAnalysis(options.context),
      {
        retryCount: 0,
        errors: [message],
      },
      "multi-agent-fallback"
    )
  }
}
