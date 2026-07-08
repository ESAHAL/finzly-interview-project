# PDF Analyser — Complete Project Guide (For a Java Developer)

> Companion to `INTERVIEW_CHEATSHEET.md`. That file is the quick revision sheet;
> this file is the **detailed explanation** — every file, every function, what
> happens after every click, plus tech-stack basics, LLM basics, API keys,
> hosting, and GitHub. Technical terms have simple meanings in (brackets).

---

## 1. What This Project Is (30 seconds)

A web app where a user provides a PDF (by URL or by uploading a file). The
server sends that PDF to Google's Gemini AI model, which reads it and returns a
**structured analysis**: document type, title, authors, summary, and key
takeaway. Extra features: Deep Analyse (topics, tone, audience + language/length
tuning), Ask-this-PDF Q&A with a hallucination guardrail, copy JSON, session
history, and a font switcher.

---

## 2. Tech Stack — Explained for a Java Developer

| Technology | What it is | Java-world equivalent |
|---|---|---|
| **TypeScript** | JavaScript + static types. Files end in `.ts` / `.tsx` | Java itself — typed language. `interface`/`type` ≈ Java interfaces/POJOs |
| **React** | Library for building UIs out of reusable **components** (functions that return HTML-like markup) | Think JSP/JSF but component-based; a component ≈ a reusable class that renders itself |
| **Next.js** | Full-stack framework on top of React. Gives us **routing** (URL → page mapping) and **API routes** (backend endpoints) in one project | Spring Boot — one project containing both controllers (backend) and views (frontend) |
| **Node.js** | The runtime that executes our server-side TypeScript | The JVM — it runs the code |
| **Tailwind CSS** | Styling via utility classes in the markup, e.g. `class="flex gap-4"` | No direct equivalent; think of it as inline CSS shorthand with a design system |
| **Zod** | Runtime validation library — defines a schema and checks data against it | Java Bean Validation (`@NotNull`, `@Size`) + Jackson deserialization combined |
| **AI SDK (`ai` package)** | Vercel's library that gives one uniform API to call any AI model | JDBC — one interface, many drivers. Swap Gemini for GPT like swapping MySQL for Postgres |
| **`@ai-sdk/google`** | The "driver" for Google's Gemini models | The MySQL Connector/J of the analogy |
| **pnpm** | Package manager (installs libraries) | Maven/Gradle. `package.json` ≈ `pom.xml` |

### Key mental model shift from Java

- No classes for UI — React components are **functions**.
- No servlet container — Next.js dev server does everything (`pnpm dev` ≈ `mvn spring-boot:run`).
- `async/await` ≈ Java's `CompletableFuture`, but with much lighter syntax.
  `await fetch(...)` means "call this HTTP endpoint and pause this function
  (without blocking the thread) until the response arrives."

---

## 3. Every File and What It Does

```
project root
├── app/                          ← Next.js "app" directory (routing by folder structure)
│   ├── layout.tsx                ← Root template: fonts, metadata, <html>/<body> wrapper
│   │                                (like a master JSP template / Thymeleaf layout)
│   ├── page.tsx                  ← The home page UI shell: header, hero text,
│   │                                renders <PdfAnalyzer /> (URL "/" maps here)
│   ├── globals.css               ← Design tokens: colors, radius (the theme)
│   └── api/
│       ├── analyze/route.ts      ← BACKEND endpoint POST /api/analyze
│       │                            (like a @RestController @PostMapping("/api/analyze"))
│       └── ask/route.ts          ← BACKEND endpoint POST /api/ask (the Q&A feature)
├── components/
│   └── pdf-analyzer.tsx          ← The main frontend component: all UI + client logic
├── lib/
│   └── analysis.ts               ← Shared Zod schemas + types (the "DTO layer",
│                                    imported by BOTH frontend and backend)
├── data/
│   └── Take_Home_Assignment...docx  ← The original assignment document
├── package.json                  ← Dependencies list (like pom.xml)
├── INTERVIEW_CHEATSHEET.md       ← Quick revision sheet
└── PROJECT_GUIDE.md              ← This file
```

