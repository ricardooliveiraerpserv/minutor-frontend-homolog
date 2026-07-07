'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Megaphone, ChevronDown, Clock } from 'lucide-react'
import { sanitizeRich } from '@/lib/sanitize-html'

interface Comunicado {
  id: number; tipo: string; title: string; message: string
  sent_by: string | null; read: boolean; expires_at: string | null; created_at: string | null
}

const TIPO_L: Record<string, string> = { aviso: 'Aviso', formal: 'Comunicação formal', campanha: 'Campanha', marketing: 'Marketing' }

/** Publicações — comunicação institucional recebida; gestão/envio fica na Central (admin). */
export default function PublicacoesPage() {
  const { resolvedTheme } = useTheme()
  const [rows, setRows] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    if (!resolvedTheme) return
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light'
    api.get<{ data: Comunicado[] }>(`/communications/mine?theme=${theme}`)
      .then(r => { const d = r.data ?? []; setRows(d); setOpen(o => o ?? (d.length ? d[0].id : null)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [resolvedTheme])

  const dt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

  return (
    <AppLayout title="Publicações">
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2.5">
          <Megaphone size={22} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Publicações</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>· Comunicação institucional da ERPSERV</span>
        </div>

        {loading ? (
          <div className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="ds-card p-8 text-center">
            <Megaphone size={32} className="mx-auto mb-2" style={{ color: 'var(--text-light)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma publicação no momento.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(c => {
              const isOpen = open === c.id
              return (
                <div key={c.id} className="ds-card overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : c.id)} className="w-full flex items-center gap-3 p-3 text-left">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{TIPO_L[c.tipo] ?? c.tipo}</span>
                    <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{c.title}</span>
                    <span className="text-[11px] shrink-0 inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Clock size={12} /> {dt(c.created_at)}</span>
                    <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                      <div className="comunicado-body text-sm" style={{ color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(c.message) }} />
                      {(c.sent_by || c.expires_at) && (
                        <div className="mt-3 pt-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
                          {c.sent_by && <span>Enviado por {c.sent_by}</span>}
                          {c.expires_at && <span>Disponível até {dt(c.expires_at)}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        .comunicado-body img { max-width: 100%; height: auto; border-radius: 8px; }
        .comunicado-body a { color: var(--primary); text-decoration: underline; }
        .comunicado-body p { margin: 0 0 .6em; line-height: 1.55; }
        .comunicado-body ul, .comunicado-body ol { padding-left: 1.4em; margin: 0 0 .6em; }
      `}</style>
    </AppLayout>
  )
}
