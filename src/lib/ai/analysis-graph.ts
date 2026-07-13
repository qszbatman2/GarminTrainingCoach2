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

const MAX_REVISIONS = 1

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

function fallbackAnalysis(context: TrainingContext) {
  return parseTrainingAnalysis("{}", context)
}

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

function routeAfterReview(state: AnalysisGraphState) {
  if (state.reviewResult?.approved) {
    return "finalCoach"
  }

  if (state.retryCount < MAX_REVISIONS) {
    return "planModifier"
  }

  return "fallbackFinal"
}

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
        finalAnalysis: normalizeFinalAnalysis(final, state.context),
      }
    })
    .addNode("fallbackFinal", async (state) => ({
      finalAnalysis: fallbackAnalysis(state.context),
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

    return result.finalAnalysis ?? fallbackAnalysis(options.context)
  } catch (error) {
    console.error("[Trae] Multi-agent analysis failed:", error)
    return fallbackAnalysis(options.context)
  }
}