**Folder = URL** in Next.js: `app/api/analyze/route.ts` automatically becomes
the endpoint `POST /api/analyze`. No annotations, no XML config — the file
location IS the route mapping.

---

## 4. What Happens After Each Click (Detailed, with Code References)

### 4.1 Click "Analyse" (URL mode)

**Frontend — `components/pdf-analyzer.tsx`:**

1. The form's `onSubmit` fires `handleUrlSubmit()` (~line 147), which calls
   `submitUrl(false)` — `false` means "not deep mode".
2. `submitUrl()` (~line 132) trims the URL and calls `runAnalysis()`, passing it
   a function that does
   `fetch('/api/analyze', { method: 'POST', body: JSON.stringify({ url, options }) })`
   (an HTTP POST from browser to our own backend, like RestTemplate.postForObject).
3. `runAnalysis()` (~line 61) is the central state machine:
   - sets `status = 'loading'` → React **re-renders** (redraws the UI
     automatically when state changes) → the button shows a spinner
   - clears old results and resets the Q&A panel
   - `await`s the response; if HTTP status is not OK, throws with the server's
     error message
   - on success: `setAnalysis(data.analysis)`, `setStatus('success')`,
     remembers the source PDF for Q&A (`setSource`), pushes an entry into
     `history` (capped at 5 with `.slice(0, 5)`)

**Backend — `app/api/analyze/route.ts`:**

4. `POST(req)` runs. It checks the `Content-Type` header:
   JSON → "Path B" (URL flow).
5. Parses body; validates the URL with `new URL(url)` (throws if malformed) and
   rejects non-http(s) protocols.
6. `parseOptions()` validates the options with `optionsSchema.safeParse` — if
   the user (or an attacker) sent junk, it silently falls back to safe defaults.
   (This blocks **prompt injection** — sneaking malicious instructions into the AI prompt.)
7. **Downloads the PDF server-side** with `fetch(parsed.href, ...)`:
   - `AbortSignal.timeout(20_000)` — abort after 20s (like setting a socket timeout)
   - custom `User-Agent` header — some hosts reject anonymous requests
   - checks `content-length` and actual byte size against the 25 MB cap
8. Calls the shared `analysePdf(pdfBuffer, options)`:
   - **Magic-byte check**: reads the first 5 bytes and verifies they are
     `%PDF` (every real PDF file starts with these bytes — checking the file's
     "signature" instead of trusting its name/extension)
   - Calls Gemini via the AI SDK:
     ```ts
     const { output } = await generateText({
       model: google('gemini-2.5-flash'),
       output: Output.object({ schema: analysisSchema }),   // ← forces JSON shape
       messages: [{ role: 'user', content: [
         { type: 'text', text: buildPrompt(options) },       // the instruction
         { type: 'file', mediaType: 'application/pdf', data: pdfBuffer },  // the PDF itself
       ]}],
     })
     ```
   - The **schema** makes the model return exactly our JSON shape, and the SDK
     validates the reply against it. Bad output = error, never garbage in the UI.
9. Returns `Response.json({ analysis: output })` → frontend renders the result card.

### 4.2 Click "Analyse" (Upload mode) — drag-and-drop or Browse

1. Dropping a file triggers `handleDrop()` (~line 175); browsing triggers the
   hidden `<input type="file">` whose `onChange` calls `handleFile()`.
2. `handleFile()` (~line 152) does instant client-side checks (is it a .pdf? under
   25 MB?) for fast feedback — but these are **UX only; the server re-checks
   everything** (client checks can be bypassed with dev tools; server checks cannot).
3. The file goes up as `FormData` (multipart/form-data — the standard browser
   file-upload encoding). The backend's "Path A" branch reads it with
   `req.formData()`, then funnels into the **same** `analysePdf()` as the URL path.
   One shared function = validation logic can never diverge between the two paths.

### 4.3 Click "Deep Analyse"

Progressive disclosure (show advanced options only when asked for):

1. **First click** → `setDeepMode(true)` — no network call. The options panel
   appears (language, summary length, takeaway length) and the button relabels
   to "Run Deep Analyse".
