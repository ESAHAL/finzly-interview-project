import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { generateText, Output } from 'ai'

/**
 * Multi-provider AI failover.
 *
 * Free-tier API keys have small daily quotas. To avoid the whole app going
 * down when one is exhausted, we try providers/keys in priority order:
 *
 *   1. GOOGLE_GENERATIVE_AI_API_KEY     (Gemini — primary, required)
 *   2. GOOGLE_GENERATIVE_AI_API_KEY_2   (Gemini — optional extra key)
 *   3. GOOGLE_GENERATIVE_AI_API_KEY_3   (Gemini — optional extra key)
 *   4. MISTRAL_API_KEY                  (Mistral — optional cross-provider fallback)
 *
 * When a call fails with a quota / rate-limit error, we retry the same
 * request with the next entry. Any other error (bad PDF, invalid request)
 * is NOT retried — retrying wouldn't help and would waste quota.
 *
 * Both providers accept the identical message format (text + PDF file parts),
 * which is the point of using the AI SDK: swapping the model is one line.
 */

type ProviderEntry = {
  /** Human-readable name for logs. */
  name: string
  /** Builds the AI SDK model instance for this entry. */
  makeModel: () => Parameters<typeof generateText>[0]['model']
}

/** Collect all configured providers, in priority order. */
function getProviders(): ProviderEntry[] {
  const entries: ProviderEntry[] = []

  const googleKeys = [
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_2,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_3,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0)

  for (let i = 0; i < googleKeys.length; i++) {
    entries.push({
      name: `gemini-2.5-flash (key ${i + 1})`,
      makeModel: () => createGoogleGenerativeAI({ apiKey: googleKeys[i] })('gemini-2.5-flash'),
    })
  }

  const mistralKey = process.env.MISTRAL_API_KEY
  if (typeof mistralKey === 'string' && mistralKey.length > 0) {
    entries.push({
      name: 'mistral-small-latest',
      makeModel: () => createMistral({ apiKey: mistralKey })('mistral-small-latest'),
    })
  }

  return entries
}

/** Quota / rate-limit errors are the only ones worth retrying with another provider. */
function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    message.includes('quota') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('resource exhausted') ||
    message.includes('capacity exceeded')
  )
}

type GenerateParams = {
  output: ReturnType<typeof Output.object>
  messages: NonNullable<Parameters<typeof generateText>[0]['messages']>
}

/**
 * Run an AI generation, failing over to the next provider/key on quota errors.
 * Throws the last error if every provider is exhausted.
 */
export async function generateWithFailover({ output, messages }: GenerateParams) {
  const providers = getProviders()
  if (providers.length === 0) {
    throw new Error('No AI API key configured (GOOGLE_GENERATIVE_AI_API_KEY).')
  }

  let lastError: unknown
  for (let i = 0; i < providers.length; i++) {
    try {
      return await generateText({
        model: providers[i].makeModel(),
        output,
        messages,
      })
    } catch (err) {
      lastError = err
      if (isQuotaError(err) && i < providers.length - 1) {
        console.log(`[ai-failover] ${providers[i].name} hit its quota — switching to ${providers[i + 1].name}`)
        continue
      }
      throw err
    }
  }
  throw lastError
}
