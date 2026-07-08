import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, Output } from 'ai'

/**
 * API key failover ("multi-key rotation").
 *
 * Free-tier Gemini keys have a small daily quota. To avoid the whole app
 * going down when one key is exhausted, we support multiple keys:
 *
 *   GOOGLE_GENERATIVE_AI_API_KEY     (primary — required)
 *   GOOGLE_GENERATIVE_AI_API_KEY_2   (optional fallback)
 *   GOOGLE_GENERATIVE_AI_API_KEY_3   (optional fallback)
 *
 * When a call fails with a quota / rate-limit error, we retry the same
 * request with the next key. Any other error (bad PDF, invalid request)
 * is NOT retried — retrying wouldn't help and would waste quota.
 */

const MODEL_ID = 'gemini-2.5-flash'

/** Collect all configured keys, in priority order. */
function getApiKeys(): string[] {
  const keys = [
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_2,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_3,
  ]
  return keys.filter((k): k is string => typeof k === 'string' && k.length > 0)
}

/** Quota / rate-limit errors are the only ones worth retrying with another key. */
function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    message.includes('quota') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('resource exhausted')
  )
}

type GenerateParams = {
  output: ReturnType<typeof Output.object>
  messages: NonNullable<Parameters<typeof generateText>[0]['messages']>
}

/**
 * Run a Gemini generation, failing over to the next API key on quota errors.
 * Throws the last error if every key is exhausted.
 */
export async function generateWithFailover({ output, messages }: GenerateParams) {
  const keys = getApiKeys()
  if (keys.length === 0) {
    throw new Error('No Gemini API key configured (GOOGLE_GENERATIVE_AI_API_KEY).')
  }

  let lastError: unknown
  for (let i = 0; i < keys.length; i++) {
    const provider = createGoogleGenerativeAI({ apiKey: keys[i] })
    try {
      return await generateText({
        model: provider(MODEL_ID),
        output,
        messages,
      })
    } catch (err) {
      lastError = err
      if (isQuotaError(err) && i < keys.length - 1) {
        console.log(`[gemini] Key ${i + 1} hit its quota — switching to key ${i + 2}`)
        continue
      }
      throw err
    }
  }
  throw lastError
}
