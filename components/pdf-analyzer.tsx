'use client'

import { useRef, useState } from 'react'
import type { Analysis, AnalysisOptions, ExtendedAnalysis, QaResult } from '@/lib/analysis'
import { OUTPUT_LANGUAGES } from '@/lib/analysis'
import { useI18n } from '@/lib/i18n'

const SAMPLE_URL = 'https://arxiv.org/pdf/1706.03762'
const MAX_PDF_BYTES = 25 * 1024 * 1024 // keep in sync with the API route

type Status = 'idle' | 'loading' | 'success' | 'error'
type Mode = 'url' | 'upload'
type ResultFont = 'sans' | 'serif' | 'mono'

type AnyAnalysis = Analysis & Partial<ExtendedAnalysis>

/** The PDF that was last analysed, kept so follow-up questions can reference it. */
type PdfSource = { kind: 'url'; url: string } | { kind: 'file'; file: File }

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
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<AnyAnalysis | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resultFont, setResultFont] = useState<ResultFont>('sans')
  const [deepMode, setDeepMode] = useState(false)
  const [language, setLanguage] = useState<AnalysisOptions['language']>('English')
  const [summaryLength, setSummaryLength] = useState<AnalysisOptions['summaryLength']>('standard')
  const [takeawayLength, setTakeawayLength] = useState<AnalysisOptions['takeawayLength']>('one')
  const [source, setSource] = useState<PdfSource | null>(null)
  const [question, setQuestion] = useState('')
  const [qaStatus, setQaStatus] = useState<Status>('idle')
  const [qaError, setQaError] = useState('')
  const [qaResult, setQaResult] = useState<QaResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingExtended = useRef(false)

  function currentOptions(extended: boolean): AnalysisOptions {
    // Plain Analyse always uses defaults; the tuning options only apply to Deep Analyse.
    if (!extended) {
      return { language: 'English', summaryLength: 'standard', takeawayLength: 'one', extended: false }
    }
    return { language, summaryLength, takeawayLength, extended }
  }

  async function runAnalysis(request: () => Promise<Response>, sourceLabel: string, pdfSource: PdfSource) {
    if (status === 'loading') return

    setStatus('loading')
    setError('')
    setAnalysis(null)
    setCopied(false)
    // Reset the Q&A panel — it must always refer to the current document.
    setSource(null)
    setQuestion('')
    setQaStatus('idle')
    setQaResult(null)
    setQaError('')

    try {
      const res = await request()
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.')
      }

      setAnalysis(data.analysis)
      setStatus('success')
      setSource(pdfSource)
      setHistory((prev) =>
        [{ id: Date.now(), source: sourceLabel, analysis: data.analysis as AnyAnalysis }, ...prev].slice(0, 5),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  async function handleAsk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || !source || qaStatus === 'loading') return

    setQaStatus('loading')
    setQaError('')
    setQaResult(null)

    try {
      let res: Response
      if (source.kind === 'url') {
        res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: source.url, question: trimmed }),
        })
      } else {
        const formData = new FormData()
        formData.append('file', source.file)
        formData.append('question', trimmed)
        res = await fetch('/api/ask', { method: 'POST', body: formData })
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.')
      }

      setQaResult(data.result as QaResult)
      setQaStatus('success')
    } catch (err) {
      setQaError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setQaStatus('error')
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
      { kind: 'url', url: trimmed },
    )
  }

  function handleUrlSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submitUrl(false)
  }

  function handleFile(file: File, extended: boolean) {
    if (status === 'loading') return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError(t('errorOnlyPdf'))
      setStatus('error')
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(t('errorTooLarge'))
      setStatus('error')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('options', JSON.stringify(currentOptions(extended)))
    runAnalysis(() => fetch('/api/analyze', { method: 'POST', body: formData }), file.name, {
      kind: 'file',
      file,
    })
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
            {t('fromUrl')}
          </button>
          <button
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => setMode('upload')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('uploadFile')}
          </button>
        </div>

        {mode === 'url' ? (
          <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pdf-url" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {t('pdfUrl')}
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
                        {t('analysing')}
                      </>
                    ) : (
                      t('analyse')
                    )}
                  </button>
                  <button
                    type="button"
                    aria-expanded={deepMode}
                    onClick={() => {
                      if (!deepMode) {
                        setDeepMode(true)
                        return
                      }
                      submitUrl(true)
                    }}
                    disabled={status === 'loading' || (deepMode && !url.trim())}
                    className={`inline-flex h-11 items-center justify-center rounded-lg border border-primary px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      deepMode
                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                        : 'bg-background text-primary hover:bg-accent'
                    }`}
                  >
                    {deepMode ? t('runDeepAnalyse') : t('deepAnalyse')}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('trySample')}{' '}
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
                {status === 'loading' ? t('analysingPdf') : t('dragDrop')}
              </p>
              <p className="text-xs text-muted-foreground">{t('maxSize')}</p>
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
                  {t('browseFiles')}
                </button>
                <button
                  type="button"
                  aria-expanded={deepMode}
                  disabled={status === 'loading'}
                  onClick={() => {
                    if (!deepMode) {
                      setDeepMode(true)
                      return
                    }
                    pendingExtended.current = true
                    fileInputRef.current?.click()
                  }}
                  className={`inline-flex h-10 items-center justify-center rounded-lg border border-primary px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    deepMode
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-background text-primary hover:bg-accent'
                  }`}
                >
                  {deepMode ? t('chooseFileDeep') : t('deepAnalyse')}
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

        {/* Deep Analyse options — only visible once Deep Analyse is activated */}
        {deepMode && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t('deepOptions')}</p>
              <button
                type="button"
                onClick={() => setDeepMode(false)}
                className="font-mono text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              >
                {t('cancel')}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <OptionSelect
                id="opt-language"
                label={t('outputLanguage')}
                value={language}
                onChange={(v) => setLanguage(v as AnalysisOptions['language'])}
                options={OUTPUT_LANGUAGES.map((l) => ({ value: l, label: l }))}
                disabled={status === 'loading'}
              />
              <OptionSelect
                id="opt-summary"
                label={t('summaryLength')}
                value={summaryLength}
                onChange={(v) => setSummaryLength(v as AnalysisOptions['summaryLength'])}
                options={[
                  { value: 'brief', label: t('brief') },
                  { value: 'standard', label: t('standard') },
                  { value: 'detailed', label: t('detailed') },
                ]}
                disabled={status === 'loading'}
              />
              <OptionSelect
                id="opt-takeaway"
                label={t('keyTakeawayOpt')}
                value={takeawayLength}
                onChange={(v) => setTakeawayLength(v as AnalysisOptions['takeawayLength'])}
                options={[
                  { value: 'one', label: t('oneSentence') },
                  { value: 'two', label: t('twoSentences') },
                  { value: 'three', label: t('threeSentences') },
                ]}
                disabled={status === 'loading'}
              />
            </div>
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
          <p className="text-sm text-muted-foreground">{t('loadingNote')}</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-destructive">{t('analysisFailed')}</p>
          <p className="mt-2 text-sm text-foreground">{error}</p>
        </div>
      )}

      {/* Results */}
      {status === 'success' && analysis && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent px-6 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-accent-foreground">
              {isExtendedResult ? t('deepAnalysis') : t('analysisResult')}
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
                {copied ? t('copied') : t('copyJson')}
              </button>
              <p className="font-mono text-xs text-accent-foreground">gemini-2.5-flash</p>
            </div>
          </div>
          <dl className={`divide-y divide-border ${FONT_CLASSES[resultFont]}`}>
            <ResultRow label={t('documentType')} value={analysis.documentType} />
            <ResultRow label={t('titleLabel')} value={analysis.title} emphasize />
            <ResultRow label={t('authors')} value={analysis.authors} />
            <ResultRow label={t('summary')} value={analysis.summary} />
            <ResultRow label={t('keyTakeaway')} value={analysis.keyTakeaway} />
            {isExtendedResult && (
              <>
                <div className="grid gap-1 px-6 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
                  <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground sm:pt-0.5">
                    {t('keyTopics')}
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
                {analysis.tone && <ResultRow label={t('tone')} value={analysis.tone} />}
                {analysis.targetAudience && <ResultRow label={t('audience')} value={analysis.targetAudience} />}
              </>
            )}
          </dl>
        </div>
      )}

      {/* Ask this PDF */}
      {status === 'success' && analysis && source && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t('askThisPdf')}</h2>
            <p className="text-sm text-muted-foreground">{t('askDesc')}</p>
          </div>
          <form onSubmit={handleAsk} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder={t('askPlaceholder')}
              disabled={qaStatus === 'loading'}
              aria-label="Question about the PDF"
              className="h-11 flex-1 rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={qaStatus === 'loading' || !question.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {qaStatus === 'loading' ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                  />
                  {t('searchingPdf')}
                </>
              ) : (
                t('ask')
              )}
            </button>
          </form>

          {qaStatus === 'error' && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-foreground">{qaError}</p>
            </div>
          )}

          {qaStatus === 'success' && qaResult && (
            <div className="flex flex-col gap-3">
              {qaResult.foundInPdf ? (
                <div className="rounded-lg border border-border bg-accent p-4">
                  <p className="font-mono text-xs uppercase tracking-widest text-accent-foreground">
                    {t('answerFromPdf')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground text-pretty">{qaResult.answer}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="font-mono text-xs uppercase tracking-widest text-destructive">
                    {t('warningNotFound')}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{t('notFoundDesc')}</p>
                  <p className="mt-3 border-t border-destructive/20 pt-3 text-sm leading-relaxed text-foreground text-pretty">
                    {qaResult.answer}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Session history */}
      {history.length > 1 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t('recentAnalyses')}</h2>
          <ul className="flex flex-col gap-2">
            {history.slice(1).map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAnalysis(entry.analysis)
                    setStatus('success')
                    setCopied(false)
                    // A restored history entry is not the currently loaded PDF,
                    // so hide the Q&A panel to avoid answering against the wrong document.
                    setSource(null)
                    setQaStatus('idle')
                    setQaResult(null)
                    setQuestion('')
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
