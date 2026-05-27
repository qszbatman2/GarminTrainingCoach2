'use client'

import { useEffect, useMemo, useState } from "react"

import { AccentPill, SubtleCard, SurfaceCard } from "@/components/design-system"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

type ApiResult = {
  ok: boolean
} & TrainingAnalysisPayload

function statusTone(value: TrainingAnalysisPayload["analysis"]["shouldTrain"]) {
  switch (value) {
    case "可训":
      return "emerald"
    case "慎训":
      return "amber"
    case "不训":
      return "rose"
    default:
      return "neutral"
  }
}

function weeklyTone(value: TrainingAnalysisPayload["analysis"]["weeklyLoadAssessment"]["overallConclusion"]) {
  switch (value) {
    case "训练合理":
      return "emerald"
    case "训练偏多":
      return "amber"
    case "过度风险":
      return "rose"
    case "训练不足":
      return "cyan"
    default:
      return "neutral"
  }
}

function formatTime(value?: string) {
  if (!value) {
    return "--"
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  })
}

function formatCountdown(targetTime: string, now: number) {
  const diffMs = new Date(targetTime).getTime() - now
  if (diffMs <= 0) {
    return "现在可以开始训练"
  }

  const totalMinutes = Math.ceil(diffMs / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分钟`
  }
  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`
  }
  return `${minutes}分钟`
}

function recoveryTone(value: number) {
  return value <= 0 ? "emerald" : value <= 6 * 60 * 60 * 1000 ? "amber" : "violet"
}

export function AITrainingReport({
  initialReport,
  trainingGoal,
}: {
  initialReport: TrainingAnalysisPayload | null
  trainingGoal: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ApiResult | null>(initialReport ? { ok: true, ...initialReport } : null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const recoverySummary = useMemo(() => {
    if (!result?.context.activity.latestSession || !result.context.recovery.readyAt || result.context.recovery.recoveryHours == null) {
      return null
    }

    const latestSession = result.context.activity.latestSession
    const readyAt = result.context.recovery.readyAt
    const remainingMs = new Date(readyAt).getTime() - now

    return {
      latestSession,
      readyAt,
      remainingMs,
      countdownLabel: formatCountdown(readyAt, now),
      tone: recoveryTone(remainingMs),
      statusLabel: remainingMs <= 0 ? "可开始训练" : "恢复中",
    }
  }, [now, result])

  async function handleGenerate(forceRefresh = true) {
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/analysis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      })
      const data = (await response.json()) as ApiResult | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data && typeof data.error === "string" ? data.error : "生成训练分析失败")
      }

      setResult(data as ApiResult)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成训练分析失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <SurfaceCard className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">AI Coach</div>
            {trainingGoal ? <AccentPill tone="violet">已结合训练目标</AccentPill> : null}
          </div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">今日训练结论</h2>
          <p className="mt-2 text-sm text-slate-300">首屏先回答今天能不能练，详细数据放后面。</p>
        </div>
        <button
          className="rounded-full bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={() => handleGenerate(true)}
          type="button"
        >
          {loading ? "生成中..." : result ? "重新生成 AI 报告" : "生成首份 AI 报告"}
        </button>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      {result ? (
        <div className="mt-5">
          <SubtleCard className="border-violet-400/15 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(15,23,42,0.3))] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-semibold text-white">AI 判断</div>
                <AccentPill tone={statusTone(result.analysis.shouldTrain)}>{result.analysis.shouldTrain}</AccentPill>
              </div>
              <div className="text-xs text-slate-300">更新于 {formatTime(result.updatedAt)}</div>
            </div>

            {recoverySummary ? (
              <div className="mt-5 rounded-[1.4rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),rgba(15,23,42,0.08)_42%,rgba(15,23,42,0.24)_100%)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Recovery Timer</div>
                      <AccentPill tone={recoverySummary.tone}>{recoverySummary.statusLabel}</AccentPill>
                    </div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{recoverySummary.countdownLabel}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      上一次训练是 {recoverySummary.latestSession.name}。倒计时基于最近一堂训练的恢复窗口估算，不覆盖今日 AI 训练结论。
                    </p>
                  </div>
                  <div className="rounded-[1.1rem] border border-white/10 bg-black/15 px-4 py-3 text-right">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">估算恢复</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{result.context.recovery.recoveryHours}h</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">上次结束</div>
                    <div className="mt-2 text-sm font-medium text-white">{formatTime(recoverySummary.latestSession.endedAt ?? recoverySummary.latestSession.startedAt)}</div>
                  </div>
                  <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">可开始时间</div>
                    <div className="mt-2 text-sm font-medium text-white">{formatTime(recoverySummary.readyAt)}</div>
                  </div>
                  <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">最近训练</div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {recoverySummary.latestSession.durationMin ?? "--"} 分钟
                      {recoverySummary.latestSession.distanceKm != null ? ` / ${recoverySummary.latestSession.distanceKm} km` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-sm text-slate-300">今日建议</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{result.analysis.todayAdvice}</div>
                <p className="mt-3 text-sm leading-6 text-slate-200">{result.analysis.reasonAnalysis}</p>
              </div>

              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">本周训练量评估</div>
                  <AccentPill tone={weeklyTone(result.analysis.weeklyLoadAssessment.overallConclusion)}>
                    {result.analysis.weeklyLoadAssessment.overallConclusion}
                  </AccentPill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AccentPill tone="neutral">训练量 {result.analysis.weeklyLoadAssessment.loadConclusion}</AccentPill>
                  <AccentPill tone="neutral">强度 {result.analysis.weeklyLoadAssessment.intensityConclusion}</AccentPill>
                </div>
                <div className="mt-4 text-lg font-semibold tracking-tight text-white">{result.analysis.weeklyLoadAssessment.advice}</div>
                <p className="mt-3 text-sm leading-6 text-slate-200">{result.analysis.weeklyLoadAssessment.reasonAnalysis}</p>
              </div>
            </div>
          </SubtleCard>
        </div>
      ) : (
        <SubtleCard className="mt-5 p-5">
          <div className="text-sm text-slate-400">当前还没有 AI 报告</div>
          <div className="mt-2 text-xl font-semibold text-white">先生成首份建议，再决定今天怎么练。</div>
        </SubtleCard>
      )}
    </SurfaceCard>
  )
}
