'use client'

import { useState } from "react"

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

function formatTime(value?: string) {
  if (!value) {
    return "--"
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  })
}

export function AITrainingReport({ initialReport }: { initialReport: TrainingAnalysisPayload | null }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ApiResult | null>(initialReport ? { ok: true, ...initialReport } : null)

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
    <SurfaceCard className="p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">AI Coach</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">今日训练建议</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">先看今天能不能练，再看一句建议和简短依据。</p>
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
        <div className="mt-6 space-y-5">
          <SubtleCard className="border-violet-400/15 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(15,23,42,0.3))] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-semibold text-white">AI 判断</div>
                <AccentPill tone={statusTone(result.analysis.shouldTrain)}>{result.analysis.shouldTrain}</AccentPill>
              </div>
              <div className="text-xs text-slate-300">更新于 {formatTime(result.updatedAt)}</div>
            </div>
            <div className="mt-5 text-sm text-slate-300">今日建议</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{result.analysis.todayAdvice}</div>
            <p className="mt-4 text-sm leading-7 text-slate-200">{result.analysis.reasonAnalysis}</p>
          </SubtleCard>
        </div>
      ) : (
        <SubtleCard className="mt-6 p-6">
          <div className="text-sm text-slate-400">当前还没有 AI 报告</div>
          <div className="mt-2 text-xl font-semibold text-white">先生成首份建议，再决定今天怎么练。</div>
        </SubtleCard>
      )}
    </SurfaceCard>
  )
}
