import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--brand-bg)',
      maxWidth: 480,
      marginLeft: 'auto',
      marginRight: 'auto',
      position: 'relative',
      overscrollBehavior: 'none',
    }}>
      {children}
    </div>
  )
}
