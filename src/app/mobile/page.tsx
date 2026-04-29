'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, Receipt } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

export default function MobileHome() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(0,245,255,0.2)', borderTopColor: '#00F5FF', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const firstName = user.name.split(' ')[0]
  const initials = user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')

  return (
    <div style={{ minHeight: '100dvh', padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, paddingBottom: 8 }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--brand-subtle)', marginBottom: 2 }}>Olá,</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-text)', lineHeight: 1.2 }}>{firstName}</p>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
          background: 'rgba(0,245,255,0.1)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.2)',
        }}>
          {initials}
        </div>
      </div>

      {/* Title */}
      <div style={{ paddingTop: 24, paddingBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-text)', lineHeight: 1.2, margin: 0 }}>
          Lançamento rápido
        </h1>
        <p style={{ fontSize: 14, color: 'var(--brand-muted)', marginTop: 6, margin: '6px 0 0' }}>
          O que vai registrar hoje?
        </p>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Link href="/mobile/apontamento" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 20, padding: '24px 20px',
            borderRadius: 20, cursor: 'pointer',
            background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.18)',
            transition: 'transform 0.12s',
          }}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
            onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,245,255,0.14)',
            }}>
              <Clock size={26} color="#00F5FF" />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#00F5FF', margin: 0 }}>Apontamento</p>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: '4px 0 0' }}>Registrar horas trabalhadas</p>
            </div>
          </div>
        </Link>

        <Link href="/mobile/despesa" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 20, padding: '24px 20px',
            borderRadius: 20, cursor: 'pointer',
            background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)',
            transition: 'transform 0.12s',
          }}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
            onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(139,92,246,0.14)',
            }}>
              <Receipt size={26} color="#8B5CF6" />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#8B5CF6', margin: 0 }}>Despesa</p>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: '4px 0 0' }}>Registrar gasto ou reembolso</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Quick tip */}
      <div style={{ marginTop: 'auto', paddingTop: 40 }}>
        <p style={{ fontSize: 11, color: 'var(--brand-subtle)', textAlign: 'center' }}>
          Lançamento em menos de 10 segundos
        </p>
      </div>
    </div>
  )
}
