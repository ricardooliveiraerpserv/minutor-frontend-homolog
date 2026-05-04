'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { api, ApiError } from '@/lib/api'

function MinutorIcon({ size = 19 }: { size?: number }) {
  const bars = [
    { x: 0,    h: 0.45, y: 0.55 },
    { x: 0.28, h: 0.75, y: 0.25 },
    { x: 0.56, h: 1.00, y: 0.00 },
    { x: 0.84, h: 0.60, y: 0.40 },
  ]
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      {bars.map((b, i) => (
        <rect key={i} x={b.x * 28 * 0.9 + 2} y={b.y * 20 + 4} width={4.2} height={b.h * 20} rx={1.6} fill="#00F5FF" />
      ))}
    </svg>
  )
}

const inputBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.055)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'white',
  borderRadius: 12,
  width: '100%',
  padding: '13px 16px',
  fontSize: 14,
  outline: 'none',
  transition: 'border 0.15s, box-shadow 0.15s, background 0.15s',
}

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.toLowerCase().trim() })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao enviar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#07090F', position: 'relative', overflow: 'hidden' }}>

      {/* Glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-5%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,212,232,0.05) 0%, transparent 65%)', filter: 'blur(60px)' }} />
      </div>

      {/* Card */}
      <div style={{ animation: 'fadeUp 0.45s ease both', width: '100%', maxWidth: 460, padding: '0 20px', position: 'relative' }}>
        <div style={{ borderRadius: 20, background: 'rgba(13,15,22,0.92)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(24px)', boxShadow: '0 32px 80px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '36px 40px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
              <Image src="/logo.png" alt="ERPServ" width={96} height={32} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.75 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 9, background: 'rgba(0,212,232,0.07)', border: '1px solid rgba(0,212,232,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MinutorIcon size={19} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF', lineHeight: 1.05 }}>
                  Minutor
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: 400 }}>
                  Controle de horas e contratos em um só lugar
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '32px 40px 36px' }}>
            <p style={{ margin: '0 0 24px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.01em' }}>
              Recuperar senha
            </p>

            {success ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', color: '#4ade80', fontSize: 13, lineHeight: 1.6 }}>
                  <strong style={{ display: 'block', marginBottom: 4 }}>E-mail enviado!</strong>
                  Uma senha temporária foi enviada para <span style={{ color: 'white' }}>{email}</span>. Verifique sua caixa de entrada.
                </div>
                <Link href="/login" style={{ display: 'block', width: '100%', textDecoration: 'none' }}>
                  <button
                    style={{ width: '100%', padding: '15px', borderRadius: 14, fontSize: 15, fontWeight: 700, color: 'white', border: 'none', cursor: 'pointer', background: 'linear-gradient(160deg, #3730A3 0%, #4F46E5 60%, #6366F1 100%)', boxShadow: '0 6px 24px rgba(79,70,229,0.45), 0 2px 6px rgba(0,0,0,0.5)', letterSpacing: '0.02em' }}
                    className="login-btn"
                  >
                    Voltar ao login
                  </button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                  Digite seu e-mail cadastrado. Enviaremos uma senha temporária para você acessar o sistema.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value.toLowerCase())}
                    placeholder="seu@email.com"
                    required
                    style={{ ...inputBase, caretColor: '#00F5FF' }}
                    className="login-input"
                  />
                </div>

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn"
                  style={{ width: '100%', padding: '15px', borderRadius: 14, fontSize: 15, fontWeight: 700, color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, background: 'linear-gradient(160deg, #3730A3 0%, #4F46E5 60%, #6366F1 100%)', boxShadow: '0 6px 24px rgba(79,70,229,0.45), 0 2px 6px rgba(0,0,0,0.5)', transition: 'all 0.2s', letterSpacing: '0.02em' }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg style={{ animation: 'spin 0.8s linear infinite' }} width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" strokeLinecap="round" />
                      </svg>
                      Enviando...
                    </span>
                  ) : 'Enviar senha temporária'}
                </button>

                <div style={{ textAlign: 'center' }}>
                  <Link href="/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                  >
                    Voltar ao login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.02em' }}>
          © {new Date().getFullYear()} ERPServ Consultoria · Todos os direitos reservados
        </p>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .login-input::placeholder { color: rgba(255,255,255,0.22); }
        .login-input:focus {
          border: 1px solid rgba(0,212,232,0.55) !important;
          box-shadow: 0 0 0 3px rgba(0,212,232,0.08) !important;
          background: rgba(255,255,255,0.075) !important;
        }
        .login-btn:hover:not(:disabled) {
          box-shadow: 0 8px 32px rgba(79,70,229,0.55), 0 2px 6px rgba(0,0,0,0.5);
          transform: translateY(-1px);
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(0);
        }
      `}</style>
    </div>
  )
}
