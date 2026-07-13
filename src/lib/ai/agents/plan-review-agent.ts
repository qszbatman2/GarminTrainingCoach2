import type { ArkChatModel } from "@/lib/ai/ark-model"
import { buildPlanReviewMessages } from "@/lib/ai/prompts/plan-review"
import { PlanReviewSchema, type BodyAssessment, type PlanDraft, type PlanReview } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

// 在结构化对象里做关键词检查，主要用于兜住 LLM 审核遗漏的明显风险。
function containsAnyText(value: unknown, keywords: string[]) {
  const text = JSON.stringify(value).toLowerCase()
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

// 只抽取今天真正要执行的动作和强度。
// forbidden 里的“禁止高强度”不应被误判成今天安排了高强度。
function getTodayPrescriptionText(draft: PlanDraft) {
  return [draft.todayPlan.action, draft.todayPlan.intensity].join(" ")
}

// 把本地硬规则发现的问题并入 LLM 审核结果。
function appendViolation(review: PlanReview, violation: string, instruction: string): PlanReview {
  return {
    approved: false,
    severity: "major",
    violations: [...review.violations, violation],
    revisionInstructions: [...review.revisionInstructions, instruction],
  }
}

// 本地安全闸门：
// 即使 PlanReviewAgent 没识别出违规，这里也会强制拦截“不训仍训练”“慎训给高强度”等底线问题。
function enforceRuleGuards(context: TrainingContext, draft: PlanDraft, review: PlanReview): PlanReview {
  let guarded = review

  if (context.decision.shouldTrain === "不训") {
    const prescriptionText = getTodayPrescriptionText(draft)
    const hasTraining = containsAnyText(prescriptionText, ["z2", "z3", "阈值", "间歇", "冲刺", "训练", "骑"])
    if (hasTraining && !containsAnyText(prescriptionText, ["不安排正式训练", "休息", "恢复活动", "步行", "拉伸"])) {
      guarded = appendViolation(guarded, "规则结论为不训，但计划仍包含正式训练表达。", "改为休息或 20-30 分钟恢复活动，不安排正式训练。")
    }
  }

  if (context.decision.shouldTrain === "慎训" && containsAnyText(getTodayPrescriptionText(draft), ["z3", "z4", "z5", "阈值", "间歇", "冲刺", "高强度"])) {
    guarded = appendViolation(guarded, "规则结论为慎训，但计划包含高强度内容。", "改为 Z1-Z2 恢复强度，并明确禁止阈值、间歇和冲刺。")
  }

  if (!draft.todayPlan.durationMin && context.decision.shouldTrain !== "不训") {
    guarded = appendViolation(guarded, "今日计划缺少明确时长。", "补充 durationMin.min 和 durationMin.max。")
  }

  return guarded
}

// 审核 Agent：
// 先让模型按 prompt 审核，再用本地硬规则补一层确定性校验。
export async function runPlanReviewAgent(
  model: ArkChatModel,
  options: {
    context: TrainingContext
    bodyAssessment: BodyAssessment
    planDraft: PlanDraft
  }
) {
  const review = await model.withStructuredOutput(PlanReviewSchema).invoke(buildPlanReviewMessages(options))
  return enforceRuleGuards(options.context, options.planDraft, {
    ...review,
    violations: review.violations ?? [],
    revisionInstructions: review.revisionInstructions ?? [],
  })
}
