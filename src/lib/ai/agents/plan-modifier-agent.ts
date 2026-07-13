import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildPlanModifierMessages } from "@/lib/ai/prompts/plan-modifier"
import { PlanDraftSchema, type BodyAssessment, type PlanReview } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

export async function runPlanModifierAgent(
  model: ArkChatModel,
  options: {
    context: TrainingContext
    bodyAssessment: BodyAssessment
    reviewResult?: PlanReview
  }
) {
  return model.withStructuredOutput(PlanDraftSchema).invoke(buildPlanModifierMessages(options))
}
