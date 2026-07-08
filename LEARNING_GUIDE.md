# The Complete Learning Guide

Everything important about this project — and the world around it — explained in easy language. Read this alongside `PROJECT_GUIDE.md` (which covers the code file-by-file).

---

## Table of Contents

1. [What is an API and an API key?](#1-what-is-an-api-and-an-api-key)
2. [Where is our API key stored?](#2-where-is-our-api-key-stored)
3. [What is an LLM? (easy version)](#3-what-is-an-llm-easy-version)
4. [Which AI model do we use and why?](#4-which-ai-model-do-we-use-and-why)
5. [How data flows through our app (step by step)](#5-how-data-flows-through-our-app-step-by-step)
6. [Frontend vs Backend — why the key must stay in the backend](#6-frontend-vs-backend)
7. [Where Finzly can use AI in their company](#7-where-finzly-can-use-ai)
8. [What is Docker?](#8-what-is-docker)
9. [What is Kubernetes?](#9-what-is-kubernetes)
10. [How to host a website (all the ways)](#10-how-to-host-a-website)
11. [Quick glossary](#11-quick-glossary)

---

## 1. What is an API and an API key?

**API (Application Programming Interface)** = a way for two programs to talk to each other over the internet.

Think of a restaurant:
- You (the customer) don't walk into the kitchen and cook.
- You give your order to a **waiter** (the API), the kitchen (the server) makes it, and the waiter brings it back.

When our app wants Gemini to analyse a PDF, it doesn't run the AI itself. It sends a request ("here's a PDF, analyse it") to Google's API, and Google sends the answer back.

**API key** = your membership card for the API.
- It tells Google *who* is making the request (so they know whose quota/bill to count it against).
- Anyone who has your key can pretend to be you — that's why it must be kept secret, like a password.

---

## 2. Where is our API key stored?

Our key is `GOOGLE_GENERATIVE_AI_API_KEY`. It lives in **environment variables** (a set of name→value pairs the operating system gives to a program when it starts — like configuration that lives *outside* the code).

| Place | File / location | Committed to git? |
|---|---|---|
| Local development | `.env.local` file in project root | **No** — it's in `.gitignore` |
| Production (Vercel) | Project Settings → Environment Variables (stored on Vercel's servers) | No — never touches the repo |

The code never contains the key. In `app/api/analyze/route.ts` you won't find the key anywhere — the AI SDK's Google provider automatically reads `process.env.GOOGLE_GENERATIVE_AI_API_KEY` (Java equivalent: `System.getenv("GOOGLE_GENERATIVE_AI_API_KEY")`).

**Why this matters:** if the key were written in the code and pushed to GitHub, anyone could copy it and use your quota (or run up your bill). Bots scan public GitHub repos for leaked keys constantly — leaked keys get abused within minutes.

---

## 3. What is an LLM? (easy version)

**LLM = Large Language Model.** It's the technology behind ChatGPT, Gemini, Claude, etc.

**How it works (simplified):**
1. It was trained by reading a gigantic amount of text (books, websites, papers).
2. From that, it learned patterns: which words tend to follow which words, in which contexts.
3. When you give it input, it predicts the most likely next word, then the next, then the next — very fast. That's how it "writes."

**Important concepts:**

- **Token** — the unit LLMs read/write. Roughly ¾ of a word (the word "analysing" might be 2–3 tokens). You are billed and rate-limited by tokens. This is why we prefer *small PDFs* — a big PDF = many tokens = more quota used per request.
- **Context window** — how much the model can "hold in its head" at once (input + output). Gemini 2.5 Flash has a ~1 million token window — big enough for entire books, which is why it can read our whole PDF at once.
- **Hallucination** — when the model confidently makes something up. LLMs predict *plausible* text, not *true* text. Our "Ask this PDF" feature has a guardrail for exactly this: the model must declare whether its answer came from the PDF (`foundInPdf: true/false`), and the UI shows a clear warning if it didn't.
- **Multimodal** — a model that accepts more than text (images, PDFs, audio). Gemini is multimodal — that's why we can send it the raw PDF file directly, without extracting the text ourselves first. It even "sees" tables and layout.
- **Prompt** — the instruction you give the model. Our prompt is built in `buildPrompt()` in the analyze route: "You are a precise document analyst. Analyse the provided PDF…"
- **Structured output** — instead of letting the model reply in free-flowing prose, we force it to fill a fixed JSON shape (our Zod schema). Like giving someone a form to fill instead of asking them to write an essay.

---

## 4. Which AI model do we use and why?

We use **`gemini-2.5-flash`** by Google.

| Reason | Explanation |
|---|---|
| Multimodal | Reads raw PDFs natively — no separate text-extraction library needed |
| Huge context window | ~1M tokens — fits entire long documents in one request |
| "Flash" = fast + cheap | Google's model family has tiers: Pro (smartest, slowest, priciest) and Flash (fast, cheap, still very capable). For summarisation, Flash is the right trade-off |
| Free tier | Works with a free Google AI Studio key — perfect for a take-home assignment |

**Model families you should know (interview trivia):**
- **Google:** Gemini (Pro / Flash)
- **OpenAI:** GPT family (ChatGPT)
- **Anthropic:** Claude
- **Meta:** Llama (open-source — you can run it on your own servers)
- **Mistral:** open-source European models

**Vercel AI SDK bonus point:** our code calls the model through the AI SDK (a wrapper library). Swapping Gemini for GPT or Claude would be a ~2 line change (`google('gemini-2.5-flash')` → `openai('gpt-...')`), because the SDK gives every provider the same interface. Java analogy: it's like JDBC — same interface, swappable drivers.

---

## 5. How data flows through our app (step by step)

```
┌──────────────────────────── BROWSER (frontend) ────────────────────────────┐
│                                                                            │
│  1. User pastes PDF URL (or drops a file) and clicks "Analyse"             │
│  2. React sets status = "loading" → spinner appears                        │
│  3. fetch() sends HTTP POST to our own backend:                            │
│        /api/analyze   body: { url: "https://...", options: {...} }         │
│                                                                            │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │  (JSON over HTTPS)
┌───────────────────────────────────▼────────────────────────────────────────┐
│                     OUR SERVER (Next.js route handler)                     │
│                                                                            │
│  4. Validate the URL format (is it even a valid http(s) URL?)              │
│  5. Validate options against an allowlist (Zod enum — no prompt injection) │
│  6. Download the PDF from the URL (30s timeout, 25 MB size limit)          │
│  7. Check magic bytes — first 5 bytes must be "%PDF-" (is it REALLY a PDF?)│
│  8. Build the prompt text based on options (language, lengths, deep mode)  │
│  9. Call Gemini via AI SDK generateObject():                               │
│        - sends: prompt + the raw PDF bytes + the Zod schema               │
│        - the API key is attached here, server-side, invisibly              │
│                                                                            │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │  (HTTPS to Google's servers)
┌───────────────────────────────────▼────────────────────────────────────────┐
│                              GOOGLE GEMINI                                 │
│                                                                            │
│  10. Reads the PDF (multimodal — sees text, tables, layout)                │
│  11. Generates JSON matching our schema shape                              │
│                                                                            │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │  (JSON response)
┌───────────────────────────────────▼────────────────────────────────────────┐
│                     OUR SERVER (same route handler)                        │
│                                                                            │
│  12. Zod validates the response — if malformed, error, never reaches UI    │
│  13. Send clean JSON back to the browser: { analysis: {...} }              │
│                                                                            │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────────┐
│                              BROWSER again                                 │
│                                                                            │
│  14. React sets status = "success", stores the analysis in state           │
│  15. Result card renders: type, title, authors, summary, key takeaway      │
│  16. Entry added to session history; "Ask this PDF" panel appears          │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

If **anything** fails at steps 4–12, the server returns an error JSON with a specific message and HTTP status code (400 bad input, 415 not a PDF, 413 too large, 504 timeout, 429 quota), and the browser shows a friendly red error card. The app never crashes.

---

## 6. Frontend vs Backend

**The assignment's key requirement:** *"the LLM API call must be made from the backend, not the frontend."* Here's exactly what that means and why:

- **Frontend** = everything running in the user's browser. The user can see ALL of it — every file, every network request (press F12 → Network tab and you see everything the page sends and receives, including any secrets embedded in requests).
- **Backend** = code running on *your* server. The user only sees what you choose to send back — never your code, never your environment variables.

**If we called Gemini from the frontend:** the API key would have to be included in the browser's request to Google. Anyone could open DevTools, copy your key, and use it — draining your quota or your money. For a fintech company, this class of mistake (leaking credentials to the client) is disqualifying — which is why they made it an explicit requirement.

**Our solution:** the browser only ever talks to *our own* two endpoints (`/api/analyze`, `/api/ask`). Our server holds the key and talks to Google. The browser never sees anything Google-related.

---

## 7. Where Finzly can use AI

Finzly builds payment infrastructure for banks (money movement via ACH, Fedwire, RTP, SWIFT). Here's where this project's exact pattern — *unstructured document in → validated structured data out* — applies to their business. Great material for the "how would this apply to us?" interview question:

1. **Invoice & remittance processing** — payments arrive with PDF invoices or remittance advice attached. AI extracts amount, payee, invoice number, due date into structured data automatically → straight-through processing instead of manual data entry.

2. **KYC / customer onboarding** — banks must verify business documents (articles of incorporation, licenses, proof of address). AI reads the PDF, extracts entity name, registration numbers, dates, and flags mismatches → onboarding drops from days to minutes.

3. **Compliance & sanctions screening support** — summarise long regulatory documents (OFAC updates, Fed circulars, NACHA rule changes) into key takeaways for the compliance team — literally our Summary + Key Takeaway feature pointed at regulation PDFs.

4. **Payment exception handling** — when a wire fails or gets held, an analyst reads the case history to decide the next action. An LLM can summarise the case and suggest a next step, with a human approving (the "human-in-the-loop" pattern — important phrase in fintech AI).

5. **Fraud narrative generation** — fraud systems flag transactions with dozens of raw signals. An LLM turns the signals into a readable explanation ("flagged because: new payee + unusual amount + first international transfer") so analysts triage faster.

6. **Customer support copilot** — grounded Q&A over Finzly's own product documentation, exactly like our "Ask this PDF" feature — including the same guardrail: answer only from the docs, flag anything that isn't there.

7. **Contract intelligence** — bank↔client fee agreements are long PDFs. Extract fee schedules, SLAs, and termination clauses into structured data for the billing system.

**The one caveat to always mention:** in fintech, AI output that affects money movement or compliance must be validated (like our Zod schema) and typically kept human-in-the-loop. You never let a raw LLM answer move money. Saying this unprompted makes you sound senior.

---

## 8. What is Docker?

**Problem it solves:** "It works on my machine!" — code that runs on the developer's laptop but breaks on the server because of different OS, different Node version, different installed libraries.

**Docker's solution:** package your app **plus its entire environment** (OS libraries, Node.js version, dependencies, config) into one sealed box called a **container**. That box runs identically anywhere Docker is installed — your laptop, a colleague's Mac, an AWS server.

**Simple analogy:** a shipping container. Doesn't matter what's inside or which ship/truck/crane handles it — the container's standard shape means any infrastructure can move it. Docker does that for software.

**Key terms:**
- **Image** — the frozen template/blueprint (like a Java `.class` file, or a recipe).
- **Container** — a running instance of an image (like an object created from the class, or the cooked dish). One image → many identical containers.
- **Dockerfile** — a text file with the build steps: "start from Node 20, copy my code in, run `npm install`, start the app."

**A Dockerfile for this project would look like:**

```dockerfile
FROM node:20-alpine        # start from a small Linux + Node 20 base image
WORKDIR /app               # work inside /app folder
COPY . .                   # copy project files in
RUN npm install            # install dependencies
RUN npm run build          # build the Next.js app
CMD ["npm", "start"]       # command to run when the container starts
```

Then `docker build -t pdf-analyser .` creates the image and `docker run -p 3000:3000 -e GOOGLE_GENERATIVE_AI_API_KEY=xxx pdf-analyser` runs it (note: the API key is passed in as an environment variable at runtime — never baked into the image, same principle as always).

**Do we use Docker in this project?** No — Vercel handles the packaging for us. But if Finzly asked "how would you deploy this on our own servers?" the answer is: Dockerize it with roughly that Dockerfile.

---

## 9. What is Kubernetes?

**Problem it solves:** Docker runs one container fine. But real companies run **hundreds** of containers. Who restarts one when it crashes at 3 AM? Who adds more when traffic spikes? Who spreads them across servers so one server failure doesn't take everything down?

**Kubernetes (a.k.a. K8s)** is the **manager of containers** — "container orchestration." You tell it your desired state, it makes reality match:

> "I want 3 copies of the pdf-analyser container running at all times, spread across different machines, restart any that die, and add more copies automatically if CPU goes above 70%."

Kubernetes then does that, forever, without you watching.

**What it gives you:**
- **Self-healing** — container crashes → K8s starts a replacement automatically
- **Scaling** — traffic spike → more containers spun up; quiet → scaled back down
- **Load balancing** — spreads incoming requests across all your containers
- **Zero-downtime deploys** — new version rolls out one container at a time; if it's broken, automatic rollback

**Simple analogy:** if Docker containers are the shipping containers, Kubernetes is the **port authority** — deciding which ship carries what, replacing damaged containers, rerouting when a crane breaks.

**Do you need it for this project?** No — massive overkill for one small app (like hiring an orchestra conductor for one violinist). But banks like Finzly's customers absolutely run their payment platforms on Kubernetes, because payments cannot go down. Knowing *what it is and when it's overkill* is exactly the right level for your interview.

---

## 10. How to host a website

"Hosting" = putting your app on a computer that is always on and reachable from the internet. The options, from easiest to most control:

### Option A — Serverless platforms (what we use)
**Examples:** Vercel (ours), Netlify, AWS Amplify

- You push code to GitHub → the platform builds and deploys it automatically
- No server to manage at all — the platform runs your code on demand ("serverless" doesn't mean no servers; it means *you never think about the servers*)
- Scales automatically, HTTPS automatic, global CDN included
- **Cost:** free tier (ours costs $0); pay only when you get real traffic
- **Best for:** websites, apps like this one, startups

### Option B — VPS (Virtual Private Server)
**Examples:** DigitalOcean, Hetzner, AWS EC2, Linode

- You rent a virtual Linux machine (~$5–20/month) and do everything yourself: install Node, copy your code (often via Docker), configure a web server (nginx), set up HTTPS certificates, monitor it, patch it
- **Best for:** full control, custom software, learning how servers really work

### Option C — Cloud platforms (big three)
**Examples:** AWS, Google Cloud, Microsoft Azure

- Hundreds of services from raw machines to managed Kubernetes (EKS/GKE/AKS) to managed databases
- What enterprises (including fintechs) use; pay-as-you-go, can get expensive
- **Best for:** companies with dedicated infrastructure/DevOps teams

### Option D — Traditional shared hosting
**Examples:** GoDaddy, Hostinger

- Cheap, old-school; mainly for static sites, PHP, and WordPress — **cannot run a Next.js server app properly.** Not relevant for us.

### How OUR deployment works (say this in the interview)

1. Code is pushed to GitHub
2. Vercel is connected to the repo — every push triggers an automatic build and deploy (this is **CI/CD**: Continuous Integration / Continuous Deployment — the pipeline that automatically builds, tests, and ships your code on every change)
3. The API key is set in Vercel's dashboard as an environment variable — the production server gets it at runtime, the repo never contains it
4. Live at: `https://finzly-interview-project.vercel.app/` — HTTPS and CDN automatic, $0/month

**Subscription fees summary:**

| Platform | Free tier | Paid starts at |
|---|---|---|
| Vercel | Yes — generous (this project runs free) | $20/month (Pro) |
| Netlify | Yes | $19/month |
| DigitalOcean VPS | No | ~$5/month |
| AWS / GCP / Azure | 12-month limited free tier | Pay-as-you-go |
| Gemini API | Yes — free tier (with daily request limits) | Pay per token used |

---

## 11. Quick glossary

| Term | Easy meaning |
|---|---|
| API | A way for two programs to talk over the internet (the "waiter") |
| API key | Secret password identifying who is calling an API |
| Environment variable | Config value stored outside the code (where secrets live) |
| `.env.local` | Local file holding environment variables; never committed to git |
| LLM | Large Language Model — AI that reads and writes text (Gemini, GPT, Claude) |
| Token | The word-chunk unit LLMs are billed and limited by (~¾ of a word) |
| Context window | How much text a model can consider at once |
| Hallucination | When AI confidently makes something up |
| Multimodal | AI that accepts more than text (images, PDFs, audio) |
| Prompt | The instruction you give the AI |
| Structured output | Forcing AI to answer in a fixed JSON shape instead of free text |
| Zod | Library that checks data matches an expected shape (like Bean Validation in Java) |
| Frontend | Code running in the user's browser (user can see all of it) |
| Backend | Code running on your server (user sees none of it) |
| Route handler | A backend URL endpoint in Next.js (like a Spring `@PostMapping`) |
| HTTP status codes | 200 OK, 400 bad request, 413 too large, 415 wrong type, 429 rate limited, 504 timeout |
| Magic bytes | First bytes of a file identifying its real type (`%PDF-` for PDFs) |
| SSRF | Attack where a server is tricked into fetching internal URLs — why URL fetching needs care |
| Docker | Packages an app + its environment into a portable container |
| Image vs Container | Blueprint vs running instance (class vs object) |
| Kubernetes (K8s) | The manager that runs, heals, and scales many containers |
| Serverless | Hosting where the platform manages all servers for you (Vercel) |
| CDN | Network of servers worldwide caching your site close to users |
| CI/CD | Automatic build-test-deploy pipeline triggered by every git push |
| Human-in-the-loop | AI suggests, a human approves — mandatory pattern for fintech AI |
