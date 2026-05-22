'use client'

import type { ReactNode } from "react"

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ")
}

export function AppPage({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(139,92,246,0.12),transparent_22%),linear-gradient(180deg,#07111f_0%,#091425_34%,#0b1729_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.28)_1px,transparent_1px)] [background-position:center] [background-size:36px_36px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,rgba(56,189,248,0.18),transparent)] blur-3xl" />
      <div className="relative mx-auto max-w-7xl space-y-8 px-6 py-8">{children}</div>
    </main>
  )
}

export function SurfaceCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={joinClasses(
        "rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.42)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </section>
  )
}

export function SubtleCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={joinClasses("rounded-[1.35rem] border border-white/8 bg-white/[0.035] p-5 backdrop-blur-md", className)}>{children}</div>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.32em] text-cyan-300/72">{eyebrow}</div>
        <h2 className="mt-3 font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_26%),radial-gradient(circle_at_78%_18%,rgba(139,92,246,0.14),transparent_22%),linear-gradient(135deg,rgba(9,16,30,0.96),rgba(10,20,34,0.92))] p-8 shadow-[0_24px_90px_rgba(2,6,23,0.5)]">
      <SectionHeader actions={actions} description={description} eyebrow={eyebrow} title={title} />
    </section>
  )
}

export function MetricTile({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string
  detail: string
  className?: string
}) {
  return (
    <SubtleCard className={className}>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-3 font-[family:var(--font-display)] text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{detail}</div>
    </SubtleCard>
  )
}

export function AccentPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "cyan" | "violet" | "emerald" | "amber" | "rose"
}) {
  const toneClasses = {
    neutral: "border-white/10 bg-white/[0.04] text-slate-300",
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  }

  return <span className={joinClasses("inline-flex rounded-full border px-3 py-1 text-xs font-medium", toneClasses[tone])}>{children}</span>
}
