import { z } from 'zod'

/**
 * The structured output contract for a PDF analysis.
 * This single Zod schema does double duty:
 *  1. It is handed to the LLM so the model is forced to return exactly this JSON shape.
 *  2. The AI SDK validates the model's response against it, so the frontend can
 *     trust the data without re-validating.
 */
export const analysisSchema = z.object({
  documentType: z
    .string()
    .describe(
      'The category of the document, e.g. "Research Paper", "Invoice", "Resume", "Legal Contract", "Financial Report"',
    ),
  title: z.string().describe('The title of the document'),
  authors: z
    .string()
    .describe(
      'The author(s) of the document, e.g. "Vaswani et al." If no author is identifiable, return "Not specified"',
    ),
  summary: z.string().describe('A summary of the document'),
  keyTakeaway: z.string().describe('The most important point of the document'),
})

/**
 * Extended analysis adds deeper fields on top of the base schema.
 * Used when the user clicks "Extended Analyse".
 */
export const extendedAnalysisSchema = analysisSchema.extend({
  keyTopics: z
    .array(z.string())
    .describe('3-6 key topics or themes covered by the document, as short phrases'),
  tone: z
    .string()
    .describe('The overall tone of the document, e.g. "Formal and technical", "Persuasive", "Neutral"'),
  targetAudience: z
    .string()
    .describe('Who this document is written for, in one short sentence'),
})

export type Analysis = z.infer<typeof analysisSchema>
export type ExtendedAnalysis = z.infer<typeof extendedAnalysisSchema>

/**
 * Structured answer for the "Ask this PDF" feature.
 * `foundInPdf` lets the UI clearly distinguish grounded answers from
 * general-knowledge fallbacks, so users are never misled about the source.
 */
export const qaSchema = z.object({
  foundInPdf: z
    .boolean()
    .describe('true ONLY if the answer is explicitly supported by the PDF content, false otherwise'),
  answer: z
    .string()
    .describe(
      'If foundInPdf is true: the answer based strictly on the PDF, quoting or referencing it where useful. If foundInPdf is false: a brief general-knowledge answer to the question.',
    ),
})

export type QaResult = z.infer<typeof qaSchema>

/** User-tweakable analysis options, validated on the server. */
export const OUTPUT_LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Japanese'] as const
export const SUMMARY_LENGTHS = {
  brief: '1-2 sentences',
  standard: '2-3 sentences',
  detailed: '5-7 sentences',
} as const
export const TAKEAWAY_LENGTHS = {
  one: 'exactly 1 sentence',
  two: '2 sentences',
  three: '3 sentences',
} as const

export const optionsSchema = z.object({
  language: z.enum(OUTPUT_LANGUAGES).default('English'),
  summaryLength: z.enum(['brief', 'standard', 'detailed']).default('standard'),
  takeawayLength: z.enum(['one', 'two', 'three']).default('one'),
  extended: z.boolean().default(false),
})

export type AnalysisOptions = z.infer<typeof optionsSchema>
