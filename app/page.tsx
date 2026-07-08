'use client'

import { HeaderControls } from '@/components/header-controls'
import { PdfAnalyzer } from '@/components/pdf-analyzer'
import { useI18n } from '@/lib/i18n'

export default function Home() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground"
            >
              P
            </span>
            <span className="text-sm font-semibold tracking-tight">PDF Analyser</span>
            <span className="ml-2 hidden font-mono text-xs uppercase tracking-widest text-muted-foreground sm:inline">
              {t('tagline')}
            </span>
          </div>
          <HeaderControls />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('heroTitle')}</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty">{t('heroDesc')}</p>
        </div>

        <PdfAnalyzer />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-4">
          <p className="font-mono text-xs text-muted-foreground">{t('footer')}</p>
        </div>
      </footer>
    </div>
  )
}
