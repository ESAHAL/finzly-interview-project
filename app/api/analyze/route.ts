import { google } from '@ai-sdk/google'
import { generateText, Output } from 'ai'
import { analysisSchema } from '@/lib/analysis'

// Allow up to 60s on Vercel — large PDFs + LLM inference can exceed the 10s default.
export const maxDuration = 60

const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25 MB guardrail
const FETCH_TIMEOUT_MS = 20_000

/** Helper to return a consistent error shape the frontend can rely on. */
function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

/** Verify magic bytes ("%PDF") and run the Gemini analysis on a PDF buffer. */
async function analysePdf(pdfBuffer: ArrayBuffer) {
  // ---- Verify it is actually a PDF (magic bytes: "%PDF") ----
  const header = new Uint8Array(pdfBuffer.slice(0, 5))
  const headerText = new TextDecoder().decode(header)
  if (!headerText.startsWith('%PDF')) {
    return errorResponse('That file is not a valid PDF. Please provide a real PDF document.', 415)
  }

  // ---- Send the PDF to Gemini and request structured JSON output ----
  try {
    const { output } = await generateText({
      model: google('gemini-2.5-flash'),
      output: Output.object({ schema: analysisSchema }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyse the attached PDF document. Identify what type of document it is, its title, its authors, write a concise 2-3 sentence summary, and state the single most important takeaway.',
            },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: pdfBuffer,
            },
          ],
        },
      ],
    })

    return Response.json({ analysis: output })
  } catch (err) {
    console.error('[v0] LLM analysis failed:', err)
    const message = err instanceof Error ? err.message : ''
    if (message.includes('API key')) {
      return errorResponse('The server is missing a valid Gemini API key.', 500)
    }
    if (message.toLowerCase().includes('quota') || message.includes('429')) {
      return errorResponse('The AI service is rate-limited right now. Please try again in a minute.', 429)
    }
    return errorResponse('The AI analysis failed. Please try again.', 502)
  }
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || ''

  // ---- Path A: direct file upload (multipart/form-data from drag & drop) ----
  if (contentType.includes('multipart/form-data')) {
    let file: File | null = null
    try {
      const formData = await req.formData()
      const entry = formData.get('file')
      file = entry instanceof File ? entry : null
    } catch {
      return errorResponse('Invalid upload. Please try again.', 400)
    }

    if (!file) {
      return errorResponse('No file was uploaded.', 400)
    }
    if (file.size > MAX_PDF_BYTES) {
      return errorResponse('This PDF is too large (limit is 25 MB).', 413)
    }

    const pdfBuffer = await file.arrayBuffer()
    return analysePdf(pdfBuffer)
  }

  // ---- Path B: JSON body with a URL ----
  // 1. Parse and validate the input URL
  let url: string
  try {
    const body = await req.json()
    url = typeof body?.url === 'string' ? body.url.trim() : ''
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  if (!url) {
    return errorResponse('Please provide a PDF URL.', 400)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return errorResponse('That does not look like a valid URL. Include the full address, e.g. https://arxiv.org/pdf/1706.03762', 400)
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return errorResponse('Only http(s) URLs are supported.', 400)
  }

  // 2. Download the PDF server-side
  let pdfBuffer: ArrayBuffer
  try {
    const res = await fetch(parsed.href, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Some hosts block requests without a user agent
        'User-Agent': 'Mozilla/5.0 (compatible; PDF-Analyser/1.0)',
        Accept: 'application/pdf,*/*',
      },
    })

    if (!res.ok) {
      return errorResponse(
        `Could not download the file (server responded with ${res.status}). Make sure the URL is publicly accessible.`,
        422,
      )
    }

    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_PDF_BYTES) {
      return errorResponse('This PDF is too large (limit is 25 MB).', 413)
    }

    pdfBuffer = await res.arrayBuffer()

    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      return errorResponse('This PDF is too large (limit is 25 MB).', 413)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return errorResponse('Downloading the PDF timed out. Try a different URL.', 504)
    }
    return errorResponse('Could not reach that URL. Check that it is correct and publicly accessible.', 422)
  }

  // 3. Verify + analyse (shared path)
  return analysePdf(pdfBuffer)
}
