import { Output } from 'ai'
import { generateWithFailover } from '@/lib/gemini'
import { qaSchema } from '@/lib/analysis'

// Allow up to 60s on Vercel — large PDFs + LLM inference can exceed the 10s default.
export const maxDuration = 60

const MAX_PDF_BYTES = 25 * 1024 * 1024 // keep in sync with /api/analyze
const FETCH_TIMEOUT_MS = 20_000
const MAX_QUESTION_LENGTH = 500

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

const QA_PROMPT = `You are answering a question about the attached PDF document.

Rules:
1. First, check whether the PDF content actually answers the question.
2. If the PDF answers it, set foundInPdf to true and answer strictly based on the PDF. Reference sections, figures, or values from the document where useful.
3. If the PDF does NOT contain the answer, set foundInPdf to false and instead give a brief, helpful general-knowledge answer.
4. Never pretend general knowledge came from the PDF. Be strict: foundInPdf is true only when the document explicitly supports the answer.

Question: `

/** Run grounded Q&A against a verified PDF buffer. */
async function answerQuestion(pdfBuffer: ArrayBuffer, question: string) {
  const header = new TextDecoder().decode(new Uint8Array(pdfBuffer.slice(0, 5)))
  if (!header.startsWith('%PDF')) {
    return errorResponse('That file is not a valid PDF. Please provide a real PDF document.', 415)
  }

  try {
    const { output } = await generateWithFailover({
      output: Output.object({ schema: qaSchema }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: QA_PROMPT + question },
            { type: 'file', mediaType: 'application/pdf', data: pdfBuffer },
          ],
        },
      ],
    })

    return Response.json({ result: output })
  } catch (err) {
    console.error('[v0] PDF Q&A failed:', err)
    const message = err instanceof Error ? err.message : ''
    if (message.includes('API key')) {
      return errorResponse('The server is missing a valid Gemini API key.', 500)
    }
    if (message.toLowerCase().includes('quota') || message.includes('429')) {
      // All configured API keys are exhausted (failover already tried each one).
      return errorResponse('The AI service is rate-limited on all configured keys. Please try again in a minute.', 429)
    }
    return errorResponse('The AI could not answer the question. Please try again.', 502)
  }
}

function validateQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const question = raw.trim()
  if (!question || question.length > MAX_QUESTION_LENGTH) return null
  return question
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || ''

  // ---- Path A: uploaded file re-sent with the question (multipart/form-data) ----
  if (contentType.includes('multipart/form-data')) {
    let file: File | null = null
    let question: string | null = null
    try {
      const formData = await req.formData()
      const entry = formData.get('file')
      file = entry instanceof File ? entry : null
      question = validateQuestion(formData.get('question'))
    } catch {
      return errorResponse('Invalid request. Please try again.', 400)
    }

    if (!file) return errorResponse('The PDF is missing. Please analyse a document first.', 400)
    if (!question) return errorResponse('Please enter a question (max 500 characters).', 400)
    if (file.size > MAX_PDF_BYTES) return errorResponse('This PDF is too large (limit is 25 MB).', 413)

    return answerQuestion(await file.arrayBuffer(), question)
  }

  // ---- Path B: JSON body with the PDF URL + question ----
  let url = ''
  let question: string | null = null
  try {
    const body = await req.json()
    url = typeof body?.url === 'string' ? body.url.trim() : ''
    question = validateQuestion(body?.question)
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  if (!question) return errorResponse('Please enter a question (max 500 characters).', 400)
  if (!url) return errorResponse('The PDF URL is missing. Please analyse a document first.', 400)

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return errorResponse('The stored PDF URL is invalid. Please analyse the document again.', 400)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return errorResponse('Only http(s) URLs are supported.', 400)
  }

  let pdfBuffer: ArrayBuffer
  try {
    const res = await fetch(parsed.href, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PDF-Analyser/1.0)',
        Accept: 'application/pdf,*/*',
      },
    })
    if (!res.ok) {
      return errorResponse(`Could not re-download the PDF (server responded with ${res.status}).`, 422)
    }
    pdfBuffer = await res.arrayBuffer()
    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      return errorResponse('This PDF is too large (limit is 25 MB).', 413)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return errorResponse('Re-downloading the PDF timed out. Try again.', 504)
    }
    return errorResponse('Could not reach the PDF URL. Please analyse the document again.', 422)
  }

  return answerQuestion(pdfBuffer, question)
}
