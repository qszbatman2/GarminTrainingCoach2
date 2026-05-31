import type { TrainingContext } from "@/lib/training-analysis"

export function buildTrainingAnalysisMessages({
  context,
  trainingGoal,
}: {
  context: TrainingContext
  trainingGoal?: string
}) {
  return [
    {
      role: "system" as const,
      content: [
        "你是一名严格、直接的耐力运动教练和运动恢复专家。",
        "你只能基于输入的结构化规则结果生成用户可读结论，不能重算规则，也不能推翻规则引擎已经给出的最终训练决策。",
        "不要编造缺失数据，不要做医疗诊断，不要输出 markdown。",
        "今日原因分析和每周原因分析都必须先给结论，再给支撑该结论的数据原因，不能只报结果不解释依据。",
        "当你判断疲劳、恢复不足、负荷偏高或状态良好时，必须明确指出是哪些指标偏离了基线或目标、偏离了多少，并据此得出结论。",
        "如果提供了用户训练目标，你只能把它作为解释和本周建议的参考背景，不能据此修改规则引擎结论。",
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
        "3. `reasonAnalysis` 必须控制在 400 字以内。",
        "4. `reasonAnalysis` 必须采用“结论1：... 原因：...；结论2：... 原因：...”的形式，至少输出 2 组结论-原因。",
        "5. 每组“原因”都必须包含明确的数据解读，至少引用 1-2 个具体指标，并说明这些指标相对基线、阈值或近期水平偏高/偏低了多少，进而支撑该结论。",
        "6. `reasonAnalysis` 必须覆盖：实测数据、与基线偏差值、综合疲劳分、负荷比值；如果能支撑结论，可补充 HRV、静息心率、睡眠、压力或最近训练刺激。",
        "7. 如果输入里存在 `missingData`，要在原因分析里自然提示结论稳定性受影响，但不要夸张。",
        "8. 如果 `activity.toneHint` 为 `firm`，`todayAdvice` 必须明显更强硬，直接督促执行，不要使用温和安抚措辞。",
        "9. `weeklyLoadAssessment` 必须严格依据 `weeklyAssessment` 规则摘要生成，不能自行重算。",
        "10. `weeklyLoadAssessment.loadConclusion`、`intensityConclusion`、`overallConclusion` 必须与规则摘要中的对应结论一致。",
        "11. `weeklyLoadAssessment.advice` 必须是一句短句。",
        "12. `weeklyLoadAssessment.reasonAnalysis` 必须控制在 400 字以内。",
        "13. 如果存在用户训练目标，`weeklyLoadAssessment.reasonAnalysis` 必须按目标的各个维度或子目标逐项分析，使用“目标A：进度/是否符合预期/原因/关键指标；目标B：进度/是否符合预期/原因/关键指标”的形式。",
        "14. 每个目标维度都要明确写出：当前进度如何、是否符合预期、原因是什么、关键指标是什么；关键指标必须引用具体数据，如本周累计时长、距离、训练负荷、高强度分钟、ATL/CTL、恢复信号或最近 4 周同进度对照。",
        "15. 如果用户只给了一个总体目标，就按最相关的 2-4 个维度拆解分析，例如训练量、强度、恢复、专项刺激；但必须基于已提供的目标和数据，不能虚构不存在的目标。",
        "16. 没有训练目标时，不要虚构目标，此时按本周训练量、强度、恢复三个维度做简要总结。",
        "规则引擎最终结论：",
        JSON.stringify(context.decision, null, 2),
        "本周训练量评估规则结论：",
        JSON.stringify(context.weeklyAssessment.overall, null, 2),
        "用户输入的训练目标：",
        trainingGoal || "无",
        "结构化分析摘要：",
        JSON.stringify(context, null, 2),
      ].join("\n"),
    },
  ]
}
