import type { TrainingContext } from "@/lib/training-analysis"

function getRecoveryWindowStatus(context: TrainingContext) {
  const latestSession = context.activity.latestSession
  const readyAt = context.recovery.readyAt ? new Date(context.recovery.readyAt) : null
  const today = context.today.date ? new Date(`${context.today.date}T23:59:59.999+08:00`) : null
  const recoveryWindowExpired = Boolean(readyAt && today && readyAt.getTime() <= today.getTime())

  return {
    latestSessionDate: latestSession?.date ?? null,
    latestSessionEndedAt: latestSession?.endedAt ?? null,
    daysSinceLastSession: context.activity.daysSinceLastSession,
    recoveryHours: context.recovery.recoveryHours,
    readyAt: context.recovery.readyAt,
    recoveryWindowExpired,
    instruction:
      recoveryWindowExpired || (context.activity.daysSinceLastSession != null && context.activity.daysSinceLastSession >= 2)
        ? "上次运动的估算恢复窗口已经过期，不要把该 recoveryHours 当作当前未恢复风险；只能作为历史训练刺激背景。"
        : "如果 readyAt 尚未到达，可以把 recoveryHours 作为当前恢复风险证据。",
  }
}

export function buildBodyStatusMessages(context: TrainingContext) {
  return [
    {
      role: "system" as const,
      content: [
        "你是耐力训练恢复评估 Agent。",
        "只评估当前身体状态和可承受训练刺激，不生成完整训练计划。",
        "只能基于输入 JSON，不编造缺失数据，不做医疗诊断。",
        "必须引用具体指标、基线偏差、疲劳分或恢复时间作为证据。",
        "参考上次运动和恢复时长时，必须先看 latestSessionDate/latestSessionEndedAt/readyAt/daysSinceLastSession。",
        "如果恢复窗口已经过期，不能把 recoveryHours 写成当前仍未恢复或恢复能力弱，只能说上次训练刺激已经完成恢复窗口。",
        "需要结合 HRV 与静息心率判断生病/感冒风险：HRV 明显低于基线且静息心率明显高于基线时风险升高；如果静息心率缺失，必须标记风险未知或证据不足。",
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
          recoveryWindowStatus: getRecoveryWindowStatus(context),
          loadRatio: context.load.loadRatio,
          loadStatus: context.load.loadStatus,
          activity: context.activity,
          decision: context.decision,
          missingData: context.missingData,
        },
        null,
        2
      ),
    },
  ]
}
