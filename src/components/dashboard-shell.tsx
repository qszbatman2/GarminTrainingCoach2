'use client'

import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

type MetricSnapshot = {
  date: string
  sleepScore: number | null
  hrv: number | null
  restingHr: number | null
  stress: number | null
  raw?: unknown
}

type ActivitySnapshot = {
  id: string
  name: string
  type: string
  distance: number | null
  duration: number | null
  date: string
  raw?: unknown
}

type DashboardShellProps = {
  userName: string
  userEmail: string
  garminEmail: string
  latestMetric: MetricSnapshot | null
  activities: ActivitySnapshot[]
}

function formatDistance(distance: number | null) {
  if (!distance) {
    return "--"
  }

  return `${(distance / 1000).toFixed(1)} km`
}

function formatDuration(duration: number | null) {
  if (!duration) {
    return "--"
  }

  const totalMinutes = Math.round(duration / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes} min`
  }

  return `${hours}h ${minutes}m`
}

export function DashboardShell({
  userName,
  userEmail,
  garminEmail,
  latestMetric,
  activities,
}: DashboardShellProps) {
  const router = useRouter()
  const [bindingEmail, setBindingEmail] = useState(garminEmail)
  const [bindingPassword, setBindingPassword] = useState("")
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split("T")[0])
  const [bindingLoading, setBindingLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [bindingMessage, setBindingMessage] = useState("")
  const [syncResult, setSyncResult] = useState<string>("")

  const cards = useMemo(
    () => [
      { label: "睡眠评分", value: latestMetric?.sleepScore ?? "--", unit: "" },
      { label: "夜间 HRV", value: latestMetric?.hrv ?? "--", unit: "ms" },
      { label: "静息心率", value: latestMetric?.restingHr ?? "--", unit: "bpm" },
      { label: "平均压力", value: latestMetric?.stress ?? "--", unit: "" },
    ],
    [latestMetric]
  )

  const dailyRawKeys = useMemo(() => {
    if (!latestMetric?.raw || typeof latestMetric.raw !== "object") {
      return []
    }

    return Object.keys(latestMetric.raw as Record<string, unknown>).sort()
  }, [latestMetric?.raw])

  const activityRawKeys = useMemo(() => {
    const raw = activities[0]?.raw
    if (!raw || typeof raw !== "object") {
      return []
    }

    return Object.keys(raw as Record<string, unknown>).sort()
  }, [activities])

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

      setBindingMessage("Garmin 账号已保存，后续同步将优先复用已保存凭证。")
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#08101d_0%,#0d1526_35%,#e9eef5_35%,#eef2f8_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(95,230,255,0.22),_transparent_30%),linear-gradient(135deg,#0f1a2e,#0b1018)] p-8 text-white shadow-[0_20px_80px_rgba(8,16,29,0.35)]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Training Dashboard</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">{userName}，今天的数据已经能自己说话了。</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                当前登录账号：{userEmail}。你现在可以绑定 Garmin、触发同步，并直接在首页查看最新睡眠、HRV、静息心率和活动数据。
              </p>
            </div>

            <button
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
              onClick={() => signOut({ callbackUrl: "/" })}
              type="button"
            >
              退出登录
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article key={card.label} className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="text-sm text-slate-500">{card.label}</div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-tight">{card.value}</span>
                <span className="pb-1 text-sm text-slate-400">{card.unit}</span>
              </div>
              <div className="mt-4 text-sm text-slate-400">
                {latestMetric ? `最新快照日期：${latestMetric.date}` : "还没有同步数据"}
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Garmin 绑定</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">保存凭证后，后续同步优先使用你已绑定的 Garmin 账号。</p>
              </div>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">已登录用户专属</span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSaveBinding}>
              <div>
                <label className="mb-2 block text-sm text-slate-500">Garmin 邮箱</label>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                  onChange={(event) => setBindingEmail(event.target.value)}
                  placeholder="445019077@qq.com"
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
                  placeholder="输入或更新 Garmin 密码"
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

          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <h2 className="text-xl font-semibold">手动同步</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">先把 Phase 1 跑稳。选一个日期，系统会抓取并保存当天 Garmin 的全量原始数据。</p>

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
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={syncLoading}
                type="submit"
              >
                {syncLoading ? "同步中..." : "同步最新 Garmin 数据"}
              </button>
            </form>
          </article>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">最近活动</h2>
              <p className="mt-2 text-sm text-slate-500">这里只展示结构化摘要，完整原始 JSON 仍然已经存库。</p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr] bg-slate-50 px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>活动</span>
              <span>距离</span>
              <span>时长</span>
              <span>时间</span>
            </div>
            {activities.length > 0 ? (
              activities.map((activity) => (
                <div
                  className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr] border-t border-slate-100 px-5 py-4 text-sm text-slate-700"
                  key={activity.id}
                >
                  <div>
                    <div className="font-medium text-slate-900">{activity.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{activity.type.replaceAll("_", " ")}</div>
                  </div>
                  <span>{formatDistance(activity.distance)}</span>
                  <span>{formatDuration(activity.duration)}</span>
                  <span>{activity.date}</span>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">还没有活动记录，先绑定并同步一条数据。</div>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <details className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">展开：本次同步的 Daily Raw JSON</summary>
              <div className="mt-3 text-xs text-slate-500">
                顶层字段数：{dailyRawKeys.length}（{dailyRawKeys.slice(0, 16).join(", ")}{dailyRawKeys.length > 16 ? ", ..." : ""}）
              </div>
              <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-white p-4 text-xs text-slate-700">
                {latestMetric?.raw ? JSON.stringify(latestMetric.raw, null, 2) : "暂无"}
              </pre>
            </details>
            <details className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">展开：最近一条 Activity Raw JSON</summary>
              <div className="mt-3 text-xs text-slate-500">
                顶层字段数：{activityRawKeys.length}（{activityRawKeys.slice(0, 16).join(", ")}{activityRawKeys.length > 16 ? ", ..." : ""}）
              </div>
              <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-white p-4 text-xs text-slate-700">
                {activities[0]?.raw ? JSON.stringify(activities[0].raw, null, 2) : "暂无"}
              </pre>
            </details>
          </div>
        </section>
      </div>
    </main>
  )
}
