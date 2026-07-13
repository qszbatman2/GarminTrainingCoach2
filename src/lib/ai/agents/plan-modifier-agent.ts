import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildPlanModifierMessages } from "@/lib/ai/prompts/plan-modifier"
import { PlanDraftSchema, type BodyAssessment, type PlanReview } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

// 训练计划修改 Agent：
// 根据规则结论、身体状态和上一次审核意见，生成一个可被审核的今日计划草案。
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
