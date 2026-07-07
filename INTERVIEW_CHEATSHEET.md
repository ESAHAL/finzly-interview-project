# PDF Analyser — Interview Cheat Sheet (Finzly Take-Home Assignment)

A complete explanation of the project: what it does, how it works, why each decision was made, and likely follow-up questions with answers.

---

## 1. What the Project Does (30-Second Pitch)

> "I built a full-stack web app where a user pastes a link to any public PDF — a research paper, an invoice, a report — and the app downloads it, sends it to Google's Gemini AI model, and returns a **structured, validated analysis**: document type, title, authors, a summary, and the key takeaway. The important part isn't the AI call itself — it's the engineering around it: input validation, file verification, error handling for every failure mode, schema-enforced JSON output, and keeping the API key secure on the server."

---

## 2. Tech Stack and Why I Chose Each Piece

| Technology | What it's for | Why I chose it |
|---|---|---|
| **Next.js 16 (App Router)** | Full-stack framework — frontend + backend API in one codebase | One deployable unit; API routes run server-side so the API key is never exposed to the browser |
| **React 19 + TypeScript** | UI with type safety | Types catch bugs at compile time; the `Analysis` type is shared between backend and frontend |
| **Vercel AI SDK (`ai` package)** | Abstraction layer over LLM providers | Provider-agnostic — swapping Gemini for GPT or Claude is a one-line change; handles structured output natively |
| **`@ai-sdk/google` + Gemini 2.5 Flash** | The actual LLM | Gemini natively accepts PDF files as input (no manual text extraction needed), it's fast, cheap, and has a large context window |
| **Zod** | Schema definition + runtime validation | One schema does double duty: instructs the model what JSON to return AND validates the response |
| **Tailwind CSS v4** | Styling | Utility-first, design tokens for a consistent theme, fast to build a clean fintech-grade UI |

---

## 3. Architecture and File Structure

```
app/
  page.tsx                  → Landing page (server component, static shell)
  layout.tsx                → Root layout: fonts, metadata, theme
  globals.css               → Design tokens (colors, typography)
  api/analyze/route.ts      → THE BACKEND: POST endpoint doing all the work
components/
  pdf-analyzer.tsx          → Client component: form, states, result card
lib/
  analysis.ts               → Zod schema + shared TypeScript type
```

**Key design decision:** the page itself is a server component (static, fast); only the interactive form is a client component. The Zod schema lives in `lib/` so both the API route and the UI share one source of truth.

---

## 4. The Mechanism — Request Lifecycle Step by Step

This is the core "how does it work" answer. Walk the interviewer through this flow:

```
User pastes URL → clicks Analyse
        │
        ▼
[Frontend] POST /api/analyze  { url: "https://..." }
        │
        ▼
[Backend Step 1] Validate input
   - Is the body valid JSON? Is url a non-empty string?
   - Is it a parseable URL? Is the protocol http/https?
   - Fail fast with a 400 and a human-readable message
        │
        ▼
[Backend Step 2] Download the PDF server-side
   - fetch() with a 20-second AbortSignal timeout
   - Custom User-Agent header (some hosts block anonymous requests)
   - Reject if response not OK (422)
   - Enforce 25 MB size limit — checked TWICE:
     via Content-Length header AND actual buffer size (header can lie)
        │
        ▼
[Backend Step 3] Verify it's really a PDF
   - Check the first 5 bytes for the "%PDF" magic number
   - Don't trust the URL extension or Content-Type header
        │
        ▼
[Backend Step 4] Call Gemini with structured output
   - generateText() with Output.object({ schema: analysisSchema })
   - Message contains two parts: a text instruction + the raw PDF
     file bytes (mediaType: 'application/pdf')
   - The AI SDK converts the Zod schema to JSON Schema, passes it to
     Gemini's structured-output mode, then VALIDATES the response
     against the same schema before returning it
        │
        ▼
[Backend Step 5] Return { analysis: {...} } as JSON
   - Errors are mapped to correct HTTP codes: 400/413/415/422/429/502/504
        │
        ▼
[Frontend] Renders one of 4 states: idle / loading / error / success
```

---

