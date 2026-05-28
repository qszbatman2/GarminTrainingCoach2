'use client'

import Link from "next/link"
import { signOut } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { AccentPill } from "@/components/design-system"

type GlobalTopbarProps = {
  platformUser: {
    name: string
    email: string
  } | null
  garminEmail: string | null
}

type NavItem = {
  href: string
  label: string
  match: (pathname: string) => boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "首页",
    match: (pathname) => pathname === "/",
  },
  {
    href: "/data",
    label: "数据分析",
    match: (pathname) => pathname === "/data",
  },
  {
    href: "/data/sync",
    label: "同步中心",
    match: (pathname) => pathname.startsWith("/data/sync"),
  },
]

export function GlobalTopbar({ platformUser, garminEmail }: GlobalTopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [disconnectingGarmin, setDisconnectingGarmin] = useState(false)

  const activeNav = useMemo(
    () => NAV_ITEMS.find((item) => item.match(pathname))?.href ?? null,
    [pathname]
  )

  async function handleDisconnectGarmin() {
    if (!garminEmail || disconnectingGarmin) {
      return
    }

    setDisconnectingGarmin(true)

    try {
      const response = await fetch("/api/garmin-account", {
        method: "DELETE",
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || "退出 Garmin 失败")
      }

      router.refresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "退出 Garmin 失败")
    } finally {
      setDisconnectingGarmin(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[rgba(4,11,20,0.82)] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link className="font-[family:var(--font-display)] text-lg font-semibold tracking-tight text-white" href="/">
            Garmin AI Coach
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const active = activeNav === item.href
              return (
                <Link
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <AccentPill tone={platformUser ? "emerald" : "neutral"}>
            {platformUser ? `平台：${platformUser.name}` : "平台：未登录"}
          </AccentPill>
          {platformUser ? (
            <button
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-200 transition hover:bg-white/[0.08]"
              onClick={() => signOut({ callbackUrl: "/" })}
              type="button"
            >
              退出登录
            </button>
          ) : null}
          <AccentPill tone={garminEmail ? "cyan" : "neutral"}>{garminEmail ? `Garmin：${garminEmail}` : "Garmin：未绑定"}</AccentPill>
          {platformUser && garminEmail ? (
            <button
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disconnectingGarmin}
              onClick={handleDisconnectGarmin}
              type="button"
            >
              {disconnectingGarmin ? "退出中..." : "退出 Garmin"}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
