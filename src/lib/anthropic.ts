// Thin wrapper around the Anthropic Messages API. We hit the REST endpoint
// directly with fetch instead of pulling in @anthropic-ai/sdk — one fewer
// dependency, and the request shape is stable. The system prompt is sent as a
// cacheable block so repeat calls inside the 5-minute prompt-cache window skip
// re-processing it. Callers should catch AIUnavailableError and degrade
// gracefully — the AI is an assistant, it must never block the clinical form.
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

// Pinned per the prescription-AI spec. Sonnet 4.6 is the right tier for
// structured clinical suggestion + note refinement.
export const CLAUDE_MODEL = 'claude-sonnet-4-6'

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIUnavailableError'
  }
}

export type ClaudeUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

// Same call as callClaude but also returns the token usage the API reports, so
// callers can record it (e.g. the ai_usage_log rate-limit table). callClaude
// is a thin wrapper over this for the common text-only case.
export async function callClaudeWithUsage(opts: {
  system: string
  user: string
  maxTokens?: number
}): Promise<{ text: string; usage: ClaudeUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new AIUnavailableError('ANTHROPIC_API_KEY is not configured')

  let res: Response
  try {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens ?? 1000,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: opts.user }],
      }),
    })
  } catch (err) {
    throw new AIUnavailableError(err instanceof Error ? err.message : 'Network error reaching Anthropic')
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AIUnavailableError(`Anthropic API returned ${res.status}: ${detail.slice(0, 200)}`)
  }

  const data = await res.json().catch(() => null)
  const text = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
    : ''
  if (!text) throw new AIUnavailableError('Empty response from Anthropic')

  const inputTokens = Number(data?.usage?.input_tokens) || 0
  const outputTokens = Number(data?.usage?.output_tokens) || 0
  return {
    text,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  }
}

export async function callClaude(opts: {
  system: string
  user: string
  maxTokens?: number
}): Promise<string> {
  return (await callClaudeWithUsage(opts)).text
}
