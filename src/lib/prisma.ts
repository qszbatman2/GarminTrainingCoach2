import { PrismaClient } from "@prisma/client"

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

// 生产环境同样复用全局实例，避免 serverless 冷启动重复 new 导致连接泄漏打满连接池。
globalThis.prismaGlobal = prisma
