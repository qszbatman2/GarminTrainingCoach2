'use client'

import Link from "next/link"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
import { AppPage, PageHero, SurfaceCard, SubtleCard } from "@/components/design-system"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

type DashboardShellProps = {
  userName: string
  userEmail: string
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
      <PageHero
        actions={
          <>
            {hasGarminBinding ? (
              <>
                <Link className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/12 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-300/20" href="/data">
                  查看数据分析
                </Link>
                <Link className="rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm text-slate-100 transition hover:bg-white/[0.08]" href="/data/sync">
                  查看同步状态
                </Link>
              </>
            ) : null}
            <button
              className="rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm text-slate-100 transition hover:bg-white/[0.08]"
              onClick={() => signOut({ callbackUrl: "/" })}
              type="button"
            >
              退出登录
            </button>
          </>
        }
        description={hasGarminBinding ? "首页只保留今日训练结论，详细数据和同步任务进入二级页处理。" : "先绑定 Garmin，系统才会开始同步 Daily 与活动数据并生成 AI 结论。"}
        eyebrow="Training Dashboard"
        title={hasGarminBinding ? `${userName}，首页聚焦 AI 训练结论。` : `${userName}，先完成 Garmin 绑定，再解锁训练驾驶舱。`}
      />

      <SurfaceCard className="grid gap-8 p-7 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">Goal Brief</div>
          <h2 className="text-3xl font-semibold tracking-tight text-white">先把你的训练目标写清楚，AI 才知道该按什么方向解读本周进度。</h2>
          <p className="max-w-xl text-sm leading-7 text-slate-300">
            这里适合写结果目标和执行策略，例如“减重到 60kg，每周极化训练：高强度 1 次，低强度 3-4 次”。后续生成本周建议时，会同时参考 Garmin 实际数据和这段目标描述。
          </p>
          <div className="flex flex-wrap gap-2">
            {["目标结果", "每周频次", "强度结构"].map((item) => (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200" key={item}>
                {item}
              </span>
            ))}
          </div>
          {savedTrainingGoal ? (
            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 px-4 py-4 text-sm leading-7 text-violet-100">
              当前生效目标：{savedTrainingGoal}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
              还没有保存训练目标，AI 会先只按 Garmin 数据给建议。
            </div>
          )}
        </div>

        <div>
          <form className="space-y-4" onSubmit={handleSaveTrainingGoal}>
            <div>
              <label className="mb-2 block text-sm text-slate-300">文字版训练目标</label>
              <textarea
                className="min-h-40 w-full rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-violet-400/60"
                maxLength={500}
                onChange={(event) => setTrainingGoalDraft(event.target.value)}
                placeholder="例如：减重到 60kg；每周 1 次高强度、3-4 次低强度；优先保证恢复，不连续堆强度。"
                value={trainingGoalDraft}
              />
              <div className="mt-2 text-xs text-slate-400">{trainingGoalDraft.trim().length}/500 字符，可留空保存为仅按数据分析。</div>
            </div>

            {trainingGoalMessage ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{trainingGoalMessage}</div>
            ) : null}

            <button
              className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={trainingGoalLoading}
              type="submit"
            >
              {trainingGoalLoading ? "保存中..." : trainingGoalDraft.trim() ? "保存训练目标" : "清空训练目标"}
            </button>
          </form>
        </div>
      </SurfaceCard>

      {!hasGarminBinding ? (
        <SurfaceCard className="grid gap-8 p-7 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Garmin Bind</div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">先完成账号绑定，再开始同步和生成训练建议。</h2>
            <p className="max-w-xl text-sm leading-7 text-slate-300">这里只做一件事：绑定 Garmin。绑定成功后，下一步直接去同步，再回首页看 AI 建议。</p>
            <div className="flex flex-wrap gap-2">
              {["绑定账号", "同步数据", "查看报告"].map((item) => (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div>
            <form className="mt-6 space-y-4" onSubmit={handleSaveBinding}>
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
          </div>
        </SurfaceCard>
      ) : null}

      {hasGarminBinding ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <AITrainingReport initialReport={initialAnalysisReport} trainingGoal={savedTrainingGoal} />

            <SurfaceCard className="p-7">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Quick Access</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">数据状态</h2>
              <div className="mt-5 space-y-4">
                <SubtleCard>
                  <div className="text-sm text-slate-400">Garmin 账号</div>
                  <div className="mt-2 text-lg font-semibold text-white">{garminEmail}</div>
                </SubtleCard>
                <SubtleCard>
                  <div className="text-sm text-slate-400">最新同步日</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{latestMetricDateLabel}</div>
                  <div className="mt-2 text-sm text-slate-400">{metrics.length > 0 ? `累计 ${metrics.length} 天 Daily` : "还没有可分析数据"}</div>
                </SubtleCard>
              </div>

              <div className="mt-5 grid gap-3">
                <Link
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
                  href="/data"
                >
                  进入数据分析页
                </Link>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
                  href="/data/sync"
                >
                  进入同步状态页
                </Link>
              </div>
            </SurfaceCard>
          </section>

          {metrics.length === 0 ? (
            <section className="rounded-[1.75rem] border border-dashed border-white/12 bg-white/[0.04] px-6 py-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)]">
              <h2 className="text-2xl font-semibold tracking-tight text-white">还没有可生成 AI 的数据</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">先去同步状态页拉取首批数据，再回首页看今日训练建议。</p>
            </section>
          ) : null}
        </>
      ) : null}
    </AppPage>
  )
}
