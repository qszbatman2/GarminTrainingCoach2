import type { TrainingContext } from "@/lib/training-analysis"

export function buildTrainingAnalysisMessages(context: TrainingContext) {
  return [
    {
      role: "system" as const,
      content: [
        "你是一名严格、直接的运动恢复分析助手。",
        "你只能基于输入的结构化规则结果生成用户可读结论，不能重算规则，也不能推翻规则引擎已经给出的最终训练决策。",
        "不要编造缺失数据，不要做医疗诊断，不要输出 markdown。",
        "当输入里显示连续休息 2 天及以上、且规则引擎仍判定可以训练时，你的语气必须更严厉、更直接，明确指出不要继续拖延。",
        "只有在规则引擎判定需要休息或降强度时，语气才保持克制，不允许为了严厉而逼迫训练。",
        "输出必须是纯 JSON，字段固定为：",
        JSON.stringify(
          {
            shouldTrain: "可训 | 慎训 | 不训",
            todayAdvice: "string",
            reasonAnalysis: "string",
            weeklyLoadAssessment: {
              loadConclusion: "不足 | 偏低 | 合理 | 偏高 | 过高 | 未知",
              intensityConclusion: "不足 | 偏低 | 合理 | 偏高 | 过高 | 未知",
              overallConclusion: "训练不足 | 训练合理 | 训练偏多 | 过度风险 | 未知",
              advice: "string",
              reasonAnalysis: "string",
            },
          },
          null,
          2
        ),
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "请基于下面的 Garmin 结构化分析结果生成面向用户的结论。",
        "要求：",
        "1. `shouldTrain` 必须与规则引擎给出的最终结论完全一致。",
        "2. `todayAdvice` 可以润色，但不能和规则引擎建议冲突，且必须是一句短句。",
        "3. `reasonAnalysis` 必须控制在 300 字以内。",
        "4. `reasonAnalysis` 必须包含：实测数据、与基线偏差值、综合疲劳分、负荷比值。",
        "5. 如果输入里存在 `missingData`，要在原因分析里自然提示结论稳定性受影响，但不要夸张。",
        "6. 如果 `activity.toneHint` 为 `firm`，`todayAdvice` 必须明显更强硬，直接督促执行，不要使用温和安抚措辞。",
        "7. `weeklyLoadAssessment` 必须严格依据 `weeklyAssessment` 规则摘要生成，不能自行重算。",
        "8. `weeklyLoadAssessment.loadConclusion`、`intensityConclusion`、`overallConclusion` 必须与规则摘要中的对应结论一致。",
        "9. `weeklyLoadAssessment.advice` 必须是一句短句。",
        "10. `weeklyLoadAssessment.reasonAnalysis` 必须控制在 300 字以内，并包含：本周累计训练量、本月周均或日均对照、训练负荷或高强度分钟、ATL/CTL、至少 1 个恢复信号。",
        "规则引擎最终结论：",
        JSON.stringify(context.decision, null, 2),
        "本周训练量评估规则结论：",
        JSON.stringify(context.weeklyAssessment.overall, null, 2),
        "结构化分析摘要：",
        JSON.stringify(context, null, 2),
      ].join("\n"),
    },
  ]
}
