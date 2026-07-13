import { ChatOpenAI } from "@langchain/openai"

// 火山方舟 Ark 提供 OpenAI 兼容接口，所以这里用 LangChain 的 ChatOpenAI 适配。
const ARK_API_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

// AI 链路启动前必须显式检查环境变量，避免请求发出后才出现难定位的认证错误。
function getRequiredEnv(name: "ARK_API_KEY" | "ARK_MODEL") {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }

  return value
}

// 所有 Agent 共用同一个模型配置。
// temperature 保持较低，让训练建议更稳定，减少同一输入下的随机波动。
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

// 供各 Agent wrapper 复用，保证 model 参数类型和 createArkChatModel 返回值同步。
export type ArkChatModel = ReturnType<typeof createArkChatModel>
