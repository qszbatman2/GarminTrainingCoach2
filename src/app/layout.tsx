import type { Metadata } from "next"
import { Manrope, Sora } from "next/font/google"

import { auth } from "@/auth"
import { GlobalTopbar } from "@/components/global-topbar"
import prisma from "@/lib/prisma"

import "./globals.css"

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
})

const displayFont = Sora({
  variable: "--font-display",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "GarminTrainingCoach2",
  description: "Garmin training insights dashboard",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()
  const platformUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          email: true,
          name: true,
          garminEmail: true,
        },
      })
    : null

  return (
    <html lang="zh-CN" className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[#07111f] text-slate-100">
        <GlobalTopbar
          garminEmail={platformUser?.garminEmail ?? null}
          platformUser={
            platformUser
              ? {
                  email: platformUser.email,
                  name: platformUser.name ?? platformUser.email.split("@")[0],
                }
              : null
          }
        />
        {children}
      </body>
    </html>
  )
}
