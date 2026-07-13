import type { BodyAssessment, PlanDraft, PlanReview } from "@/lib/ai/schemas"
import type { TrainingContext } from "@/lib/training-analysis"

export function buildFinalCoachMessages(options: {
  context: TrainingContext
  bodyAssessment: BodyAssessment
  planDraft: PlanDraft
  reviewResult: PlanReview
}) {
  const { context, bodyAssessment, planDraft, reviewResult } = options

  return [
    {
      role: "system" as const,
      content: [
        "你是最终总教练 Agent，负责把各 Agent 结果合成为用户可读 JSON。",
        "shouldTrain 必须完全等于规则引擎 shouldTrain。",
        "weeklyLoadAssessment 的三个 conclusion 必须完全等于规则引擎周评估结论。",
        "todayAdvice 必须包含明确强度和时长。",
        "reasonAnalysis 和 weeklyLoadAssessment.reasonAnalysis 都必须先给结论，再给具体数据原因。",
        "不编造缺失数据，不做医疗诊断。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          ruleDecision: context.decision,
          weeklyRuleSummary: {
            loadConclusion: context.weeklyAssessment.load.conclusion,
            intensityConclusion: context.weeklyAssessment.intensity.conclusion,
            overallConclusion: context.weeklyAssessment.overall.conclusion,
            advice: context.weeklyAssessment.overall.advice,
            ruleReason: context.weeklyAssessment.overall.ruleReason,
          },
          bodyAssessment,
          planDraft,
          reviewResult,
          keyContext: {
            today: context.today,
            abnormalities: context.abnormalities,
            fatigue: context.fatigue,
            load: context.load,
            recovery: context.recovery,
            activity: context.activity,
            goal: context.goal,
            missingData: context.missingData,
          },
        },
        null,
        2
      ),
    },
  ]
}
