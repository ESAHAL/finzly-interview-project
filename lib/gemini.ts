import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { APICallError } from 'ai'
import type { LanguageModel } from 'ai'

/**
 * API key failover ("multi-key rotation").
 *
 * The free Gemini tier has a per-key daily/minute quota. To survive quota
 * exhaustion, we keep an ordered list of keys: the primary plus optional
 * numbered backups. When a call fails with a rate-limit/quota error (HTTP 429),
 * we retry the same request with the next key. Any other error is NOT retried —
 * a bad PDF or invalid request would fail on every key, so retrying only
 * wastes quota.
 *
 * Add backup keys as env vars: GOOGLE_GENERATIVE_AI_API_KEY_2, _3, ...
 * The app works fine with just the primary key — backups are optional.
 */

const MODEL_ID = 'gemini-2.5-flash'

/** Ordered list of configured API keys (primary first, then backups). */
function getApiKeys(): string[] {
  return [
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_2,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_3,
  ].filter((key): key is string => typeof key === 'string' && key.length > 0)
}

/** True when the error is a rate-limit/quota problem worth retrying on another key. */
export function isRateLimitError(err: unknown): boolean {
  if (APICallError.isInstance(err)) {
    return err.statusCode === 429
  }
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return message.includes('quota') || message.includes('rate limit') || message.includes('429')
}

/**
 * Runs `fn` with a Gemini model. If the call fails with a rate-limit error,
 * automatically retries with the next configured API key.
 */
export async function withKeyFailover<T>(fn: (model: LanguageModel) => Promise<T>): Promise<T> {
  const keys = getApiKeys()
  if (keys.length === 0) {
    throw new Error('No Gemini API key is configured. Set GOOGLE_GENERATIVE_AI_API_KEY.')
  }

  let lastError: unknown
  for (let i = 0; i < keys.length; i++) {
    const provider = createGoogleGenerativeAI({ apiKey: keys[i] })
    try {
      return await fn(provider(MODEL_ID))
    } catch (err) {
      lastError = err
      if (isRateLimitError(err) && i < keys.length - 1) {
        console.warn(`[gemini] Key ${i + 1} rate-limited, failing over to key ${i + 2} of ${keys.length}`)
        continue
      }
      throw err
    }
  }
  throw lastError
}
