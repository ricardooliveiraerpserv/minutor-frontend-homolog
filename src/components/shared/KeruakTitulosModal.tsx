'use client'

import { useState, useEffect } from 'react'
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

export function KeruakTitulosModal({ cliente, cnpjs, recebMonths, onClose }: Props) {
  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const qs = new URLSearchParams()
    qs.set('cnpjs', cnpjs.filter(Boolean).join(','))
    if (recebMonths.length) qs.set('receb', recebMonths.join(','))
    api.get<{ data: { titulos: Titulo[]; total: number } }>(`/relatorios/rentabilidade/keruak-titulos?${qs}`)
      .then(r => {
        if (!alive) return
        setTitulos(r?.data?.titulos ?? [])
        setTotal(r?.data?.total ?? 0)
      })
      .catch(() => { if (alive) { setTitulos([]); setTotal(0) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [cnpjs, recebMonths])

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

        {/* Body */}
        <div className="overflow-auto p-4">
          {loading ? (
            <div className="p-10 text-center">
              <div className="animate-pulse h-4 w-32 mx-auto rounded" style={{ background: 'var(--border)' }} />
            </div>
          ) : titulos.length === 0 ? (
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
                {titulos.map((t, idx) => (
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
                    Total ({titulos.length} {titulos.length === 1 ? 'título' : 'títulos'})
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
