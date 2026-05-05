import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Minutor',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