## 5. Key Concepts to Explain Confidently

### a) Why download the PDF on the server, not the browser?
1. **CORS** — most PDF hosts don't allow cross-origin browser fetches; the server has no CORS restriction.
2. **Security** — the Gemini API key stays in a server environment variable (`GOOGLE_GENERATIVE_AI_API_KEY`), never shipped to the client.
3. **Control** — the server can enforce size limits, timeouts, and content verification before spending money on an AI call.

### b) What is "structured output" and why does it matter?
LLMs naturally return free-form text. If you just ask "give me JSON," the model might return malformed JSON, extra prose, or missing fields. Structured output solves this:
- The Zod schema is converted to JSON Schema and passed to the model's constrained-generation mode — the model is **forced** to emit exactly that shape.
- The AI SDK then **validates** the returned object against the same schema at runtime.
- `z.infer<typeof analysisSchema>` gives me a compile-time TypeScript type from the same definition. **One schema = model contract + runtime validation + static types.**
- Each field has a `.describe()` annotation which acts as field-level prompting (e.g. telling the model to return "Not specified" when no author exists — preventing hallucination).

### c) Why Gemini specifically?
Gemini is **natively multimodal** — it accepts raw PDF bytes as a file part in the message. That means no `pdf-parse`, no OCR pipeline, no text-extraction step. It even understands PDFs where the content is scanned images. This removed an entire category of complexity and failure modes.

### d) The magic-bytes check
Every real PDF file starts with the ASCII bytes `%PDF`. I check the first 5 bytes of the downloaded buffer instead of trusting the URL (could end in `.pdf` but serve HTML) or the `Content-Type` header (servers misconfigure it constantly). This is validating the **content**, not the **claim**.

### e) Frontend state machine
The UI has exactly four states: `idle | loading | success | error` — a single `status` variable instead of multiple booleans (`isLoading`, `hasError`...) which can drift into impossible combinations. Loading shows a skeleton + explanation; errors show the exact server message in a `role="alert"` box; success renders a semantic `<dl>` definition list.

### f) `export const maxDuration = 60`
Serverless functions default to a short timeout (~10s on Vercel). A large PDF + LLM inference can take 30–50 seconds, so I explicitly extended the function's max duration to 60s.

### g) Bonus features beyond the assignment

1. **Drag-and-drop file upload** — a second input mode (tab switcher: "From URL" / "Upload file"). The file is sent as `multipart/form-data` to the same `/api/analyze` endpoint, which branches on the `Content-Type` header. Both paths converge on one shared `analysePdf()` function, so magic-byte verification and the AI call are never duplicated. Client-side pre-checks (file type, 25 MB) give instant feedback, but the server re-validates everything — client checks are UX, server checks are security.
2. **Copy JSON** — one click copies the validated analysis as formatted JSON via the Clipboard API. Talking point: the output is machine-readable, so it could feed directly into a downstream system (invoice pipeline, KYC workflow).
3. **Session history** — the last 5 analyses are kept in React state; clicking one re-displays it instantly without re-calling the AI. Deliberately in-memory (not localStorage/DB) — it's ephemeral UX sugar; if persistence were required, I'd use Postgres keyed by a SHA-256 hash of the PDF for cache deduplication.
4. **Deep Analyse** — a second button that requests a deeper analysis. Mechanism: the server swaps in a *larger Zod schema* (`extendedAnalysisSchema = analysisSchema.extend({...})`) that additionally requires key topics, tone, target audience, and 3 suggested reader questions. The prompt is also extended. Talking point: because the base schema is *extended* rather than duplicated, the two modes can never drift apart — one source of truth. UX detail: it's a *progressive disclosure* flow — the first click reveals the tuning options, the second click ("Run Deep Analyse") executes; plain Analyse stays a one-click default path.
5. **Deep Analyse options (language + length tuning)** — the options panel appears only after Deep Analyse is activated, keeping the default UI minimal. The user can pick the output language (English, Hindi, Spanish, French, German, Japanese), summary length (brief/standard/detailed), and key-takeaway length (1–3 sentences). Plain Analyse always uses safe defaults. The server builds the prompt *dynamically* (`buildPrompt(options)`), and the options are **validated server-side with a Zod enum schema** (`optionsSchema.safeParse` with safe defaults) — the user can never inject arbitrary text into my prompt (prompt-injection defense). The title is deliberately kept in its original language.
6. **Result font switcher** — Sans/Serif/Mono toggle on the result card, applied via Tailwind's `font-sans`/`font-serif`/`font-mono` classes on the results list. Pure client-side presentation state — no re-fetch needed. Small feature, but shows separation of *data* (the analysis) from *presentation* (how it's rendered).

