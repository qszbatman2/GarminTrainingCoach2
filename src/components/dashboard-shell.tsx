'use client'

import Link from "next/link"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
import { AppPage, PageHero, SurfaceCard, SubtleCard } from "@/components/design-system"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

type MetricSnapshot = {
  id: string
  date: string
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw: unknown
}

type DashboardShellProps = {
  userName: string
  userEmail: string
  garminEmail: string
  metrics: MetricSnapshot[]
  initialAnalysisReport: TrainingAnalysisPayload | null
}

export function DashboardShell({
  userName,
  userEmail,
  garminEmail,
  metrics,
  initialAnalysisReport,
}: DashboardShellProps) {
  const router = useRouter()
  const [bindingEmail, setBindingEmail] = useState(garminEmail)
  const [bindingPassword, setBindingPassword] = useState("")
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split("T")[0])
  const [bindingLoading, setBindingLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [bindingMessage, setBindingMessage] = useState("")
  const [syncResult, setSyncResult] = useState("")

  const hasGarminBinding = garminEmail.trim().length > 0

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

  async function handleSync(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSyncLoading(true)
    setSyncResult("")

    try {
      const response = await fetch("/api/garmin-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: syncDate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "同步失败")
      }

      setSyncResult(`同步完成：写入 1 条每日快照，活动 ${data.activitiesCount} 条。`)
      router.refresh()
    } catch (error: unknown) {
      setSyncResult(error instanceof Error ? error.message : "同步失败")
    } finally {
      setSyncLoading(false)
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
        description={`当前登录账号：${userEmail}。${
          hasGarminBinding
            ? ` 已绑定 Garmin 账号 ${garminEmail}，关键数据、趋势和活动明细已收进独立页面，首页只看 AI 报告。`
            : " 完成绑定后，系统才会开始同步 Daily 与活动数据，并生成 AI 分析和趋势洞察。"
        }`}
        eyebrow="Training Dashboard"
        title={hasGarminBinding ? `${userName}，首页聚焦 AI 训练结论。` : `${userName}，先完成 Garmin 绑定，再解锁训练驾驶舱。`}
      />

        {!hasGarminBinding ? (
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <SurfaceCard className="p-7">
              <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Binding Flow</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">先绑定 Garmin，再进入 AI 分析闭环</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  { title: "1. 保存账号", detail: "保存 Garmin 邮箱和密码，后续同步复用已绑定凭证。" },
                  { title: "2. 拉取首批数据", detail: "绑定完成后去同步页触发首日同步或最近 30 天补拉。" },
                  { title: "3. 查看分析", detail: "系统会把 Daily、活动和 AI 结论整理成首页与数据分析页。" },
                ].map((item) => (
                  <SubtleCard className="min-h-[160px]" key={item.title}>
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                  </SubtleCard>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">绑定 Garmin 账号</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">未绑定前，首页只保留绑定入口，避免把空数据和操作状态混在一起。</p>
                </div>
                <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">第一步</span>
              </div>

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

                {bindingMessage ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{bindingMessage}</div>
                ) : null}

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
          <>
            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <SurfaceCard className="p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80">AI Focus</div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">首页主信息改为只看 AI 结论与训练建议。</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                      关键数据卡、趋势图和活动摘要不再出现在首页，避免和 AI 报告争抢注意力；详细数据统一放到数据分析页查看。
                    </p>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard className="p-7">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Actions</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">同步入口与页面跳转</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">把同步、补拉和任务状态抽离到独立页面，首页只保留高频动作。</p>

                <form className="mt-6 space-y-4" onSubmit={handleSync}>
                  <div>
                    <label className="mb-2 block text-sm text-slate-400">同步日期</label>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                      onChange={(event) => setSyncDate(event.target.value)}
                      required
                      type="date"
                      value={syncDate}
                    />
                  </div>

                  {syncResult ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{syncResult}</div> : null}

                  <button
                    className="w-full rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={syncLoading}
                    type="submit"
                  >
                    {syncLoading ? "同步中..." : "同步指定日期"}
                  </button>
                </form>

                <div className="mt-4 grid gap-3">
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
                <h2 className="text-2xl font-semibold tracking-tight text-white">账号已绑定，下一步同步首份数据</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  当前还没有 Daily 快照和活动记录，所以首页暂时无法生成 AI 分析与趋势。先同步一个日期，或去同步状态页发起最近 30 天补拉。
                </p>
              </section>
            ) : null}

            {metrics.length > 0 ? <AITrainingReport initialReport={initialAnalysisReport} /> : null}
          </>
        ) : null}
    </AppPage>
  )
}
