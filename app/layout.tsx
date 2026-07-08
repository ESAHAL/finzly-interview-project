import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from 'next/font/google'
import { I18nProvider } from '@/lib/i18n'
import './globals.css'

const _geistSans = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })
// Fallback for Hindi (Devanagari script) when the UI language is switched.
const _notoDevanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '500', '600'] })

export const metadata: Metadata = {
  title: 'PDF Analyser',
  description:
    'Paste any publicly accessible PDF URL and get a structured AI analysis: document type, title, authors, summary, and key takeaway.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#f7f6f3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint to avoid a light-mode flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('ui-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <I18nProvider>{children}</I18nProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
