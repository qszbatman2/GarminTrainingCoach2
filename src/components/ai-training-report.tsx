'use client'

import { useState } from "react"

import { AccentPill, MetricTile, SubtleCard, SurfaceCard } from "@/components/design-system"
import type { TrainingAnalysisPayload, TrainingAnalysisResult } from "@/lib/training-analysis"

type ApiResult = {
  ok: boolean
} & TrainingAnalysisPayload

function statusTone(value: TrainingAnalysisResult["riskLevel"] | TrainingAnalysisResult["recoveryStatus"] | TrainingAnalysisResult["loadStatus"]) {
  switch (value) {
    case "good":
    case "balanced":
    case "low":
      return "emerald"
    case "moderate":
    case "medium":
      return "amber"
    case "poor":
    case "high":
      return "rose"
    default:
      return "neutral"
  }
}

function LabelList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-slate-200" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function TextList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p className="rounded-2xl bg-white/[0.05] px-4 py-3 text-sm leading-6 text-slate-300" key={item}>
            {item}
          </p>
        ))}
      </div>
    </div>
  )
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
          <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">AI Training Analysis</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">基于 Garmin 全量数据生成训练建议</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            页面会优先展示已保存报告；只有检测到数据变化或你手动刷新时，才会重新调用火山引擎生成新建议。
          </p>
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

      <div className="mt-4 text-sm text-slate-400">最近更新时间：{formatTime(result?.updatedAt)}</div>

      {result ? (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <SubtleCard>
              <div className="text-sm text-slate-400">恢复状态</div>
              <div className="mt-3">
                <AccentPill tone={statusTone(result.analysis.recoveryStatus)}>{result.analysis.recoveryStatus}</AccentPill>
              </div>
            </SubtleCard>
            <SubtleCard>
              <div className="text-sm text-slate-400">负荷状态</div>
              <div className="mt-3">
                <AccentPill tone={statusTone(result.analysis.loadStatus)}>{result.analysis.loadStatus}</AccentPill>
              </div>
            </SubtleCard>
            <SubtleCard>
              <div className="text-sm text-slate-400">风险等级</div>
              <div className="mt-3">
                <AccentPill tone={statusTone(result.analysis.riskLevel)}>{result.analysis.riskLevel}</AccentPill>
              </div>
            </SubtleCard>
            <SubtleCard>
              <div className="text-sm text-slate-400">分析窗口</div>
              <div className="mt-3 text-lg font-semibold text-white">
                {result.context.dateRange.metricStart ?? "--"} 至 {result.context.dateRange.metricEnd ?? "--"}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {result.context.athleteProfile.totalMetricDays} 天指标，{result.context.athleteProfile.totalActivities} 条活动
              </div>
            </SubtleCard>
          </div>

          <SubtleCard className="border-violet-400/15 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(15,23,42,0.3))] p-6">
            <div className="text-sm font-semibold text-white">AI 总结</div>
            <p className="mt-3 text-sm leading-7 text-slate-200">{result.analysis.summary}</p>
          </SubtleCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <TextList items={result.analysis.keyFindings} title="关键发现" />
            <TextList items={result.analysis.todayAdvice} title="今天建议" />
            <TextList items={result.analysis.next7DaysAdvice} title="未来 7 天建议" />
            <LabelList items={result.analysis.watchMetrics} title="重点关注指标" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <LabelList items={result.context.athleteProfile.primaryActivityTypes} title="主要活动类型" />
            <LabelList items={result.analysis.missingData} title="缺失数据提醒" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <MetricTile detail="恢复质量观察窗" label="最近 7 天睡眠均值" value={`${result.context.recovery.sleepScore7dAvg ?? "--"}`} />
            <MetricTile detail="自主神经恢复信号" label="最近 7 天 HRV 均值" value={`${result.context.recovery.hrv7dAvg ?? "--"}`} />
            <MetricTile detail="训练负荷窗口" label="最近 7 天训练时长" value={`${result.context.load.duration7dMin} min`} />
            <MetricTile detail="近期训练风险指标" label="急慢比" value={`${result.context.load.acuteChronicRatio ?? "--"}`} />
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  )
}
