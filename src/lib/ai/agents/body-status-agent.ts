import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildBodyStatusMessages } from "@/lib/ai/prompts/body-status"
import { BodyStatusSchema } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

// 身体状态 Agent：
// 输入规则引擎整理好的 TrainingContext，输出符合 BodyStatusSchema 的结构化恢复评估。
export async function runBodyStatusAgent(model: ArkChatModel, context: TrainingContext) {
  return model.withStructuredOutput(BodyStatusSchema).invoke(buildBodyStatusMessages(context))
}
