'use client'

import { useEffect, useState } from 'react'

interface Info { name?: string; type?: string; vinculo?: string }

function readInfo(): Info | null {
  // Per-aba: o estado de impersonation fica no sessionStorage (isolado por aba), não no cookie.
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem('minutor_impersonating')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const TYPE_LABEL: Record<string, string> = {
  admin: 'Admin', administrativo: 'Administrativo', coordenador: 'Coordenador',
  consultor: 'Consultor', cliente: 'Cliente', parceiro_admin: 'Parceiro',
}

/** Barra fixa no rodapé, visível em QUALQUER visão enquanto se está impersonando. */
export function ImpersonationBanner() {
  const [info, setInfo] = useState<Info | null>(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => { setInfo(readInfo()) }, [])

  if (!info?.name) return null

  const stop = async () => {
    setStopping(true)
    // Per-aba: restaura o token do admin (guardado no sessionStorage desta aba) e limpa o estado.
    try {
      const admin = window.sessionStorage.getItem('minutor_admin_token')
      if (admin) window.sessionStorage.setItem('minutor_token', admin)
      else window.sessionStorage.removeItem('minutor_token')
      window.sessionStorage.removeItem('minutor_admin_token')
      window.sessionStorage.removeItem('minutor_impersonating')
    } catch { /* noop */ }
    try {
      await fetch('/api/impersonate/stop', { method: 'POST' })
    } finally {
      // Volta pro "Ver como" — a página restaura o card (cliente/consultor/parceiro) que estava.
      window.location.href = '/ver-como'
    }
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600,
        padding: '8px 12px', fontFamily: 'var(--font-inter), sans-serif',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.35)',
      }}
    >
      <span>
        👁 Vendo como <b>{info.name}</b>
        {info.type ? ` — ${TYPE_LABEL[info.type] ?? info.type}` : ''}
        {info.vinculo ? ` · ${info.vinculo}` : ''}
      </span>
      <button
        onClick={stop}
        disabled={stopping}
        style={{ background: '#fff', color: '#7c3aed', border: 'none', borderRadius: 8, padding: '3px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
      >
        {stopping ? 'Voltando…' : 'Voltar para admin'}
      </button>
    </div>
  )
}
