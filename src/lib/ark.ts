type ArkMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type ArkChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"

function isArkChatCompletionResponse(value: unknown): value is ArkChatCompletionResponse {
  return typeof value === "object" && value !== null && "choices" in value
}

function getRequiredEnv(name: "ARK_API_KEY" | "ARK_MODEL") {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }

  return value
}

export async function createArkJsonCompletion(messages: ArkMessage[]) {
  const apiKey = getRequiredEnv("ARK_API_KEY")
  const model = getRequiredEnv("ARK_MODEL")

  const response = await fetch(ARK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  })

  const payload = (await response.json().catch(() => null)) as ArkChatCompletionResponse | { error?: { message?: string } } | null

  if (!response.ok) {
    const message =
      payload && "error" in payload && typeof payload.error?.message === "string"
        ? payload.error.message
        : "调用火山方舟失败"
    throw new Error(message)
  }

  const content = isArkChatCompletionResponse(payload) ? payload.choices?.[0]?.message?.content?.trim() : undefined
  if (!content) {
    throw new Error("火山方舟返回了空结果")
  }

  return content
}
