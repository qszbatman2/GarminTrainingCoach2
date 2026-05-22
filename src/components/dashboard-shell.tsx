'use client'

import Link from "next/link"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AITrainingReport } from "@/components/ai-training-report"
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#08101d_0%,#0d1526_34%,#eef2f8_34%,#f5f7fb_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(95,230,255,0.22),_transparent_30%),linear-gradient(135deg,#0f1a2e,#0b1018)] p-8 text-white shadow-[0_20px_80px_rgba(8,16,29,0.35)]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Training Dashboard</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl">
                {hasGarminBinding ? `${userName}，首页现在只保留 AI 报告。` : `${userName}，先完成 Garmin 绑定，再解锁你的训练分析首页。`}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                当前登录账号：{userEmail}。
                {hasGarminBinding
                  ? ` 已绑定 Garmin 账号 ${garminEmail}，关键数据、趋势和活动明细已收进独立页面，首页只看 AI 报告。`
                  : " 完成绑定后，系统才会开始同步 Daily 与活动数据，并生成 AI 分析和趋势洞察。"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {hasGarminBinding ? (
                <>
                  <Link
                    className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-300/20"
                    href="/data"
                  >
                    查看数据分析
                  </Link>
                  <Link
                    className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                    href="/data/sync"
                  >
                    查看同步状态
                  </Link>
                </>
              ) : null}
              <button
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                onClick={() => signOut({ callbackUrl: "/" })}
                type="button"
              >
                退出登录
              </button>
            </div>
          </div>
        </section>

        {!hasGarminBinding ? (
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="text-xs uppercase tracking-[0.25em] text-cyan-700">Binding Flow</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">先绑定 Garmin，再进入 AI 分析闭环</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  { title: "1. 保存账号", detail: "保存 Garmin 邮箱和密码，后续同步复用已绑定凭证。" },
                  { title: "2. 拉取首批数据", detail: "绑定完成后去同步页触发首日同步或最近 30 天补拉。" },
                  { title: "3. 查看分析", detail: "系统会把 Daily、活动和 AI 结论整理成首页与数据分析页。" },
                ].map((item) => (
                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5" key={item.title}>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">绑定 Garmin 账号</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">未绑定前，首页只保留绑定入口，避免把空数据和操作状态混在一起。</p>
                </div>
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">第一步</span>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSaveBinding}>
                <div>
                  <label className="mb-2 block text-sm text-slate-500">Garmin 邮箱</label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                    onChange={(event) => setBindingEmail(event.target.value)}
                    placeholder="you@garmin.com"
                    required
                    type="email"
                    value={bindingEmail}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-500">Garmin 密码</label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                    onChange={(event) => setBindingPassword(event.target.value)}
                    placeholder="输入 Garmin 密码"
                    required
                    type="password"
                    value={bindingPassword}
                  />
                </div>

                {bindingMessage ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{bindingMessage}</div>
                ) : null}

                <button
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={bindingLoading}
                  type="submit"
                >
                  {bindingLoading ? "保存中..." : "保存 Garmin 绑定"}
                </button>
              </form>
            </article>
          </section>
        ) : null}

        {hasGarminBinding ? (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-violet-600">AI Focus</div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">首页主信息改为只看 AI 结论与训练建议。</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                      关键数据卡、趋势图和活动摘要不再出现在首页，避免和 AI 报告争抢注意力；详细数据统一放到数据分析页查看。
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Actions</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">同步入口与页面跳转</h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">把同步、补拉和任务状态抽离到独立页面，首页只保留高频动作。</p>

                <form className="mt-6 space-y-4" onSubmit={handleSync}>
                  <div>
                    <label className="mb-2 block text-sm text-slate-500">同步日期</label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                      onChange={(event) => setSyncDate(event.target.value)}
                      required
                      type="date"
                      value={syncDate}
                    />
                  </div>

                  {syncResult ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{syncResult}</div> : null}

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
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    href="/data"
                  >
                    进入数据分析页
                  </Link>
                  <Link
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    href="/data/sync"
                  >
                    进入同步状态页
                  </Link>
                </div>
              </article>
            </section>

            {metrics.length === 0 ? (
              <section className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)]">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">账号已绑定，下一步同步首份数据</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">
                  当前还没有 Daily 快照和活动记录，所以首页暂时无法生成 AI 分析与趋势。先同步一个日期，或去同步状态页发起最近 30 天补拉。
                </p>
              </section>
            ) : null}

            {metrics.length > 0 ? <AITrainingReport initialReport={initialAnalysisReport} /> : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
