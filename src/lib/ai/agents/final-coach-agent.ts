import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildFinalCoachMessages } from "@/lib/ai/prompts/final-coach"
import {
  FinalAnalysisSchema,
  type BodyAssessment,
  type PlanDraft,
  type PlanReview,
} from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

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
