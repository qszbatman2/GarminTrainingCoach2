'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"

type TabItem = {
  href: string
  label: string
  icon: string
  match: (pathname: string) => boolean
}

// 仅手机端展示的底部导航，桌面端通过 CSS 隐藏，不影响现有顶栏。
const TAB_ITEMS: TabItem[] = [
  {
    href: "/",
    label: "首页",
    icon: "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
    match: (pathname) => pathname === "/",
  },
  {
    href: "/data",
    label: "数据",
    icon: "M5 20V10m7 10V4m7 16v-7",
    match: (pathname) => pathname === "/data",
  },
  {
    href: "/data/sync",
    label: "同步",
    icon: "M4 12a8 8 0 0 1 14-5.3L20 8m0 0V4m0 4h-4m4 4a8 8 0 0 1-14 5.3L4 16m0 0v4m0-4h4",
    match: (pathname) => pathname.startsWith("/data/sync"),
  },
]

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav className="mobile-tabbar" aria-label="移动端主导航">
      {TAB_ITEMS.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-tabbar__item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={item.icon} />
            </svg>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
