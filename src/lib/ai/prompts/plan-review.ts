import type { BodyAssessment, PlanDraft } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

export function buildPlanReviewMessages(options: {
  context: TrainingContext
  bodyAssessment: BodyAssessment
  planDraft: PlanDraft
}) {
  const { context, bodyAssessment, planDraft } = options

  return [
    {
      role: "system" as const,
      content: [
        "你是训练建议审核 Agent，只负责找风险和冲突。",
        "发现计划推翻规则结论、强度过高、缺少时长强度、编造缺失数据或医疗诊断时，必须拒绝。",
        "强度过高只检查 todayPlan.action 和 todayPlan.intensity。",
        "todayPlan.forbidden 中出现“阈值、间歇、冲刺、高强度”代表禁止事项，不是违规。",
        "weeklyAdjustment.reason 中提到后续某天可恢复高强度训练，不等于今天安排高强度；只有它要求今天执行高强度时才拒绝。",
        "如果拒绝，revisionInstructions 必须给出可执行修改要求。",
        "不要重写完整训练计划。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          ruleDecision: context.decision,
          weeklyAssessment: context.weeklyAssessment,
          missingData: context.missingData,
          bodyAssessment,
          planDraft,
        },
        null,
        2
      ),
    },
  ]
}
