import assert from "node:assert/strict"
import test from "node:test"

import { buildTrainingAnalysisMessages } from "./training-prompt.ts"
import { buildTrainingContext, type ActivityInput, type DailyMetricInput } from "./training-analysis.ts"

function shanghaiDate(dateKey: string, time = "12:00:00") {
  return new Date(`${dateKey}T${time}+08:00`)
}

function createMetric(
  dateKey: string,
  overrides: Partial<DailyMetricInput> & {
    acuteTrainingLoad?: number
    chronicTrainingLoad?: number
    sleepInterruptions?: number
  } = {}
): DailyMetricInput {
  const {
    acuteTrainingLoad = 100,
    chronicTrainingLoad = 100,
    sleepInterruptions = 2,
    raw,
    ...rest
  } = overrides

  return {
    id: `metric-${dateKey}`,
    date: shanghaiDate(dateKey),
    sleepScore: 82,
    hrv: 72,
    restingHr: 50,
    stress: 18,
    raw: raw ?? {
      training_status_aggregated: {
        acuteTrainingLoad,
        chronicTrainingLoad,
      },
      sleep: {
        dailySleepDTO: {
          awakeCount: sleepInterruptions,
          sleepTimeSeconds: 7.5 * 3600,
          deepSleepSeconds: 1.8 * 3600,
          remSleepSeconds: 1.6 * 3600,
        },
      },
    },
    ...rest,
  }
}

function createRide(
  dateKey: string,
  overrides: Partial<ActivityInput> & {
    durationMin?: number
    distanceKm?: number
    trainingLoad?: number
    aerobicTrainingEffect?: number
    anaerobicTrainingEffect?: number
    moderateIntensityMinutes?: number
    vigorousIntensityMinutes?: number
    startTimeLocal?: string
  } = {}
): ActivityInput {
  const {
    durationMin = 90,
    distanceKm = 35,
    trainingLoad = 110,
    aerobicTrainingEffect = 2.8,
    anaerobicTrainingEffect = 0.6,
    moderateIntensityMinutes = 55,
    vigorousIntensityMinutes = 0,
    startTimeLocal = `${dateKey}T07:00:00`,
    raw,
    ...rest
  } = overrides

  return {
    id: `activity-${dateKey}-${durationMin}`,
    name: "Cycling",
    type: "cycling",
    distance: Math.round(distanceKm * 1000),
    duration: durationMin * 60,
    date: shanghaiDate(dateKey, "07:00:00"),
    raw: raw ?? {
      startTimeLocal,
      summaryDTO: {
        startTimeLocal,
        aerobicTrainingEffect,
        anaerobicTrainingEffect,
        exerciseTrainingLoad: trainingLoad,
        moderateIntensityMinutes,
        vigorousIntensityMinutes,
      },
    },
    ...rest,
  }
}

function createMetricSeries(startDate: string, days: number, latestOverrides: Parameters<typeof createMetric>[1] = {}) {
  const metrics: DailyMetricInput[] = []
  const start = shanghaiDate(startDate)

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    const dateKey = date.toISOString().slice(0, 10)
    metrics.push(createMetric(dateKey, index === days - 1 ? latestOverrides : {}))
  }

  return metrics
}

test("weekend-heavy athletes are not hard-pushed on their usual low-load weekday", () => {
  const metrics = createMetricSeries("2026-05-13", 29)
  const activities: ActivityInput[] = [
    createRide("2026-05-16", { durationMin: 70, distanceKm: 28 }),
    createRide("2026-05-17", { durationMin: 80, distanceKm: 32 }),
    createRide("2026-05-23", { durationMin: 75, distanceKm: 30 }),
    createRide("2026-05-24", { durationMin: 85, distanceKm: 34 }),
    createRide("2026-05-30", { durationMin: 72, distanceKm: 29 }),
    createRide("2026-05-31", { durationMin: 88, distanceKm: 35 }),
    createRide("2026-06-06", { durationMin: 78, distanceKm: 31 }),
    createRide("2026-06-07", { durationMin: 82, distanceKm: 33 }),
  ]

  const context = buildTrainingContext(metrics, activities, "提升骑行耐力")

  assert.equal(context.activity.consecutiveRestDays >= 3, true)
  assert.equal(context.activity.toneHint, "supportive")
  assert.match(context.weeklyAssessment.habit.pattern, /周末集中|分布均衡/)
  assert.doesNotMatch(context.decision.todayAdvice, /别再拖|必须恢复正常训练节奏|按计划完成训练/)
})

test("today advice includes a concrete workout suggestion from goal, fatigue and habits", () => {
  const metrics = createMetricSeries("2026-05-13", 29, {
    sleepScore: 88,
    hrv: 78,
    restingHr: 48,
    stress: 12,
    acuteTrainingLoad: 102,
    chronicTrainingLoad: 100,
  })
  const activities: ActivityInput[] = [
    createRide("2026-05-20", { durationMin: 75, distanceKm: 33, trainingLoad: 120, aerobicTrainingEffect: 3.1 }),
    createRide("2026-05-27", { durationMin: 80, distanceKm: 35, trainingLoad: 128, aerobicTrainingEffect: 3.2 }),
    createRide("2026-06-03", { durationMin: 78, distanceKm: 34, trainingLoad: 126, aerobicTrainingEffect: 3.2 }),
    createRide("2026-06-09", { durationMin: 45, distanceKm: 18, trainingLoad: 65, aerobicTrainingEffect: 1.8 }),
  ]

  const context = buildTrainingContext(metrics, activities, "提升 FTP 和爬坡能力")

  assert.equal(context.decision.shouldTrain, "可训")
  assert.equal(typeof context.decision.workoutSuggestion?.durationMin?.min, "number")
  assert.equal(typeof context.decision.workoutSuggestion?.durationMin?.max, "number")
  assert.match(context.decision.workoutSuggestion?.intensity ?? "", /阈值|甜点|节奏|耐力/)
  assert.match(context.decision.todayAdvice, /(分钟|小时)/)
})

test("prompt enforces unified weekly labels and concrete training prescriptions", () => {
  const metrics = createMetricSeries("2026-05-13", 29)
  const context = buildTrainingContext(metrics, [], "完成 200km 骑行")
  const messages = buildTrainingAnalysisMessages({ context, trainingGoal: "完成 200km 骑行" })
  const combined = messages.map((message) => message.content).join("\n")

  assert.match(combined, /统一使用“训练不足、训练合理、训练偏多、过度风险”/)
  assert.match(combined, /禁止使用“进度偏慢|进度偏快/)
  assert.match(combined, /必须明确给出今天建议的训练强度和时长/)
})
