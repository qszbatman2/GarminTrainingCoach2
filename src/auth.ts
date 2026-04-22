import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import prisma from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? "dev-auth-secret",
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase()
        const password = String(credentials?.password ?? "")

        if (!email || !password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user?.password) {
          return null
        }

        const isValid = verifyPassword(password, user.password)

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split("@")[0],
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = String(token.userId)
      }

      return session
    },
  },
})
