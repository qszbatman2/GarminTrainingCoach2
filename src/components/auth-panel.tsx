'use client'

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

import { AppPage, SurfaceCard } from "@/components/design-system"

type Mode = "login" | "register"

export function AuthPanel() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      if (mode === "register") {
        const registerResponse = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        })

        const registerData = await registerResponse.json()

        if (!registerResponse.ok) {
          throw new Error(registerData.error || "注册失败")
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        throw new Error("邮箱或密码不正确")
      }

      router.refresh()
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "提交失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppPage>
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard className="p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">Garmin Training Coach</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
            把 Garmin 身体数据和训练记录，整理成你每天真会看的私人仪表盘。
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300">
            先登录，再绑定 Garmin。系统会把训练建议、趋势数据和同步状态整理成清晰的产品视图。
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {["AI 建议", "趋势分析", "同步追踪"].map((item) => (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200" key={item}>
                {item}
              </span>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="bg-[#07101b]/88 p-8">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
            <button
              className={`rounded-full px-4 py-2 transition ${mode === "login" ? "bg-white text-slate-950" : "text-slate-300"}`}
              onClick={() => setMode("login")}
              type="button"
            >
              登录
            </button>
            <button
              className={`rounded-full px-4 py-2 transition ${mode === "register" ? "bg-white text-slate-950" : "text-slate-300"}`}
              onClick={() => setMode("register")}
              type="button"
            >
              注册
            </button>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <label className="mb-2 block text-sm text-slate-300">昵称</label>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：Wayn"
                  value={name}
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm text-slate-300">邮箱</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">密码</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                required
                type="password"
                value={password}
              />
            </div>

            {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

            <button
              className="w-full rounded-2xl bg-cyan-300 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "提交中..." : mode === "login" ? "登录并进入面板" : "注册并进入面板"}
            </button>
          </form>
        </SurfaceCard>
      </div>
    </AppPage>
  )
}
