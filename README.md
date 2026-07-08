# PDF Analyser — AI-Powered Document Intelligence

Take-home assignment for **Finzly**. A web app that takes any publicly accessible PDF (by URL or drag-and-drop upload), analyses it server-side with **Google Gemini**, and returns a structured breakdown — document type, title, authors, summary, and key takeaway — plus deeper insights and grounded Q&A.

**Live demo:** https://finzly-interview-project.vercel.app/

---

## Features

### Core (assignment requirements)
- **Analyse by URL** — paste a PDF link and click Analyse
- **Server-side AI** — the Gemini API is called only from backend route handlers; the API key is never exposed to the browser
- **Structured result** — Document Type, Title, Authors, Summary, Key Takeaway (schema-enforced, not free text)
- **Loading and error states** — distinct, user-friendly messages for unreachable URLs, non-PDF files, oversized files, timeouts, and quota limits

### Extras
- **Drag & drop upload** — analyse local PDF files (max 25 MB), same validation pipeline as URLs
- **Deep Analyse** — richer analysis with key topics, tone, and target audience, plus tuning options: output language (EN/HI/ES/FR/DE/JA), summary length, and takeaway length
- **Ask this PDF** — grounded Q&A on the analysed document; answers not found in the PDF are clearly flagged as general AI knowledge (hallucination guardrail)
- **Copy JSON** — export the validated analysis as machine-readable JSON
- **Session history** — revisit the last 5 analyses instantly without re-calling the AI
- **UI language switcher** (English, Hindi, Spanish, French) and **dark/light theme**, both persisted
- **Sample PDFs** — one-click test documents (research paper, Bitcoin whitepaper, IRS form, fintech report)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript + React |
| AI | Vercel AI SDK + Google Gemini (`gemini-2.5-flash`) |
| Validation | Zod (schema-enforced structured output) |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/ESAHAL/finzly-interview-project.git
cd finzly-interview-project
pnpm install   # or npm install / yarn install
```

### 2. Add your API key

Create a `.env.local` file in the project root:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

Get a free key at [Google AI Studio](https://aistudio.google.com) (API Keys → Create API key). The free tier is sufficient for testing.

### 3. Run the dev server

```bash
pnpm dev   # or npm run dev / yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How It Works

```
User (browser)
   │  PDF URL or file
   ▼
POST /api/analyze          ← Next.js route handler (server-side)
   │  1. Validate input (URL format / file type / size)
   │  2. Fetch PDF, verify magic bytes (%PDF)
   │  3. Send PDF + prompt to Gemini via AI SDK generateObject()
   │  4. Zod validates the structured response
   ▼
JSON → rendered result card
```

- `app/api/analyze/route.ts` — analysis endpoint (standard + deep modes)
- `app/api/ask/route.ts` — grounded Q&A endpoint with `foundInPdf` flag
- `lib/analysis.ts` — shared Zod schemas (single source of truth)
- `components/pdf-analyzer.tsx` — main UI component
- `lib/i18n.tsx` — UI translation dictionary and language context

### Security notes
- API key lives only in server environment variables — never in client code or git
- Server re-validates everything the client sends (client checks are UX, server checks are security)
- PDF magic-byte verification prevents disguised non-PDF content
- Analysis options are validated against a Zod enum allowlist — user input can never be injected into the AI prompt as free text

---

## Sample PDFs to Try

| Type | Document | URL |
|---|---|---|
| Research paper | Attention Is All You Need | https://arxiv.org/pdf/1706.03762 |
| Whitepaper | Bitcoin | https://bitcoin.org/bitcoin.pdf |
| Tax form | IRS Form 1040 | https://www.irs.gov/pub/irs-pdf/f1040.pdf |
| Fintech report | BIS: Payments without borders | https://www.bis.org/publ/qtrpdf/r_qt2003h.pdf |
