import { ChatOpenAI } from "@langchain/openai"

const ARK_API_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

function getRequiredEnv(name: "ARK_API_KEY" | "ARK_MODEL") {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }

  return value
}

export function createArkChatModel() {
  return new ChatOpenAI({
    apiKey: getRequiredEnv("ARK_API_KEY"),
    model: getRequiredEnv("ARK_MODEL"),
    temperature: 0.2,
    configuration: {
      baseURL: ARK_API_BASE_URL,
    },
  })
}

export type ArkChatModel = ReturnType<typeof createArkChatModel>
