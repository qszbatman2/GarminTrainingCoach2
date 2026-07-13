import { z } from "zod"

// BodyStatusAgent 的输出结构：只描述身体状态和风险，不生成训练处方。
export const BodyStatusSchema = z.object({
  status: z.enum(["恢复优秀", "恢复良好", "中度疲劳", "重度疲劳", "未知"]),
  intensityTolerance: z.enum(["可承受正常训练", "只适合低强度", "不适合训练", "未知"]),
  illnessRisk: z.object({
    level: z.enum(["低", "中", "高", "未知"]),
    reason: z.string().min(1),
  }),
  riskFlags: z.array(z.string()).default([]),
  keyEvidence: z.array(z.string()).min(1).max(6),
  adviceFromBody: z.string().min(1),
})

// PlanModifierAgent 的输出结构：把规则结论和身体评估转成今日计划草案。
export const PlanDraftSchema = z.object({
  todayPlan: z.object({
    action: z.string().min(1),
    intensity: z.string().min(1),
    durationMin: z.object({ min: z.number(), max: z.number() }).nullable(),
    forbidden: z.array(z.string()).default([]),
  }),
  weeklyAdjustment: z.object({
    direction: z.enum(["补频次", "补总量", "降强度", "维持节奏", "优先恢复"]),
    reason: z.string().min(1),
  }),
  rationale: z.array(z.string()).min(1).max(6),
})

// PlanReviewAgent 的输出结构：只审核草案是否安全，不负责生成新计划。
export const PlanReviewSchema = z.object({
  approved: z.boolean(),
  severity: z.enum(["pass", "minor", "major"]),
  violations: z.array(z.string()).default([]),
  revisionInstructions: z.array(z.string()).default([]),
})

// FinalCoachAgent 的输出结构：面向前端展示，但硬结论会在 analysis-graph.ts 再次归一化。
export const FinalAnalysisSchema = z.object({
  shouldTrain: z.enum(["可训", "慎训", "不训"]),
  todayAdvice: z.string().min(1),
  reasonAnalysis: z.string().min(1).max(600),
  weeklyLoadAssessment: z.object({
    loadConclusion: z.enum(["不足", "偏低", "合理", "偏高", "过高", "未知"]),
    intensityConclusion: z.enum(["不足", "偏低", "合理", "偏高", "过高", "未知"]),
    overallConclusion: z.enum(["训练不足", "训练合理", "训练偏多", "过度风险", "未知"]),
    advice: z.string().min(1),
    reasonAnalysis: z.string().min(1).max(600),
  }),
})

// 导出推导类型，让 Agent、Prompt 和 Graph 共享同一套数据契约。
export type BodyAssessment = z.infer<typeof BodyStatusSchema>
export type PlanDraft = z.infer<typeof PlanDraftSchema>
export type PlanReview = z.infer<typeof PlanReviewSchema>
export type FinalAnalysis = z.infer<typeof FinalAnalysisSchema>
