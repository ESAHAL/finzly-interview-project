'use client'

import { useRef, useState } from 'react'
import type { Analysis, AnalysisOptions, ExtendedAnalysis } from '@/lib/analysis'
import { OUTPUT_LANGUAGES } from '@/lib/analysis'

const SAMPLE_URL = 'https://arxiv.org/pdf/1706.03762'
const MAX_PDF_BYTES = 25 * 1024 * 1024 // keep in sync with the API route

type Status = 'idle' | 'loading' | 'success' | 'error'
type Mode = 'url' | 'upload'
type ResultFont = 'sans' | 'serif' | 'mono'

type AnyAnalysis = Analysis & Partial<ExtendedAnalysis>

interface HistoryEntry {
  id: number
  source: string
  analysis: AnyAnalysis
}

const FONT_CLASSES: Record<ResultFont, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
}

export function PdfAnalyzer() {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<AnyAnalysis | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resultFont, setResultFont] = useState<ResultFont>('sans')
  const [showOptions, setShowOptions] = useState(false)
  const [language, setLanguage] = useState<AnalysisOptions['language']>('English')
  const [summaryLength, setSummaryLength] = useState<AnalysisOptions['summaryLength']>('standard')
  const [takeawayLength, setTakeawayLength] = useState<AnalysisOptions['takeawayLength']>('one')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingExtended = useRef(false)

  function currentOptions(extended: boolean): AnalysisOptions {
    return { language, summaryLength, takeawayLength, extended }
  }

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
        [{ id: Date.now(), source: sourceLabel, analysis: data.analysis as AnyAnalysis }, ...prev].slice(0, 5),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  function submitUrl(extended: boolean) {
    const trimmed = url.trim()
    if (!trimmed) return
    runAnalysis(
      () =>
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed, options: currentOptions(extended) }),
        }),
      trimmed,
    )
  }

  function handleUrlSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submitUrl(false)
  }

  function handleFile(file: File, extended: boolean) {
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
    formData.append('options', JSON.stringify(currentOptions(extended)))
    runAnalysis(() => fetch('/api/analyze', { method: 'POST', body: formData }), file.name)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file, false)
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

  const isExtendedResult = analysis != null && Array.isArray(analysis.keyTopics)

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
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={status === 'loading' || !url.trim()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <button
                    type="button"
                    onClick={() => submitUrl(true)}
                    disabled={status === 'loading' || !url.trim()}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-primary bg-background px-5 text-sm font-medium text-primary transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Extended Analyse
                  </button>
                </div>
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
          <div className="flex flex-col gap-3">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
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
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={status === 'loading'}
                  onClick={() => {
                    pendingExtended.current = false
                    fileInputRef.current?.click()
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Browse files
                </button>
                <button
                  type="button"
                  disabled={status === 'loading'}
                  onClick={() => {
                    pendingExtended.current = true
                    fileInputRef.current?.click()
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-primary bg-background px-5 text-sm font-medium text-primary transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Extended Analyse
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file, pendingExtended.current)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}

        {/* Options panel */}
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
            className="flex items-center gap-2 self-start font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              aria-hidden="true"
              className={`size-3.5 transition-transform ${showOptions ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            Analysis options
          </button>

          {showOptions && (
            <div className="grid gap-4 sm:grid-cols-3">
              <OptionSelect
                id="opt-language"
                label="Output language"
                value={language}
                onChange={(v) => setLanguage(v as AnalysisOptions['language'])}
                options={OUTPUT_LANGUAGES.map((l) => ({ value: l, label: l }))}
                disabled={status === 'loading'}
              />
              <OptionSelect
                id="opt-summary"
                label="Summary length"
                value={summaryLength}
                onChange={(v) => setSummaryLength(v as AnalysisOptions['summaryLength'])}
                options={[
                  { value: 'brief', label: 'Brief (1-2 sentences)' },
                  { value: 'standard', label: 'Standard (2-3 sentences)' },
                  { value: 'detailed', label: 'Detailed (5-7 sentences)' },
                ]}
                disabled={status === 'loading'}
              />
              <OptionSelect
                id="opt-takeaway"
                label="Key takeaway"
                value={takeawayLength}
                onChange={(v) => setTakeawayLength(v as AnalysisOptions['takeawayLength'])}
                options={[
                  { value: 'one', label: '1 sentence' },
                  { value: 'two', label: '2 sentences' },
                  { value: 'three', label: '3 sentences' },
                ]}
                disabled={status === 'loading'}
              />
            </div>
          )}
        </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent px-6 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-accent-foreground">
              {isExtendedResult ? 'Extended analysis' : 'Analysis result'}
            </p>
            <div className="flex items-center gap-4">
              {/* Result font switcher */}
              <div role="group" aria-label="Result font" className="flex gap-1 rounded-md bg-card p-0.5">
                {(['sans', 'serif', 'mono'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={resultFont === f}
                    onClick={() => setResultFont(f)}
                    className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                      resultFont === f
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    } ${FONT_CLASSES[f]}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
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
          <dl className={`divide-y divide-border ${FONT_CLASSES[resultFont]}`}>
            <ResultRow label="Document Type" value={analysis.documentType} />
            <ResultRow label="Title" value={analysis.title} emphasize />
            <ResultRow label="Authors" value={analysis.authors} />
            <ResultRow label="Summary" value={analysis.summary} />
            <ResultRow label="Key Takeaway" value={analysis.keyTakeaway} />
            {isExtendedResult && (
              <>
                <div className="grid gap-1 px-6 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
                  <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground sm:pt-0.5">
                    Key Topics
                  </dt>
                  <dd className="flex flex-wrap gap-2">
                    {analysis.keyTopics?.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                      >
                        {topic}
                      </span>
                    ))}
                  </dd>
                </div>
                {analysis.tone && <ResultRow label="Tone" value={analysis.tone} />}
                {analysis.targetAudience && <ResultRow label="Audience" value={analysis.targetAudience} />}
                {analysis.suggestedQuestions && analysis.suggestedQuestions.length > 0 && (
                  <div className="grid gap-1 px-6 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
                    <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground sm:pt-0.5">
                      Questions
                    </dt>
                    <dd>
                      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed text-foreground">
                        {analysis.suggestedQuestions.map((q) => (
                          <li key={q} className="text-pretty">
                            {q}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </>
            )}
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

function OptionSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
