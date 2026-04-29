export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--brand-bg)', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', position: 'relative' }}>
      {children}
    </div>
  )
}
