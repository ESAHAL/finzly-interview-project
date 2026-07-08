'use client'

/**
 * Top-right header controls: a language switcher (changes the whole site UI
 * language) and a dark/light theme toggle. The theme works by adding/removing
 * the `dark` class on <html>, which swaps the CSS design tokens in globals.css.
 */

import { useEffect, useRef, useState } from 'react'
import { UI_LOCALES, useI18n, type Locale } from '@/lib/i18n'

const THEME_KEY = 'ui-theme'

export function HeaderControls() {
  const { locale, setLocale } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Restore the saved theme on mount (the blocking script in layout.tsx
  // already applied the class before paint — this just syncs React state).
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  // Close the language menu when clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
  }

  return (
    <div className="flex items-center gap-2">
      {/* Language switcher */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-label="Change language"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-mono text-xs uppercase text-foreground transition-colors hover:bg-accent"
        >
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.2 3.75-5.4 3.75-9S14.5 5.2 12 3m0 18c-2.5-2.2-3.75-5.4-3.75-9S9.5 5.2 12 3M3.5 9h17M3.5 15h17"
            />
          </svg>
          {locale}
        </button>
        {menuOpen && (
          <ul
            role="listbox"
            aria-label="Language"
            className="absolute right-0 top-10 z-10 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-md"
          >
            {UI_LOCALES.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={locale === l.code}
                  onClick={() => {
                    setLocale(l.code as Locale)
                    setMenuOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    locale === l.code ? 'font-semibold text-primary' : 'text-foreground'
                  }`}
                >
                  {l.label}
                  <span className="font-mono text-xs uppercase text-muted-foreground">{l.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent"
      >
        {isDark ? (
          <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 14.25A9 9 0 1 1 9.75 2.25a7 7 0 0 0 12 12Z"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
