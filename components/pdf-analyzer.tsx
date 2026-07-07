'use client'

import { useState } from 'react'
import type { Analysis } from '@/lib/analysis'

const SAMPLE_URL = 'https://arxiv.org/pdf/1706.03762'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function PdfAnalyzer() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === 'loading' || !url.trim()) return

    setStatus('loading')
    setError('')
    setAnalysis(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.')
      }

      setAnalysis(data.analysis)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Input card */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pdf-url" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            PDF URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="pdf-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://arxiv.org/pdf/1706.03762"
              disabled={status === 'loading'}
              className="h-11 flex-1 rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === 'loading' || !url.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'loading' ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                  />
                  Analysing…
                </>
              ) : (
                'Analyse'
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {'Try the sample: '}
          <button
            type="button"
            onClick={() => setUrl(SAMPLE_URL)}
            className="font-mono text-accent-foreground underline underline-offset-2 hover:opacity-80"
          >
            {SAMPLE_URL}
          </button>
        </p>
      </form>

      {/* Loading state */}
      {status === 'loading' && (
        <div
          role="status"
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          aria-label="Analysing document"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <p className="text-sm text-muted-foreground">
            Downloading the PDF and running the AI analysis. This can take up to a minute for large documents.
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-6"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-destructive">Analysis failed</p>
          <p className="mt-2 text-sm text-foreground">{error}</p>
        </div>
      )}

      {/* Results */}
      {status === 'success' && analysis && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-accent px-6 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-accent-foreground">Analysis result</p>
            <p className="font-mono text-xs text-accent-foreground">gemini-2.5-flash</p>
          </div>
          <dl className="divide-y divide-border">
            <ResultRow label="Document Type" value={analysis.documentType} />
            <ResultRow label="Title" value={analysis.title} emphasize />
            <ResultRow label="Authors" value={analysis.authors} />
            <ResultRow label="Summary" value={analysis.summary} />
            <ResultRow label="Key Takeaway" value={analysis.keyTakeaway} />
          </dl>
        </div>
      )}
    </div>
  )
}

function ResultRow({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="grid gap-1 px-6 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd
        className={
          emphasize
            ? 'text-base font-semibold leading-relaxed text-foreground text-pretty'
            : 'text-sm leading-relaxed text-foreground text-pretty'
        }
      >
        {value}
      </dd>
    </div>
  )
}
