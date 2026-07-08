import type { Metadata, Viewport } from 'next'
import { Inter, Geist } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ImpersonationBanner } from '@/components/impersonation-banner'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
// Geist Sans — usada em headings (h1/h2/h3) e KPIs via --font-display.
// Visual mais geométrico/moderno vs Inter (humanista). Inter segue no body.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

// Favicon env-aware: cores das faixas (local/replica=roxo, dev=amarelo, homolog=vermelho, prod=cyan original)
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV
const ICON_HREF =
  APP_ENV === 'local'   ? '/favicon-local.svg' :
  APP_ENV === 'dev'     ? '/favicon-dev.svg' :
  APP_ENV === 'homolog' ? '/favicon-homolog.svg' :
                          '/favicon-prod.svg'

export const metadata: Metadata = {
  title: 'Minutor',
  icons: { icon: [{ url: ICON_HREF, type: 'image/svg+xml' }] },
  description: 'Gestão de horas e despesas',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Minutor',
  },
  other: {
    'apple-touch-icon': '/apple-touch-icon.png',
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

// Banner de ambiente — NUNCA renderiza em produção. Texto definido por env.
const ENV_BANNER_TEXT =
  APP_ENV === 'dev'     ? 'DEV — DADOS COPIADOS DE PROD' :
  APP_ENV === 'homolog' ? 'HOMOLOG — ambiente de validação' :
  APP_ENV === 'local'   ? 'REPLICA — DADOS COPIADOS DE PROD • localhost:3001' :
                          null

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full">
        {ENV_BANNER_TEXT && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 50%, #f59e0b 100%)',
              color: '#0a0a0a',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.15em',
              textAlign: 'center',
              padding: '4px 8px',
              fontFamily: 'var(--font-inter), sans-serif',
              textShadow: '0 1px 0 rgba(255,255,255,0.4)',
              pointerEvents: 'none',
            }}
          >
            {ENV_BANNER_TEXT}
          </div>
        )}
        <div style={ENV_BANNER_TEXT ? { paddingTop: 24 } : undefined}>
          <Providers>{children}</Providers>
        </div>
        <ImpersonationBanner />
      </body>
    </html>
  )
}
