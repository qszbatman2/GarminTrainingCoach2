import assert from "node:assert/strict"
import test from "node:test"

import { buildCozeDailyReport } from "./coze-report.ts"
import type { TrainingAnalysisPayload } from "./training-analysis.ts"

const payload: TrainingAnalysisPayload = {
  updatedAt: "2026-06-11T06:30:00.000Z",
  context: {
    generatedAt: "2026-06-11T06:30:00.000Z",
    goal: {
      raw: "提升 FTP",
      category: "ftp",
      keywords: ["FTP"],
    },
    dateRange: {
      metricStart: "2026-05-13",
      metricEnd: "2026-06-11",
      activityStart: "2026-05-13",
      activityEnd: "2026-06-10",
    },
    baseline: {
      windowDays: 28,
      validDays: 28,
      usedDays: 28,
      restingHr: { mean: 50, std: 2, lower: 46, upper: 54, sampleDays: 28 },
      hrv: { mean: 70, std: 6, lower: 58, upper: 82, sampleDays: 28 },
      sleepScore: { mean: 82, std: 8, lower: 66, upper: 98, sampleDays: 28 },
      sleepInterruptions: { mean: 2, std: 1, lower: 0, upper: 4, sampleDays: 28 },
      stress: { mean: 20, std: 5, lower: 10, upper: 30, sampleDays: 28 },
    },
    today: {
      date: "2026-06-11",
      restingHr: 51,
      hrv: 68,
      sleepScore: 79,
      sleepDurationHours: 7.2,
      deepSleepHours: 1.5,
      remSleepHours: 1.6,
      sleepInterruptions: 2,
      stress: 22,
      respiration: 14,
      bodyBatteryHigh: 86,
      bodyBatteryLow: 32,
      sedentaryMinutes: 480,
      weight: 70.5,
      vo2Max: 52,
      lactateThresholdHr: 168,
      acuteTrainingLoad: 105,
      chronicTrainingLoad: 100,
      loadRatio: 1.05,
      recoveryHours: 6,
    },
    abnormalities: {
      restingHr: { value: 51, baseline: 50, delta: 1, deltaPct: 2, lower: 46, upper: 54, level: "normal" },
      hrv: { value: 68, baseline: 70, delta: -2, deltaPct: -2.9, lower: 58, upper: 82, level: "normal" },
      sleepScore: { value: 79, baseline: 82, delta: -3, deltaPct: -3.7, lower: 66, upper: 98, level: "normal" },
      sleepInterruptions: { value: 2, baseline: 2, delta: 0, deltaPct: 0, lower: 0, upper: 4, level: "normal" },
      stress: { value: 22, baseline: 20, delta: 2, deltaPct: 10, lower: 10, upper: 30, level: "normal" },
    },
    fatigue: {
      componentScores: { hrv: 10, sleep: 10, restingHr: 5, loadRatio: 5, stress: 5 },
      totalScore: 35,
      level: "恢复良好",
    },
    load: {
      acuteTrainingLoad: 105,
      chronicTrainingLoad: 100,
      loadRatio: 1.05,
      loadStatus: "balanced",
      source: "garmin",
      recent7dDurationMin: 180,
      recent42dAvgWeekDurationMin: 210,
      avgTrainingLoad7d: 90,
      avgAerobicEffect7d: 2.4,
      avgAnaerobicEffect7d: 0.4,
    },
    activity: {
      sessions7d: 2,
      daysSinceLastSession: 1,
      consecutiveRestDays: 1,
      toneHint: "supportive",
      latestSession: {
        date: "2026-06-10",
        startedAt: "2026-06-10T07:00:00.000+08:00",
        endedAt: null,
        type: "cycling",
        name: "Cycling",
        durationMin: 60,
        distanceKm: 24,
        averageHeartRate: 138,
        maxHeartRate: 166,
        aerobicTrainingEffect: 2.5,
        anaerobicTrainingEffect: 0.3,
        trainingLoad: 88,
        recoveryHours: 6,
      },
    },
    recovery: {
      recoveryHours: 6,
      readyAt: "2026-06-11T14:00:00.000+08:00",
      lastHighIntensityDate: "2026-06-09",
      hoursToBaseline: 6,
      recoveryCapacity: "normal",
    },
    weeklyAssessment: {
      weekStart: "2026-06-08",
      weekEnd: "2026-06-14",
      progressDay: 4,
      load: {
        focus: "duration",
        duration: {
          actual: 180,
          recent4WeekSameProgressAverage: 160,
          expectedToDate: 170,
          projectedWeekTotal: 315,
          monthWeeklyAverage: 210,
          sameProgressRatio: 1.13,
          weeklyAverageRatio: 1.5,
        },
        distance: {
          actual: 70,
          recent4WeekSameProgressAverage: 65,
          expectedToDate: 68,
          projectedWeekTotal: 122.5,
          monthWeeklyAverage: 90,
          sameProgressRatio: 1.08,
          weeklyAverageRatio: 1.36,
        },
        totals: { sessions: 2, durationMin: 180, distanceKm: 70 },
      },
      intensity: {
        source: "full",
        trainingLoad: {
          actual: 180,
          recent4WeekSameProgressAverage: 170,
          expectedToDate: 160,
          projectedWeekTotal: 315,
          monthWeeklyAverage: 230,
          sameProgressRatio: 1.06,
          weeklyAverageRatio: 1.37,
        },
        vigorousIntensityMinutes: {
          actual: 12,
          recent4WeekSameProgressAverage: 10,
          expectedToDate: 9,
          projectedWeekTotal: 21,
          monthWeeklyAverage: 18,
          sameProgressRatio: 1.2,
          weeklyAverageRatio: 1.17,
        },
      },
      overall: {
        loadConclusion: "合理",
        intensityConclusion: "合理",
        overallConclusion: "训练合理",
        ruleReason: "本周训练量和强度都在合理区间。",
      },
      habit: {
        pattern: "分布均衡",
        weekdaySessions4w: 6,
        weekendSessions4w: 4,
        lowLoadWeekday: false,
      },
      recoverySignals: ["恢复良好"],
    },
    decision: {
      shouldTrain: "可训",
      todayAdvice: "耐力骑行 45-60 分钟",
      ruleReason: "恢复良好且负荷均衡。",
      workoutSuggestion: {
        label: "耐力骑行",
        intensity: "Zone 2",
        durationMin: { min: 45, max: 60 },
        summary: "保持轻松可持续输出。",
      },
    },
    missingData: [],
  },
  analysis: {
    shouldTrain: "可训",
    todayAdvice: "耐力骑行 45-60 分钟",
    reasonAnalysis: "恢复良好，ATL/CTL 在安全范围。",
    weeklyLoadAssessment: {
      loadConclusion: "合理",
      intensityConclusion: "合理",
      overallConclusion: "训练合理",
      advice: "继续保持分布均衡。",
      reasonAnalysis: "本周训练量与强度接近最近四周水平。",
    },
  },
}

test("builds a Coze-friendly daily report payload and message", () => {
  const report = buildCozeDailyReport(payload)

  assert.equal(report.date, "2026-06-11")
  assert.equal(report.shouldTrain, "可训")
  assert.equal(report.pushText.includes("耐力骑行 45-60 分钟"), true)
  assert.equal(report.markdown.includes("## Garmin AI Coach 每日报告"), true)
  assert.deepEqual(report.metrics, {
    sleepScore: 79,
    hrv: 68,
    restingHr: 51,
    stress: 22,
    bodyBatteryHigh: 86,
    bodyBatteryLow: 32,
    loadRatio: 1.05,
    recoveryHours: 6,
  })
})