2. **Second click** → `submitUrl(true)`. Now `currentOptions(true)` (~line 53)
   includes the user's tuning choices and `extended: true`.
3. On the backend, `options.extended === true` makes two things happen:
   - the schema swaps to `extendedAnalysisSchema` — defined in `lib/analysis.ts`
     as `analysisSchema.extend({ keyTopics, tone, targetAudience })`.
     **Talking point:** extending (inheriting) instead of copying means the two
     schemas can never drift apart — single source of truth.
   - `buildPrompt()` appends the extra instructions for topics/tone/audience,
     and a language instruction if not English.
4. The UI detects a deep result with
   `const isExtendedResult = Array.isArray(analysis.keyTopics)` (~line 193) and
   conditionally renders the extra rows (topics as chips, tone, audience).

### 4.4 Ask a question ("Ask this PDF")

1. After any successful analysis the Q&A panel appears (it renders only when
   `status === 'success' && source` — the source being the URL string or the
   actual `File` object kept in React state).
2. Submitting calls `handleAsk()` (~line 95): POSTs `{ url, question }` (or
   FormData with the file) to **`/api/ask`**.
3. The backend re-obtains the PDF and asks Gemini the question **with the PDF
   attached**, forcing this response schema (from `lib/analysis.ts`):
   ```ts
   qaSchema = z.object({
     foundInPdf: z.boolean(),  // true ONLY if the answer is in the document
     answer: z.string(),
   })
   ```
4. The UI branches on the boolean:
   - `foundInPdf: true` → green card "Answer · from the PDF"
   - `foundInPdf: false` → red warning card: "This information is not present
     in the PDF. The answer below is general knowledge from the AI model."
   **Talking point:** this is a **hallucination guardrail** (stops the AI from
   confidently presenting made-up or out-of-document info as if it came from the
   document) — source attribution is a machine-checkable boolean, not a vague
   phrase inside the answer text.
5. Consistency guard: restoring an old result from history clears `source`, so
   the Q&A panel disappears — you can never accidentally ask questions "against"
   the wrong document.

### 4.5 Small features

- **Copy JSON** — `copyJson()` (~line 182) uses `navigator.clipboard.writeText`
  (browser clipboard API); button flips to "Copied" for 2s via `setTimeout`.
- **Font switcher** — `resultFont` state maps to Tailwind classes
  (`font-sans`/`font-serif`/`font-mono`) via the `FONT_CLASSES` lookup. Pure
  presentation; no re-fetch. Shows separation of data vs. presentation.
- **History** — last 5 analyses in React state (in-memory). Deliberate choice:
  ephemeral UX sugar. If persistence were required → a database, keyed by a
  SHA-256 hash (unique fingerprint) of the PDF for deduplication.

---

## 5. Flow Chart of the Whole Project

```
                       ┌──────────────────────────────┐
                       │   BROWSER (frontend, React)  │
                       │   components/pdf-analyzer.tsx│
                       └──────────────┬───────────────┘
              ┌───────────────┬───────┴────────┬───────────────────┐
              │  Analyse      │  Deep Analyse  │  Ask this PDF     │
              │  (URL/file)   │  (2-click flow)│  (question text)  │
              ▼               ▼                ▼
        POST /api/analyze  POST /api/analyze  POST /api/ask
        (JSON url  OR      (+ options:        (question + url/file)
         multipart file)    extended, lang…)
              │               │                │
   ┌──────────▼───────────────▼────────────────▼──────────┐
   │              SERVER (Next.js API routes)             │
   │                                                      │
   │  1. Validate input (URL shape / options via Zod)     │
   │  2. Get PDF bytes (download URL / read upload)       │
   │  3. Guardrails: 25MB cap · 20s timeout · %PDF bytes  │
   │  4. Build prompt (dynamic, from validated options)   │
   │  5. Call Gemini via AI SDK  ──────────────────┐      │
   │  6. Validate AI reply against Zod schema      │      │
   │  7. Return JSON  { analysis } / { result }    │      │
   └───────────────────────────────────────────────┼──────┘
                                                   ▼
                                    ┌─────────────────────────┐
                                    │  GOOGLE GEMINI API      │
                                    │  model: gemini-2.5-flash│
                                    │  (reads PDF natively,   │
                                    │   returns structured    │
                                    │   JSON per our schema)  │
                                    └─────────────────────────┘

  Shared contract: lib/analysis.ts (Zod schemas + TypeScript types)
  imported by BOTH sides → frontend and backend can never disagree
  about the data shape. (Like sharing one DTO jar between services.)
```

