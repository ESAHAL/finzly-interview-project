'use client'

import { useRef, useState } from 'react'
import type { Analysis } from '@/lib/analysis'

const SAMPLE_URL = 'https://arxiv.org/pdf/1706.03762'
const MAX_PDF_BYTES = 25 * 1024 * 1024 // keep in sync with the API route

type Status = 'idle' | 'loading' | 'success' | 'error'
type Mode = 'url' | 'upload'

interface HistoryEntry {
  id: number
  source: string
  analysis: Analysis
}

export function PdfAnalyzer() {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function runAnalysis(request: () => Promise<Response>, sourceLabel: string) {
    if (status === 'loading') return

    setStatus('loading')
    setError('')
    setAnalysis(null)
    setCopied(false)

    try {
      const res = await request()
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.')
      }

      setAnalysis(data.analysis)
      setStatus('success')
      setHistory((prev) =>
        [{ id: Date.now(), source: sourceLabel, analysis: data.analysis as Analysis }, ...prev].slice(0, 5),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  function handleUrlSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    runAnalysis(
      () =>
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        }),
      trimmed,
    )
  }

  function handleFile(file: File) {
    if (status === 'loading') return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported. Please choose a .pdf file.')
      setStatus('error')
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('This PDF is too large (limit is 25 MB).')
      setStatus('error')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    runAnalysis(() => fetch('/api/analyze', { method: 'POST', body: formData }), file.name)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function copyJson() {
    if (!analysis) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (e.g. permissions) — fail silently.
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Input card */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        {/* Mode tabs */}
        <div role="tablist" aria-label="Input method" className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            role="tab"
            aria-selected={mode === 'url'}
            onClick={() => setMode('url')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'url' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            From URL
          </button>
          <button
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => setMode('upload')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Upload file
          </button>
        </div>

        {mode === 'url' ? (
          <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
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
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
              isDragging ? 'border-primary bg-accent' : 'border-border bg-background'
            }`}
          >
            <svg
              aria-hidden="true"
              className="size-8 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm text-foreground">
              {status === 'loading' ? 'Analysing your PDF…' : 'Drag & drop a PDF here'}
            </p>
            <p className="text-xs text-muted-foreground">Max 25 MB · PDF only</p>
            <button
              type="button"
              disabled={status === 'loading'}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>

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
            Processing the PDF and running the AI analysis. This can take up to a minute for large documents.
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-destructive">Analysis failed</p>
          <p className="mt-2 text-sm text-foreground">{error}</p>
        </div>
      )}

      {/* Results */}
      {status === 'success' && analysis && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-accent px-6 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-accent-foreground">Analysis result</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={copyJson}
                className="font-mono text-xs text-accent-foreground underline underline-offset-2 hover:opacity-80"
              >
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
              <p className="font-mono text-xs text-accent-foreground">gemini-2.5-flash</p>
            </div>
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

      {/* Session history */}
      {history.length > 1 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Recent analyses (this session)
          </h2>
          <ul className="flex flex-col gap-2">
            {history.slice(1).map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAnalysis(entry.analysis)
                    setStatus('success')
                    setCopied(false)
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-medium text-foreground">{entry.analysis.title}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{entry.source}</span>
                </button>
              </li>
            ))}
          </ul>
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
