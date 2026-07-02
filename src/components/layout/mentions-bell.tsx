'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AtSign, X } from 'lucide-react'
import { useMentions } from '@/hooks/use-mentions'

const STORAGE_KEY = 'minutor.mentions_seen_ids'

/** Set de mention IDs já clicados (read). Abrir o popup NÃO marca — só o click. */
function readSeenIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set()
  } catch { return new Set() }
}

function persistSeenIds(set: Set<string>) {
  if (typeof window === 'undefined') return
  // Limita a 500 entries pra não estourar localStorage
  const arr = Array.from(set).slice(-500)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Renderiza texto removendo o token `@[id:Nome]` e mostrando apenas "@Nome" */
function cleanMentionText(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/@\[(\d+):([^\]]+)\]/g, '@$2')
}

export function MentionsBell() {
  const { items, total, refetch } = useMentions()
  const [open, setOpen] = useState(false)
  const [seenIds, setSeenIds] = useState<Set<string>>(readSeenIds)
  const ref = useRef<HTMLDivElement>(null)

  // Poll a cada 60s
  useEffect(() => {
    const id = setInterval(refetch, 60_000)
    return () => clearInterval(id)
  }, [refetch])

  // Click fora fecha
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Contador = mentions cujo ID ainda não foi clicado
  const unread = items.filter(m => !seenIds.has(String(m.id))).length

  // Display: TODAS não-lidas + até 10 lidas mais recentes (modelo Slack/Linear)
  // Mantém ordem por created_at desc dentro de cada grupo.
  const unreadItems = items.filter(m => !seenIds.has(String(m.id)))
  const readRecent = items.filter(m => seenIds.has(String(m.id))).slice(0, 10)
  const displayItems = [...unreadItems, ...readRecent]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  function handleOpen() {
    // Apenas abre/fecha o popup. Marcar como lido só acontece no click do item.
    setOpen(v => !v)
    refetch()
  }

  function markRead(itemId: string) {
    setSeenIds(prev => {
      const next = new Set(prev)
      next.add(itemId)
      persistSeenIds(next)
      return next
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: open ? 'var(--primary)' : '#71717A' }}
        title="Mentions"
      >
        <AtSign size={16} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center pointer-events-none"
            style={{ background: 'var(--warning)', color: 'var(--primary-fg)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', width: 440 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="flex items-center gap-2">
              <AtSign size={14} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>Mentions</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                {total}
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--brand-muted)' }}>
              <X size={12} />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {displayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-1">
                <AtSign size={20} style={{ color: 'var(--brand-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhuma menção ainda</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {displayItems.map(m => {
                  const itemId = String(m.id)
                  const isUnread = !seenIds.has(itemId)
                  // Deep link por source (Fase mentions 4-fontes)
                  const anyM = m as any
                  const href =
                    anyM.source === 'request_chat' && anyM.request_id
                      ? `/contratos/pipeline?req=${anyM.request_id}&tab=chat`
                      : anyM.source === 'contract_chat' && anyM.contract_id
                      ? `/contratos/pipeline?chat_contract_id=${anyM.contract_id}`
                      : anyM.source === 'project_chat' && m.project_id
                      ? `/contratos/pipeline?project=${m.project_id}&tab=chat`
                      : m.project_id && m.stage_id
                      ? `/projetos/${m.project_id}/cronograma/${m.stage_id}`
                      : m.project_id
                      ? `/projetos/${m.project_id}/cronograma`
                      : '#'
                  return (
                    <li key={itemId} style={{
                      borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'var(--primary-soft)' : 'transparent',
                    }}>
                      <Link
                        href={href}
                        onClick={() => { markRead(itemId); setOpen(false) }}
                        style={{
                          display: 'block', padding: '10px 14px',
                          textDecoration: 'none', color: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{m.actor?.name ?? 'Alguém'}</strong>
                          <span>·</span>
                          <span>{timeAgo(m.created_at)}</span>
                        </div>
                        {m.text && (
                          <div style={{
                            marginTop: 4,
                            fontSize: 12, color: 'var(--text)',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}>
                            {cleanMentionText(m.text)}
                          </div>
                        )}
                        <div style={{
                          marginTop: 4, fontSize: 11, color: 'var(--text-light)',
                          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                        }}>
                          {(() => {
                            const customer = anyM.customer
                            const projectName = anyM.project_name || m.project
                            const tipo =
                              anyM.source === 'request_chat' ? 'Requisição'
                              : anyM.source === 'contract_chat' ? 'Contrato'
                              : anyM.source === 'project_chat' ? 'Projeto'
                              : null
                            const nodes: React.ReactNode[] = []
                            if (tipo) {
                              nodes.push(<span key="t">{tipo}</span>)
                            }
                            if (customer) {
                              if (nodes.length) nodes.push(<span key="d1" style={{ color: 'var(--text-light)' }}>·</span>)
                              nodes.push(
                                <span key="c" style={{
                                  color: 'var(--primary)', fontWeight: 600,
                                  background: 'var(--primary-soft)',
                                  padding: '1px 6px', borderRadius: 4,
                                }}>{customer}</span>
                              )
                            }
                            if (projectName) {
                              if (nodes.length) nodes.push(<span key="d2" style={{ color: 'var(--text-light)' }}>·</span>)
                              nodes.push(<span key="p" style={{ color: 'var(--text-muted)' }}>{projectName}</span>)
                            }
                            if (!tipo && nodes.length === 0) {
                              // activity / legacy
                              if (m.project) nodes.push(<span key="p2">{m.project}</span>)
                              if (m.stage) { nodes.push(<span key="d3">·</span>); nodes.push(<span key="s">{m.stage}</span>) }
                              if (m.delivery) { nodes.push(<span key="d4">·</span>); nodes.push(<span key="dl">{m.delivery}</span>) }
                            }
                            return nodes.length ? nodes : '—'
                          })()}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
