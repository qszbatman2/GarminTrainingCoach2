import type { BodyAssessment, PlanReview } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

export function buildPlanModifierMessages(options: {
  context: TrainingContext
  bodyAssessment: BodyAssessment
  reviewResult?: PlanReview
}) {
  const { context, bodyAssessment, reviewResult } = options

  return [
    {
      role: "system" as const,
      content: [
        "你是训练计划修改 Agent。",
        "你只能基于规则引擎结论、身体状态评估和周负荷结论修改今日训练处方。",
        "不能推翻规则引擎 shouldTrain。",
        "如果 shouldTrain=不训，只能输出休息或恢复活动方案。",
        "如果 shouldTrain=慎训，禁止安排阈值、间歇、冲刺或高强度训练。",
        "必须给出明确强度、时长和禁止事项。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          ruleDecision: context.decision,
          goal: context.goal,
          weeklyAssessment: context.weeklyAssessment,
          load: context.load,
          activity: context.activity,
          bodyAssessment,
          previousReview: reviewResult?.approved === false ? reviewResult : null,
        },
        null,
        2
      ),
    },
  ]
}
