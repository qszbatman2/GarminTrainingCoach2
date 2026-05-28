import { NextResponse } from "next/server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const { garminEmail, garminPassword } = await request.json()

    const normalizedEmail = String(garminEmail ?? "").trim().toLowerCase()
    const normalizedPassword = String(garminPassword ?? "")

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: "Garmin 账号和密码不能为空" }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        garminEmail: normalizedEmail,
        garminPassword: normalizedPassword,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "保存 Garmin 账号失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        garminEmail: null,
        garminPassword: null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "退出 Garmin 账号失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
