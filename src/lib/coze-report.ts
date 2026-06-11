import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

export type CozeDailyReport = {
  date: string | null
  generatedAt: string | null
  updatedAt: string | null
  shouldTrain: string
  todayAdvice: string
  weeklyConclusion: string
  weeklyAdvice: string
  reasonAnalysis: string
  metrics: {
    sleepScore: number | null
    hrv: number | null
    restingHr: number | null
    stress: number | null
    bodyBatteryHigh: number | null
    bodyBatteryLow: number | null
    loadRatio: number | null
    recoveryHours: number | null
  }
  pushText: string
  markdown: string
}

function valueOrDash(value: number | string | null | undefined) {
  return value == null || value === "" ? "-" : String(value)
}

function buildMetricLine(label: string, value: number | string | null | undefined, unit = "") {
  return `- ${label}: ${valueOrDash(value)}${value == null ? "" : unit}`
}

export function buildCozeDailyReport(payload: TrainingAnalysisPayload): CozeDailyReport {
  const { context, analysis } = payload
  const metrics = {
    sleepScore: context.today.sleepScore,
    hrv: context.today.hrv,
    restingHr: context.today.restingHr,
    stress: context.today.stress,
    bodyBatteryHigh: context.today.bodyBatteryHigh,
    bodyBatteryLow: context.today.bodyBatteryLow,
    loadRatio: context.today.loadRatio,
    recoveryHours: context.today.recoveryHours,
  }
  const generatedAt = context.generatedAt ?? payload.updatedAt ?? null
  const date = context.today.date ?? context.dateRange.metricEnd
  const weekly = analysis.weeklyLoadAssessment
  const metricLines = [
    buildMetricLine("睡眠分", metrics.sleepScore),
    buildMetricLine("HRV", metrics.hrv),
    buildMetricLine("静息心率", metrics.restingHr, " bpm"),
    buildMetricLine("压力", metrics.stress),
    buildMetricLine("Body Battery 高/低", `${valueOrDash(metrics.bodyBatteryHigh)}/${valueOrDash(metrics.bodyBatteryLow)}`),
    buildMetricLine("ATL/CTL", metrics.loadRatio),
    buildMetricLine("恢复剩余", metrics.recoveryHours, " 小时"),
  ]

  const markdown = [
    "## Garmin AI Coach 每日报告",
    "",
    `日期: ${valueOrDash(date)}`,
    `训练结论: ${analysis.shouldTrain}`,
    `今日建议: ${analysis.todayAdvice}`,
    "",
    "### 为什么",
    analysis.reasonAnalysis,
    "",
    "### 本周训练量",
    `结论: ${weekly.overallConclusion}`,
    `建议: ${weekly.advice}`,
    weekly.reasonAnalysis,
    "",
    "### 关键指标",
    ...metricLines,
  ].join("\n")

  const pushText = [
    `Garmin AI Coach ${valueOrDash(date)}`,
    `结论: ${analysis.shouldTrain}`,
    `建议: ${analysis.todayAdvice}`,
    `本周: ${weekly.overallConclusion}`,
    `原因: ${analysis.reasonAnalysis}`,
  ].join("\n")

  return {
    date,
    generatedAt,
    updatedAt: payload.updatedAt ?? null,
    shouldTrain: analysis.shouldTrain,
    todayAdvice: analysis.todayAdvice,
    weeklyConclusion: weekly.overallConclusion,
    weeklyAdvice: weekly.advice,
    reasonAnalysis: analysis.reasonAnalysis,
    metrics,
    pushText,
    markdown,
  }
}
