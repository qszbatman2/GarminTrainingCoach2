import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildBodyStatusMessages } from "@/lib/ai/prompts/body-status"
import { BodyStatusSchema } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

export async function runBodyStatusAgent(model: ArkChatModel, context: TrainingContext) {
  return model.withStructuredOutput(BodyStatusSchema).invoke(buildBodyStatusMessages(context))
}
