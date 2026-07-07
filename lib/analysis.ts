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
  summary: z
    .string()
    .describe('A concise 2-3 sentence summary of the document'),
  keyTakeaway: z
    .string()
    .describe('The single most important point of the document, in one sentence'),
})

export type Analysis = z.infer<typeof analysisSchema>