---

## 6. AI Model Used + Basics of LLMs

### The model

- **`gemini-2.5-flash`** by Google — a fast, cost-efficient **multimodal** model
  (can read text, images, AND PDF files natively — we never write our own PDF
  text extractor; Gemini reads the document directly, including layout and tables).
- Called through the **AI SDK**, so swapping to another model is a one-line change.

### LLM basics (likely interview warm-up questions)

- **LLM** (Large Language Model) = a neural network trained on massive amounts
  of text to predict the next token (word piece). Emergent result: it can
  summarize, answer questions, extract data, translate.
- **Token** = the unit models read/write (~¾ of an English word). Pricing and
  limits are per token.
- **Prompt** = the instruction you send. Our `buildPrompt()` constructs it
  dynamically from validated options.
- **Context window** = how much the model can "hold in its head" per request.
  Gemini 2.5 Flash has ~1M tokens — a whole book fits, so a 25 MB PDF is fine.
- **Hallucination** = the model confidently making things up. Our two defenses:
  (1) structured output — the schema constrains what it may return;
  (2) the `foundInPdf` boolean in Q&A — explicit source attribution.
- **Structured output** = forcing the model to return valid JSON matching a
  schema, instead of free text you'd have to parse with regex and pray.
- **Temperature** = randomness dial (0 = deterministic, higher = creative). For
  data extraction you want it low; structured output largely handles this for us.
- **Fine-tuning vs. prompting**: we use prompting (instructions per request).
  Fine-tuning (retraining the model on custom data) is unnecessary here — good
  prompts + schema enforcement are cheaper and sufficient.

### The proper way to create and test an AI project (how this one was built)

1. **Read the requirement, then design the data contract first** — the Zod
   schema (`lib/analysis.ts`) was written before any UI. Everything hangs off it.
2. **Build the backend endpoint** with all guardrails (validation, limits,
   timeouts, error mapping), test it directly with `curl` (a command-line HTTP
   client, like Postman) before any frontend exists.
3. **Build the UI** as a state machine: idle → loading → success | error. Every
   state has a visible rendering.
4. **Test the unhappy paths deliberately**: bad URL, non-PDF file (rename a .txt
   to .pdf — the magic-byte check catches it), oversized file, unreachable
   host, quota exhaustion. AI apps fail in more ways than normal apps; the
   error-handling surface IS the engineering work.
5. **Test AI output quality manually** with different document types (paper,
   invoice, resume) — AI responses are non-deterministic, so unlike a unit test,
   you check *shape* automatically (the schema does it) and *quality* by review.
6. **Never trust the model blindly** — validate every response against the schema.

---

## 7. API Keys — What, Where, Limits, and "API from Backend"

### What an API key is

A secret string that identifies **your account** to a service (like a database
password, but for a web API). Whoever has it can spend your quota/money.

### The keys in this project

- `GOOGLE_GENERATIVE_AI_API_KEY` — free key from Google AI Studio
  (aistudio.google.com → Get API key). This is the **primary** key.
- `MISTRAL_API_KEY` — free key from Mistral (console.mistral.ai). This is the
  **fallback**: if Gemini's quota runs out mid-demo, the app automatically
  switches to Mistral's `mistral-small-latest` model and keeps working.
- Optional: `GOOGLE_GENERATIVE_AI_API_KEY_2` / `_3` — extra Gemini keys from
  other Google accounts can be slotted in before the Mistral fallback.
