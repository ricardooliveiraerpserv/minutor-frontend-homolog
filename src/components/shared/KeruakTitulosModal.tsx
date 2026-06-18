'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Receipt } from 'lucide-react'
import { api } from '@/lib/api'

interface Titulo {
  emissao: string | null
  recebimento: string
  valor: number
  empresa: string
  observacao: string
  cnpj: string
}

interface Props {
  cliente: string
  cnpjs: string[]
  recebMonths: string[]
  valorInicial?: number  // ajuste inicial do ano (receita inicial) somado ao Valor Recebido
  onClose: () => void
}

const fmtBRL = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "YYYY-MM" -> "MM/YYYY"
const fmtYm = (ym: string | null) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return m ? `${m}/${y}` : ym
}

export function KeruakTitulosModal({ cliente, cnpjs, valorInicial = 0, onClose }: Props) {
  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [loading, setLoading] = useState(true)

  // Filtro de data (mês de recebimento) — por padrão SEMPRE o mês atual.
  // O usuário pode ampliar o período ou limpar p/ ver todos os títulos.
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [from, setFrom] = useState(currentMonth)
  const [to, setTo] = useState(currentMonth)

  useEffect(() => {
    let alive = true
    const qs = new URLSearchParams()
    qs.set('cnpjs', cnpjs.filter(Boolean).join(','))
    // Busca TODOS os títulos do cliente; o filtro de data é aplicado aqui no modal.
    api.get<{ data: { titulos: Titulo[] } }>(`/relatorios/rentabilidade/keruak-titulos?${qs}`)
      .then(r => { if (alive) setTitulos(r?.data?.titulos ?? []) })
      .catch(() => { if (alive) setTitulos([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [cnpjs])

  const filtered = useMemo(() => titulos.filter(t => {
    if (from && t.recebimento < from) return false
    if (to && t.recebimento > to) return false
    return true
  }), [titulos, from, to])

  const total = useMemo(() => filtered.reduce((s, t) => s + (t.valor || 0), 0) + valorInicial, [filtered, valorInicial])
  const hasContent = filtered.length > 0 || valorInicial > 0

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
    borderRadius: 8, padding: '4px 8px', fontSize: 12,
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col w-full max-w-3xl rounded-2xl max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <Receipt size={16} style={{ color: 'var(--primary)' }} />
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Títulos do Keruak — Valor Recebido</p>
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{cliente}</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Filtro de data (recebimento) */}
        <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Recebimento</span>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Início
            <input type="month" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          </label>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Fim
            <input type="month" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
          </label>
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo('') }}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-auto p-4">
          {loading ? (
            <div className="p-10 text-center">
              <div className="animate-pulse h-4 w-32 mx-auto rounded" style={{ background: 'var(--border)' }} />
            </div>
          ) : !hasContent ? (
            <div className="p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Nenhum título do Keruak no período para este cliente.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Emissão', 'Recebimento', 'Empresa', 'Observação', 'Valor'].map((h, i) => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-light)', textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valorInicial > 0 && (
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>—</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>—</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>—</td>
                    <td className="px-3 py-2 italic" style={{ color: 'var(--text)' }}>Valor inicial (ajuste do ano)</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-right" style={{ color: 'var(--primary)' }}>{fmtBRL(valorInicial)}</td>
                  </tr>
                )}
                {filtered.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtYm(t.emissao)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtYm(t.recebimento)}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.empresa || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{t.observacao || '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-right" style={{ color: 'var(--primary)' }}>{fmtBRL(t.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--text)' }} colSpan={4}>
                    Total ({filtered.length} {filtered.length === 1 ? 'título' : 'títulos'}{valorInicial > 0 ? ' + valor inicial' : ''})
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-bold text-right" style={{ color: 'var(--primary)' }}>{fmtBRL(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
