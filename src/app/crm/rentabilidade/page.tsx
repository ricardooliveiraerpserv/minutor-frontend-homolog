'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { TrendingUp } from 'lucide-react'

interface Row { id: number; title: string; cliente: string | null; responsavel: string | null; fechamento_at: string | null; receita: number; custo: number; lucro: number; margem: number | null }
interface Data { competencia: string; can_edit: boolean; total_receita: number; total_custo: number; total_lucro: number; rows: Row[] }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const curMonth = () => new Date().toISOString().slice(0, 7)
const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const margemColor = (m: number | null) => m == null ? 'var(--text-light)' : m >= 40 ? '#17914e' : m >= 15 ? 'var(--warning-border)' : 'var(--danger-border)'

export default function CrmRentabilidadePage() {
  const [comp, setComp] = useState(curMonth())
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Data }>(`/crm/rentabilidade?competencia=${comp}`)
      .then(r => setData(r?.data ?? null))
      .catch((e: any) => { if (String(e?.message || '').match(/permite|403/)) setDenied(true); else toast.error('Erro ao carregar rentabilidade') })
      .finally(() => setLoading(false))
  }, [comp])
  useEffect(() => { load() }, [load])

  const saveCusto = async (id: number, raw: string) => {
    const val = Number(String(raw).replace(/\./g, '').replace(',', '.'))
    if (isNaN(val) || val < 0) { toast.error('Custo inválido'); return }
    try { await api.patch(`/crm/rentabilidade/${id}/custo`, { custo: val }); toast.success('Custo salvo'); load() }
    catch { toast.error('Erro ao salvar custo') }
  }

  const margemTotal = data && data.total_receita > 0 ? Math.round(data.total_lucro / data.total_receita * 100) : null

  return (
    <AppLayout title="Rentabilidade Comercial (CRM)">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Rentabilidade Comercial</h1>
        </div>
        <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Seu perfil não permite ver rentabilidade.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[['Receita', fmtBRL(data.total_receita), 'var(--text)'], ['Custo', fmtBRL(data.total_custo), 'var(--text-muted)'],
              ['Lucro', fmtBRL(data.total_lucro), '#17914e'], ['Margem', margemTotal == null ? '—' : `${margemTotal}%`, margemColor(margemTotal)]].map(([l, v, c]) => (
              <div key={l} className="rounded-xl p-3.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{l}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Negócio</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Cliente</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Responsável</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold">Ganho em</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Receita</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Custo</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Lucro</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Margem</th>
              </tr></thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{r.title}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{r.cliente ?? '—'}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{r.responsavel ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: 'var(--text-light)' }}>{fmtDate(r.fechamento_at)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(r.receita)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {data.can_edit ? (
                        <input inputMode="decimal" defaultValue={r.custo ? String(r.custo) : ''} placeholder="0"
                          onBlur={e => { const v = e.target.value; if (Number(v.replace(/\./g, '').replace(',', '.')) !== r.custo) saveCusto(r.id, v) }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="w-28 text-right rounded-lg px-2 py-1 outline-none tabular-nums" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      ) : <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.custo)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: r.lucro >= 0 ? '#17914e' : 'var(--danger-border)' }}>{fmtBRL(r.lucro)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: margemColor(r.margem) }}>{r.margem == null ? '—' : `${r.margem}%`}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhuma oportunidade ganha nesta competência.</td></tr>}
              </tbody>
            </table>
          </div>
          {data.can_edit && <p className="text-[11px] mt-2" style={{ color: 'var(--text-light)' }}>Informe o custo de cada negócio ganho para calcular lucro e margem. Receita = valor da oportunidade.</p>}
        </>
      )}
    </AppLayout>
  )
}