- Stored as **environment variables** (a value the OS/hosting platform gives
  the running program — like `System.getenv()` in Java or values in
  `application.properties`, but never committed to the repo).
- Locally they live in `.env.local` / `.env.development.local` — these files
  are in `.gitignore`, so they **never reach GitHub**.
- The route code never mentions any key: `lib/gemini.ts` builds the provider
  chain from the env vars. If asked "where's the key in the code?" — the
  correct answer is "nowhere, by design."

### API key failover (a strong talking point)

`lib/gemini.ts` implements a **failover chain** (like a backup generator):

1. Every AI call goes through one function: `generateWithFailover()`.
2. It tries the primary Gemini key first.
3. If — and only if — the error is a **quota/rate-limit error (HTTP 429)**, it
   retries the exact same request with the next key in the chain, ending with
   Mistral (a completely different AI company).
4. Any other error (bad PDF, invalid request) is NOT retried — a different key
   wouldn't fix a broken PDF, it would just waste quota.

Why the cross-provider switch works: the AI SDK gives every provider the same
interface (in Java terms: `GoogleProvider` and `MistralProvider` both implement
the same `LanguageModel` interface), and the Zod schema is enforced identically
no matter which model answers. Interviewer phrase: "the app has no single point
of failure on the AI vendor side."

### Free-tier limits (Gemini, as of mid-2026 — check ai.google.dev/pricing)

- Roughly **10–15 requests/minute** and **~250–1500 requests/day** for the Flash
  models (exact numbers change; the class of limit matters, not the digits).
- Each Analyse / Deep Analyse / Ask = 1 request. Fine for a demo; a production
  fintech app would use a paid tier + rate limiting per user.
- When exceeded, Google returns HTTP **429** ("Too Many Requests") — our route
  catches it and shows: "The AI service is rate-limited right now."

### "API called from the backend, not the frontend" — the assignment requirement

This was an explicit requirement in the take-home document, and it's the single
most important architectural point:

- **Wrong way**: browser JavaScript calls Gemini directly. The key must then be
  embedded in the page → anyone opens DevTools → Network tab → copies your key
  → drains your quota or your credit card.
- **Right way (what we did)**: browser calls **our own** `/api/analyze`. Our
  server holds the key and calls Gemini. The key never leaves the server.
- Bonus reasons: the server can validate/limit/log every request, and CORS
  (browser security policy restricting cross-site requests) often blocks
  direct browser→third-party calls anyway.
- **Fintech angle for Finzly**: this is the same principle as payment systems —
  credentials and money-moving logic live server-side; the client is untrusted.

### How the data actually flows (fetching)

