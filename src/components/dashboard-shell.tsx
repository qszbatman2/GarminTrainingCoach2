'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
import { RecoveryCountdownCard } from "@/components/recovery-countdown-card"
import { AccentPill, AppPage, SurfaceCard, SubtleCard } from "@/components/design-system"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

type DashboardShellProps = {
  userName: string
  garminEmail: string
  trainingGoal: string
  latestMetricDate: string | null
  initialAnalysisReport: TrainingAnalysisPayload | null
}

export function DashboardShell({
  userName,
  garminEmail,
  trainingGoal,
  latestMetricDate,
  initialAnalysisReport,
}: DashboardShellProps) {
  const router = useRouter()
  const [bindingEmail, setBindingEmail] = useState(garminEmail)
  const [bindingPassword, setBindingPassword] = useState("")
  const [bindingLoading, setBindingLoading] = useState(false)
  const [bindingMessage, setBindingMessage] = useState("")
  const [savedTrainingGoal, setSavedTrainingGoal] = useState(trainingGoal)
  const [trainingGoalDraft, setTrainingGoalDraft] = useState(trainingGoal)
  const [trainingGoalLoading, setTrainingGoalLoading] = useState(false)
  const [trainingGoalMessage, setTrainingGoalMessage] = useState("")
  const [analysisReport, setAnalysisReport] = useState(initialAnalysisReport)

  const hasGarminBinding = garminEmail.trim().length > 0
  const latestMetricDateLabel = latestMetricDate ?? "--"

  async function handleSaveBinding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBindingLoading(true)
    setBindingMessage("")

    try {
      const response = await fetch("/api/garmin-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garminEmail: bindingEmail,
          garminPassword: bindingPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "保存失败")
      }

      setBindingMessage("Garmin 账号已绑定，主页将切换为 AI 报告视图。")
      setBindingPassword("")
      router.refresh()
    } catch (error: unknown) {
      setBindingMessage(error instanceof Error ? error.message : "保存失败")
    } finally {
      setBindingLoading(false)
    }
  }

  async function handleSaveTrainingGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTrainingGoalLoading(true)
    setTrainingGoalMessage("")

    try {
      const response = await fetch("/api/training-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingGoal: trainingGoalDraft,
        }),
      })

      const data = (await response.json()) as { error?: string; trainingGoal?: string }

      if (!response.ok) {
        throw new Error(data.error || "保存训练目标失败")
      }

      const nextTrainingGoal = String(data.trainingGoal ?? "")
      setSavedTrainingGoal(nextTrainingGoal)
      setTrainingGoalDraft(nextTrainingGoal)
      setTrainingGoalMessage(nextTrainingGoal ? "训练目标已保存，重新生成 AI 报告后会按该目标一起分析。" : "训练目标已清空，后续 AI 将只基于 Garmin 数据分析。")
      router.refresh()
    } catch (error: unknown) {
      setTrainingGoalMessage(error instanceof Error ? error.message : "保存训练目标失败")
    } finally {
      setTrainingGoalLoading(false)
    }
  }

  return (
    <AppPage>
      <section className="space-y-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/72">Training Dashboard</div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">{hasGarminBinding ? `${userName}，先看今天怎么练。` : `${userName}，先绑定 Garmin。`}</h1>
          {hasGarminBinding ? (
            latestMetricDate ? (
              <AccentPill tone="emerald">同步至 {latestMetricDateLabel}</AccentPill>
            ) : (
              <AccentPill tone="amber">暂无可分析数据</AccentPill>
            )
          ) : (
            <AccentPill tone="cyan">待绑定</AccentPill>
          )}
          {hasGarminBinding && savedTrainingGoal ? <AccentPill tone="violet">已设置训练目标</AccentPill> : null}
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-300">
          {hasGarminBinding ? "首页只保留训练决策、恢复倒计时和目标设置，账号与导航统一收进顶部 Topbar。" : "先写训练目标，再完成 Garmin 绑定，后续首页只展示真正影响训练决策的内容。"}
        </p>
      </section>

      {!hasGarminBinding ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">Training Goal</div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">先写目标，后续 AI 会按这个口径解释数据。</h2>
              </div>
              <AccentPill tone={savedTrainingGoal ? "violet" : "neutral"}>{savedTrainingGoal ? "已生效" : "未设置"}</AccentPill>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleSaveTrainingGoal}>
              <textarea
                className="min-h-32 w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-violet-400/60"
                maxLength={500}
                onChange={(event) => setTrainingGoalDraft(event.target.value)}
                placeholder="例如：减重到 60kg；每周 1 次高强度、3-4 次低强度；优先保证恢复。"
                value={trainingGoalDraft}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <span>{trainingGoalDraft.trim().length}/500</span>
                <button
                  className="rounded-2xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={trainingGoalLoading}
                  type="submit"
                >
                  {trainingGoalLoading ? "保存中..." : trainingGoalDraft.trim() ? "保存目标" : "清空目标"}
                </button>
              </div>
              {trainingGoalMessage ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{trainingGoalMessage}</div>
              ) : null}
            </form>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Garmin Bind</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">绑定账号后再同步和生成报告。</h2>

            <form className="mt-5 space-y-4" onSubmit={handleSaveBinding}>
              <div>
                <label className="mb-2 block text-sm text-slate-400">Garmin 邮箱</label>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
                  onChange={(event) => setBindingEmail(event.target.value)}
                  placeholder="you@garmin.com"
                  required
                  type="email"
                  value={bindingEmail}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-400">Garmin 密码</label>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
                  onChange={(event) => setBindingPassword(event.target.value)}
                  placeholder="输入 Garmin 密码"
                  required
                  type="password"
                  value={bindingPassword}
                />
              </div>

              {bindingMessage ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{bindingMessage}</div> : null}

              <button
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={bindingLoading}
                type="submit"
              >
                {bindingLoading ? "保存中..." : "保存 Garmin 绑定"}
              </button>
            </form>
          </SurfaceCard>
        </section>
      ) : null}

      {hasGarminBinding ? (
        <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
          <AITrainingReport initialReport={analysisReport} onReportChange={setAnalysisReport} trainingGoal={savedTrainingGoal} />

          <div className="grid gap-6 content-start">
            <RecoveryCountdownCard className="max-w-none" report={analysisReport} title="Ready To Train" />
            <SurfaceCard className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">Training Goal</div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">目标放在主决策旁边，改完后直接重生成。</h2>
                </div>
                <AccentPill tone={savedTrainingGoal ? "violet" : "neutral"}>{savedTrainingGoal ? "已生效" : "未设置"}</AccentPill>
              </div>

              <form className="mt-5 space-y-3" onSubmit={handleSaveTrainingGoal}>
                <textarea
                  className="min-h-32 w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-violet-400/60"
                  maxLength={500}
                  onChange={(event) => setTrainingGoalDraft(event.target.value)}
                  placeholder="例如：减重到 60kg；每周 1 次高强度、3-4 次低强度；优先保证恢复。"
                  value={trainingGoalDraft}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <span>{trainingGoalDraft.trim().length}/500</span>
                  <button
                    className="rounded-2xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={trainingGoalLoading}
                    type="submit"
                  >
                    {trainingGoalLoading ? "保存中..." : trainingGoalDraft.trim() ? "保存目标" : "清空目标"}
                  </button>
                </div>
                {trainingGoalMessage ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{trainingGoalMessage}</div>
                ) : null}
              </form>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Control Center</div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">同步与入口</h2>
                </div>
                <AccentPill tone={latestMetricDate ? "emerald" : "amber"}>{latestMetricDate ? "可分析" : "待同步"}</AccentPill>
              </div>

              <div className="mt-5 grid gap-3">
                <SubtleCard className="p-4">
                  <div className="text-sm text-slate-400">Garmin 账号</div>
                  <div className="mt-2 break-all text-base font-semibold text-white">{garminEmail}</div>
                </SubtleCard>
                <SubtleCard className="p-4">
                  <div className="text-sm text-slate-400">最新同步日</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{latestMetricDateLabel}</div>
                  <div className="mt-1 text-sm text-slate-400">{latestMetricDate ? "最近一日 Daily 已同步" : "先去同步页拉取首批数据"}</div>
                </SubtleCard>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link className="rounded-[1.1rem] border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15" href="/data">
                    进入数据页
                  </Link>
                  <Link className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]" href="/data/sync">
                    查看同步页
                  </Link>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </section>
      ) : null}
    </AppPage>
  )
}