---

## 6. Error Handling Map (Interviewers Love This)

| Failure | Detection | HTTP status | User sees |
|---|---|---|---|
| Empty/garbage input | JSON/string check | 400 | "Please provide a PDF URL." |
| Malformed URL | `new URL()` throws | 400 | "That does not look like a valid URL…" |
| Non-http(s) scheme | protocol check | 400 | "Only http(s) URLs are supported." |
| Host unreachable | fetch throws | 422 | "Could not reach that URL…" |
| Download hangs | `AbortSignal.timeout(20s)` | 504 | "Downloading the PDF timed out." |
| Server returns 404 etc. | `!res.ok` | 422 | "Could not download the file (status)…" |
| File too big | header + buffer check | 413 | "This PDF is too large (limit is 25 MB)." |
| Not actually a PDF | `%PDF` magic bytes | 415 | "That URL does not point to a PDF file." |
| Missing API key | error message match | 500 | "The server is missing a valid Gemini API key." |
| Rate limited | quota/429 match | 429 | "The AI service is rate-limited… try again." |
| Any other AI failure | catch-all | 502 | "The AI analysis failed. Please try again." |

Every error returns the same shape — `{ error: string }` — so the frontend has one code path for all failures.

---

## 7. Follow-Up Questions & Answers

### Q1: "Walk me through what happens when I click Analyse."
See Section 4 — recite the lifecycle: validate → download → verify → AI call with schema → validated JSON back → UI state change.

### Q2: "Why didn't you extract the PDF text yourself and send text to the model?"
Text extraction (e.g. `pdf-parse`) fails on scanned/image PDFs, loses tables and layout, and adds a failure-prone dependency. Gemini processes the raw PDF natively — including images and layout — so sending the file directly is both simpler and more capable. Trade-off: file upload costs more tokens than plain text; for a high-volume production system I might add text extraction as a cheaper fast path with the file upload as fallback.

### Q3: "How do you guarantee the AI returns valid JSON?"
Two layers: (1) the Zod schema is compiled to JSON Schema and passed to Gemini's constrained decoding, so the model can only emit that structure; (2) the AI SDK validates the returned object against the same Zod schema at runtime and throws if it doesn't conform — so bad data never reaches the frontend.

### Q4: "What about security? Could someone abuse this endpoint?"
What I handle: server-side API key, protocol allowlist (http/https only), 25 MB size cap, 20s download timeout, content verification via magic bytes.
What I'd add for production: **SSRF protection** (block requests resolving to private/internal IPs like `169.254.169.254` or `10.x.x.x` — currently a user could probe internal services), **rate limiting** per IP (e.g. Upstash Redis), and **authentication** so only known users spend my AI quota. Mentioning SSRF unprompted is a strong signal — fintech interviewers care about it.

### Q5: "How would you scale this?"
- **Rate limiting + auth** first (protect cost).
- **Caching**: hash the PDF bytes (SHA-256) and cache analyses in Redis/Postgres — same document never analysed twice.
- **Queue for large files**: move analysis to a background job (e.g. Vercel Workflow/queue), return a job ID, and let the client poll or receive the result via streaming — avoids long-held HTTP connections.
- **Streaming**: use `streamText`/`streamObject` so the summary appears progressively instead of after 30 seconds.

### Q6: "Why Next.js instead of separate React frontend + Express backend?"
One codebase, one deploy, shared TypeScript types between client and server (the `Analysis` type is imported by both), file-based API routing, and serverless deployment out of the box. For a single-endpoint app, a separate backend is pure overhead.

