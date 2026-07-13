import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildFinalCoachMessages } from "@/lib/ai/prompts/final-coach"
import {
  FinalAnalysisSchema,
  type BodyAssessment,
  type PlanDraft,
  type PlanReview,
} from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

// 最终总教练 Agent：
// 把前面 Agent 的结构化结果合成为用户可读分析；硬结论仍会由 Graph 再校准。
export async function runFinalCoachAgent(
  model: ArkChatModel,
  options: {
    context: TrainingContext
    bodyAssessment: BodyAssessment
    planDraft: PlanDraft
    reviewResult: PlanReview
  }
) {
  return model.withStructuredOutput(FinalAnalysisSchema).invoke(buildFinalCoachMessages(options))
}
