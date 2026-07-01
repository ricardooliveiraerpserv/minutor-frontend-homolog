'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { ListChecks, CalendarDays, CheckCircle2, Circle } from 'lucide-react'
import { ClientFollowUpDetail } from '@/components/projects/client-follow-up-detail'

/**
 * "Meus Acompanhamentos" — visão cross-projeto do cliente. Lista todos os
 * acompanhamentos onde ele está envolvido, com projeto + atividade de contexto.
 * Abrir → comentar / anexar / concluir / ir para a atividade.
 */
interface Item {
  id: number; title: string; status: string; due_date: string | null
  responsible: string | null; author: string | null; project_name: string | null
  delivery_id: number | null; delivery_title: string | null
}
const isDone = (s: string) => s === 'completed'
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export default function MeusAcompanhamentosPage() {
  const { data, loading, error, refetch } = useApiQuery<{ items: Item[] }>('/client/follow-ups')
  const [openId, setOpenId] = useState<number | null>(null)

  const items = data?.items ?? []
  const abertos = items.filter(i => !isDone(i.status))
  const concluidos = items.filter(i => isDone(i.status))

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 880 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ListChecks size={20} /> Meus Acompanhamentos
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Compromissos em que você está envolvido. Abra para comentar, anexar, concluir ou ir para a atividade.
        </p>

        {loading && <div style={{ color: 'var(--text-muted)', marginTop: 16 }}>Carregando…</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 16 }}>{error}</div>}

        {!loading && items.length === 0 && (
          <div style={{ marginTop: 24, padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
            Nenhum acompanhamento envolvendo você.
          </div>
        )}

        {abertos.length > 0 && <Section title={`Abertos (${abertos.length})`} items={abertos} onOpen={setOpenId} />}
        {concluidos.length > 0 && <Section title={`Concluídos (${concluidos.length})`} items={concluidos} onOpen={setOpenId} />}

        {openId != null && (
          <ClientFollowUpDetail followUpId={openId} onClose={() => setOpenId(null)} onChanged={refetch} />
        )}
      </div>
    </AppLayout>
  )
}

function Section({ title, items, onOpen }: { title: string; items: Item[]; onOpen: (id: number) => void }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(i => {
          const done = isDone(i.status)
          const overdue = !done && i.due_date && i.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10)
          return (
            <div key={i.id} className="ds-card ds-row-hover" style={{ padding: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }} onClick={() => onOpen(i.id)}>
              {done ? <CheckCircle2 size={18} style={{ color: 'var(--success)', marginTop: 1 }} /> : <Circle size={18} style={{ color: 'var(--text-muted)', marginTop: 1 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{i.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {i.project_name ? `${i.project_name}` : ''}{i.delivery_title ? ` · ${i.delivery_title}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  {i.author && <span>Enviado por <strong style={{ color: 'var(--text)' }}>{i.author}</strong></span>}
                  <span style={{ color: done ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{done ? 'Concluído' : 'Aberto'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}><CalendarDays size={11} /> Prazo {fmtDate(i.due_date)}</span>
                  {i.responsible && <span>Resp.: {i.responsible}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