### Q7: "What is the AI SDK actually doing for you?"
It's a provider-agnostic abstraction: it normalises message formats, converts my Zod schema to the provider's structured-output format, handles the HTTP call to Gemini, parses and validates the response. If Finzly wanted to switch to OpenAI or Claude tomorrow, I change `google('gemini-2.5-flash')` to another provider — the rest of the code is untouched.

### Q8: "How do you handle a hallucinating model — e.g. it invents an author?"
Field-level prompting via `.describe()`: the authors field explicitly instructs "If no author is identifiable, return 'Not specified'". Giving the model a sanctioned escape hatch is the standard technique to reduce fabrication. For higher stakes I'd add a confidence field or a second verification pass.

### Q9: "Why check the file size twice?"
The `Content-Length` header is client-controllable/optional and can lie (or be absent with chunked encoding). I check the header first as a cheap early exit, then check the actual `ArrayBuffer.byteLength` as the authoritative limit. Never trust, always verify.

### Q10: "What were the hardest parts / what would you improve?"
Honest answer: the error-handling surface — there are ~10 distinct ways this flow can fail and each needs a distinct, user-friendly message. Improvements: streaming responses (`streamObject` so the summary appears progressively), analysis history persisted in a database (Postgres, keyed by a SHA-256 hash of the PDF for dedup), SSRF hardening, rate limiting, and unit tests for the route (mocking fetch + the model). I already went beyond the base assignment with drag-and-drop upload, JSON export, and session history (see Section 5g).

### Q11: "Why a 4-value status enum instead of boolean flags?"
`isLoading + isError + hasData` booleans allow impossible states (loading AND error simultaneously). A single discriminated status makes each UI state mutually exclusive — it's a tiny state machine. This is a common React interview talking point.

### Q12: "How is the API key kept secure?"
It lives in the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable, read only inside the API route (server runtime). It's never in client bundles, never in the repo. The `@ai-sdk/google` provider picks it up automatically by convention.

### Q13: "What HTTP status codes did you use and why?"
400 (bad input), 413 (payload too large), 415 (unsupported media type — not a PDF), 422 (unprocessable — URL unreachable/download failed), 429 (rate limited), 500 (server misconfig — missing key), 502 (upstream AI failure), 504 (upstream timeout). Using precise codes instead of generic 500s shows API design maturity.

### Q14 (fintech angle): "How does this relate to what Finzly does?"
Fintech runs on documents: invoices, KYC documents, loan agreements, bank statements, compliance reports. This exact pipeline — ingest a document, extract **structured, validated** data, surface it to a workflow — is the foundation of automated invoice processing, KYC verification, or contract review. The schema-enforced output is what makes it safe to plug into downstream financial systems, where malformed data is unacceptable.

---

## 8. Quick Glossary (In Case They Probe Terminology)

- **LLM** — Large Language Model (Gemini 2.5 Flash here).
- **Multimodal** — a model that accepts non-text input (files, images) natively.
- **Structured output / constrained decoding** — forcing the model to generate output matching a schema.
- **Zod** — TypeScript-first schema library; gives runtime validation + inferred static types.
- **Magic bytes** — fixed byte signature at the start of a file identifying its true format (`%PDF`).
- **SSRF** — Server-Side Request Forgery; tricking a server into requesting internal resources. The main residual risk in this app.
- **App Router / Route Handler** — Next.js file-based backend endpoints (`app/api/*/route.ts`).
- **Serverless function** — stateless, auto-scaling compute unit; why `maxDuration` matters.

---

## 9. One-Minute Demo Script

1. Open the app — point out the clean single-purpose UI.
2. Click the sample link (`arxiv.org/pdf/1706.03762` — the famous "Attention Is All You Need" transformer paper; nice touch to mention you chose the paper that invented the architecture behind the model analysing it).
3. Click Analyse — narrate the loading state: "right now the server is downloading the PDF, verifying it's real, and streaming it to Gemini with a JSON schema."
4. Show the result card — point out each structured field.
5. Then break it on purpose: paste `https://google.com` → show the "not a PDF" error; paste garbage → show the URL validation error. **Demonstrating failure handling live is more impressive than the happy path.**
