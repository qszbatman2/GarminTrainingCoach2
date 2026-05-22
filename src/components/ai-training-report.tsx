'use client'

import { useState } from "react"

import type { TrainingAnalysisPayload, TrainingAnalysisResult } from "@/lib/training-analysis"

type ApiResult = {
  ok: boolean
} & TrainingAnalysisPayload

function statusTone(value: TrainingAnalysisResult["riskLevel"] | TrainingAnalysisResult["recoveryStatus"] | TrainingAnalysisResult["loadStatus"]) {
  switch (value) {
    case "good":
    case "balanced":
    case "low":
      return "bg-emerald-50 text-emerald-700"
    case "moderate":
    case "medium":
      return "bg-amber-50 text-amber-700"
    case "poor":
    case "high":
      return "bg-rose-50 text-rose-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

function LabelList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-600" key={item}>
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
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600" key={item}>
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
    <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-violet-600">AI Training Analysis</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">基于 Garmin 全量数据生成训练建议</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
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

      {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mt-4 text-sm text-slate-500">最近更新时间：{formatTime(result?.updatedAt)}</div>

      {result ? (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-sm text-slate-500">恢复状态</div>
              <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusTone(result.analysis.recoveryStatus)}`}>
                {result.analysis.recoveryStatus}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-sm text-slate-500">负荷状态</div>
              <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusTone(result.analysis.loadStatus)}`}>
                {result.analysis.loadStatus}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-sm text-slate-500">风险等级</div>
              <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusTone(result.analysis.riskLevel)}`}>
                {result.analysis.riskLevel}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-sm text-slate-500">分析窗口</div>
              <div className="mt-3 text-lg font-semibold text-slate-900">
                {result.context.dateRange.metricStart ?? "--"} 至 {result.context.dateRange.metricEnd ?? "--"}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                {result.context.athleteProfile.totalMetricDays} 天指标，{result.context.athleteProfile.totalActivities} 条活动
              </div>
            </div>
          </div>

          <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-6">
            <div className="text-sm font-semibold text-slate-900">AI 总结</div>
            <p className="mt-3 text-sm leading-7 text-slate-600">{result.analysis.summary}</p>
          </article>

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
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">最近 7 天睡眠均值</div>
              <div className="mt-2 text-lg font-semibold">{result.context.recovery.sleepScore7dAvg ?? "--"}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">最近 7 天 HRV 均值</div>
              <div className="mt-2 text-lg font-semibold">{result.context.recovery.hrv7dAvg ?? "--"}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">最近 7 天训练时长</div>
              <div className="mt-2 text-lg font-semibold">{result.context.load.duration7dMin} min</div>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">急慢比</div>
              <div className="mt-2 text-lg font-semibold">{result.context.load.acuteChronicRatio ?? "--"}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
