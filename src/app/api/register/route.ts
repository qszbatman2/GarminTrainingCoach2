import { NextResponse } from "next/server"

import prisma from "@/lib/prisma"
import { hashPassword } from "@/lib/password"

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json()

    const normalizedEmail = String(email ?? "").trim().toLowerCase()
    const normalizedPassword = String(password ?? "")
    const normalizedName = String(name ?? "").trim()

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 })
    }

    if (normalizedPassword.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 })
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName || normalizedEmail.split("@")[0],
        password: hashPassword(normalizedPassword),
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    return NextResponse.json({ success: true, user })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "注册失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