1. Browser `fetch()` → our API route (JSON or multipart over HTTP POST).
2. Server `fetch()` → downloads the PDF bytes (for URL mode) into an
   `ArrayBuffer` (a raw byte array, like Java's `byte[]`).
3. AI SDK → HTTPS POST to Google's API with the prompt + PDF bytes
   (base64-encoded), authenticated with the key in a header.
4. Gemini's response (JSON text) → validated against the Zod schema → typed
   object → returned to browser → rendered.

---

## 8. Hosting the Project — Platforms and Costs

| Platform | Free tier? | Notes |
|---|---|---|
| **Vercel** (recommended) | Yes — generous Hobby plan, no card needed | Made by the Next.js creators; zero config. Pro is ~$20/mo — not needed for this. |
| **Netlify** | Yes | Similar; Next.js support is good but second-class vs Vercel. |
| **Railway / Render** | Free trial / limited free | Run it as a Node server; slightly more setup. |
| **AWS Amplify / GCP Cloud Run** | Pay-as-you-go (pennies at demo scale) | Enterprise-grade; worth mentioning as "what a fintech might use with compliance controls". |
| **GitHub Pages** | Yes but **won't work** | Static-only hosting — our API routes need a server. Good trap-question answer. |

### Deploy to Vercel (the 5-minute path)

1. Push code to GitHub (next section).
2. vercel.com → sign in with GitHub → "Add New Project" → import the repo.
3. Vercel auto-detects Next.js. Before deploying, add the environment variable:
   Settings → Environment Variables → `GOOGLE_GENERATIVE_AI_API_KEY` = your key.
4. Deploy → you get `https://your-project.vercel.app`, HTTPS included, redeploys
   automatically on every `git push` (CI/CD — continuous integration/deployment,
   automatic build-and-release on each code change).

**Note in our code:** `export const maxDuration = 60` at the top of the API
routes raises Vercel's serverless function timeout (default ~10s) because
PDF download + AI inference can be slow. "Serverless" = your code runs in
short-lived containers spun up per request — you rent execution time, not a
whole machine (vs. a Tomcat server that runs 24/7).

---

## 9. Putting the Project on GitHub

This chat is already connected to the repo `ESAHAL/finzly-interview-project`
(work happens on a feature branch). For your interview, be able to explain the
generic manual process:

```bash
# 1. One-time setup (identity)
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"

# 2. In the project folder — initialize a repository (if starting fresh)
git init

# 3. CRITICAL: make sure .gitignore contains these lines BEFORE committing
#    .env*          ← your API key must never be committed
#    node_modules/  ← dependencies are restored from package.json, never stored

# 4. Stage and commit (a commit = a saved snapshot of the code)
git add .
git commit -m "PDF analyser take-home assignment"

# 5. Create an empty repo on github.com (no README), then link and push
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

- `git add` = stage changes → `git commit` = snapshot locally → `git push` =
  upload snapshots to GitHub (like SVN commit, but local-first).
- **If you ever accidentally commit an API key: revoke it and generate a new
  one.** Deleting the file in a later commit does NOT remove it from history.
- Whoever clones the repo runs `pnpm install` (restores dependencies from
  `package.json`, like `mvn install`), creates their own `.env.local` with their
  own key, and runs `pnpm dev`.

---

## 10. Points to Cover When Presenting (Suggested Order)

1. **The requirement** — restate it: PDF in → structured AI analysis out, with
   the explicit constraint that the AI API is called from the backend.
2. **Architecture in one sentence** — "Next.js app: React frontend, two API
   routes on the server, shared Zod schema as the single data contract, Gemini
   2.5 Flash through the AI SDK."
3. **Walk the flow chart** (Section 5) — input → validation → guardrails →
   AI call → schema validation → render.
4. **Security decisions** — key server-side only; magic-byte file verification;
   size/time limits; enum-validated options (prompt-injection defense);
   client checks are UX, server checks are security.
5. **Structured output** — why `Output.object({ schema })` beats "please return
   JSON" in a prompt: guaranteed shape, no regex parsing, type-safe end to end.
6. **The bonus features** — drag-and-drop, Deep Analyse (schema extension),
   Q&A with `foundInPdf` guardrail, history, copy JSON, font switcher — and the
   *reasoning* behind each (that's what impresses, not the feature itself).
7. **Live demo including a failure** — analyse a real paper, ask an in-PDF and
   an off-PDF question (show the warning), then feed it a fake PDF to show the
   415 error. Demoing graceful failure is a senior-engineer move.
8. **What you'd do next** — streaming output, persistent history in Postgres,
   SSRF hardening (blocking internal-network URLs), per-user rate limiting,
   unit tests with a mocked model.

---

## 11. Honest-Answer Bank (If Asked Directly)

- **"Did you use AI to build this?"** — Be honest: "I used an AI coding
  assistant, the same way I'd use Stack Overflow or a senior colleague — but I
  can explain every line, every decision, and every trade-off." Then prove it.
  Interviewers in 2026 expect AI-assisted work; what they screen for is whether
  you *understand* it.
- **"Why Next.js and not Java/Spring?"** — "The assignment is a small full-stack
  web app; Next.js gives frontend + backend in one deployable with zero config.
  In a Java shop I'd build the same architecture: a REST controller holding the
  key, DTO validation, and the same guardrails — the concepts transfer 1:1."
- **"Why Gemini?"** — "It reads PDFs natively (no text-extraction library
  needed), has a huge context window, a free tier for prototyping, and through
  the AI SDK I can swap providers in one line if pricing or quality changes."
