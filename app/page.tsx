import { PdfAnalyzer } from '@/components/pdf-analyzer'

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground"
            >
              P
            </span>
            <span className="text-sm font-semibold tracking-tight">PDF Analyser</span>
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            AI Document Analysis
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Understand any PDF in seconds
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
            Paste a link to any publicly accessible PDF. The document is analysed server-side by
            Google Gemini and returned as a structured breakdown: type, title, authors, summary,
            and key takeaway.
          </p>
        </div>

        <PdfAnalyzer />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <p className="font-mono text-xs text-muted-foreground">
            Next.js · AI SDK · Google Gemini · Deployed on Vercel
          </p>
        </div>
      </footer>
    </div>
  )
}
