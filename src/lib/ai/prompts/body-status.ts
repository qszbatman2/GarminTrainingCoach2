import type { TrainingContext } from "@/lib/training-analysis"

export function buildBodyStatusMessages(context: TrainingContext) {
  return [
    {
      role: "system" as const,
      content: [
        "你是耐力训练恢复评估 Agent。",
        "只评估当前身体状态和可承受训练刺激，不生成完整训练计划。",
        "只能基于输入 JSON，不编造缺失数据，不做医疗诊断。",
        "必须引用具体指标、基线偏差、疲劳分或恢复时间作为证据。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          today: context.today,
          baseline: context.baseline,
          abnormalities: context.abnormalities,
          fatigue: context.fatigue,
          recovery: context.recovery,
          loadRatio: context.load.loadRatio,
          loadStatus: context.load.loadStatus,
          decision: context.decision,
          missingData: context.missingData,
        },
        null,
        2
      ),
    },
  ]
}
