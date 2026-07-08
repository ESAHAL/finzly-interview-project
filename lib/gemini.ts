import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { generateText, Output, type LanguageModel } from 'ai'

/**
 * Provider + API key failover ("multi-key rotation").
 *
 * Free-tier keys have small daily quotas. To avoid the whole app going
 * down when one key is exhausted, we build a chain of providers:
 *
 *   1. GOOGLE_GENERATIVE_AI_API_KEY     (primary — Gemini, required)
 *   2. GOOGLE_GENERATIVE_AI_API_KEY_2   (optional — second Gemini key)
 *   3. GOOGLE_GENERATIVE_AI_API_KEY_3   (optional — third Gemini key)
 *   4. MISTRAL_API_KEY                  (optional — cross-provider fallback,
 *                                        Mistral chat models support PDF OCR)
 *
 * When a call fails with a quota / rate-limit error, we retry the same
 * request with the next entry in the chain. Any other error (bad PDF,
 * invalid request) is NOT retried — retrying wouldn't help and would
 * waste quota.
 *
 * Cross-provider note: this only works because the AI SDK gives every
 * provider the same interface (model + messages + structured output).
 * The Zod schema is enforced identically regardless of which model answers.
 */

const GEMINI_MODEL = 'gemini-2.5-flash'
const MISTRAL_MODEL = 'mistral-small-latest'

type ProviderEntry = {
  /** Human-readable name for logs, e.g. "gemini key 2" or "mistral" */
  name: string
  model: LanguageModel
}

/** Build the failover chain from whatever keys are configured, in priority order. */
function getProviderChain(): ProviderEntry[] {
  const chain: ProviderEntry[] = []

  const geminiKeys = [
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_2,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_3,
  ]
  geminiKeys.forEach((key, i) => {
    if (typeof key === 'string' && key.length > 0) {
      chain.push({
        name: `gemini key ${i + 1}`,
        model: createGoogleGenerativeAI({ apiKey: key })(GEMINI_MODEL),
      })
    }
  })

  const mistralKey = process.env.MISTRAL_API_KEY
  if (typeof mistralKey === 'string' && mistralKey.length > 0) {
    chain.push({
      name: 'mistral',
      model: createMistral({ apiKey: mistralKey })(MISTRAL_MODEL),
    })
  }

  return chain
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
 * Run a generation, failing over to the next provider/key on quota errors.
 * Throws the last error if every entry in the chain is exhausted.
 */
export async function generateWithFailover({ output, messages }: GenerateParams) {
  const chain = getProviderChain()
  if (chain.length === 0) {
    throw new Error('No AI API key configured (GOOGLE_GENERATIVE_AI_API_KEY).')
  }

  let lastError: unknown
  for (let i = 0; i < chain.length; i++) {
    try {
      return await generateText({
        model: chain[i].model,
        output,
        messages,
      })
    } catch (err) {
      lastError = err
      if (isQuotaError(err) && i < chain.length - 1) {
        console.log(`[failover] ${chain[i].name} hit its quota — switching to ${chain[i + 1].name}`)
        continue
      }
      throw err
    }
  }
  throw lastError
}
