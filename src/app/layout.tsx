import type { Metadata } from "next"
import { Manrope, Sora } from "next/font/google"
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
