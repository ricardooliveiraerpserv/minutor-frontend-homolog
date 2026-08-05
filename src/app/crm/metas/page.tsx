'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Target } from 'lucide-react'

interface Row { user_id: number; name: string; meta: number; realizado: number; qtd: number; pct: number | null }
interface Data { competencia: string; can_edit: boolean; total_meta: number; total_realizado: number; rows: Row[] }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const curMonth = () => new Date().toISOString().slice(0, 7)
const pctColor = (p: number | null) => p == null ? 'var(--text-light)' : p >= 100 ? '#17914e' : p >= 70 ? 'var(--warning-border)' : 'var(--danger-border)'

export default function CrmMetasPage() {
  const [comp, setComp] = useState(curMonth())
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [edit, setEdit] = useState<Record<number, string>>({})

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Data }>(`/crm/metas?competencia=${comp}`)
      .then(r => { setData(r?.data ?? null); setEdit({}) })
      .catch((e: any) => { if (String(e?.message || '').match(/permite|403/)) setDenied(true); else toast.error('Erro ao carregar metas') })
      .finally(() => setLoading(false))
  }, [comp])
  useEffect(() => { load() }, [load])

  const saveMeta = async (userId: number) => {
    const raw = edit[userId]; if (raw == null) return
    const val = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (isNaN(val) || val < 0) { toast.error('Valor inválido'); return }
    try {
      await api.put('/crm/metas', { user_id: userId, competencia: comp, valor_meta: val })
      toast.success('Meta salva'); load()
    } catch { toast.error('Erro ao salvar meta') }
  }

  return (
    <AppLayout title="Metas Comerciais (CRM)">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Metas Comerciais</h1>
        </div>
        <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Seu perfil não permite ver metas.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[['Meta total', fmtBRL(data.total_meta)], ['Realizado', fmtBRL(data.total_realizado)],
              ['Atingimento', data.total_meta > 0 ? `${Math.round(data.total_realizado / data.total_meta * 100)}%` : '—']].map(([l, v]) => (
              <div key={l} className="rounded-xl p-3.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{l}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>{v}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Responsável</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Meta (R$)</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Realizado</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold">Negócios</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">%</th>
              </tr></thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{r.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {data.can_edit ? (
                        <input inputMode="decimal" defaultValue={r.meta ? String(r.meta) : ''} placeholder="0"
                          onChange={e => setEdit(s => ({ ...s, [r.user_id]: e.target.value }))}
                          onBlur={() => edit[r.user_id] != null && saveMeta(r.user_id)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="w-28 text-right rounded-lg px-2 py-1 outline-none tabular-nums" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      ) : <span className="tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(r.meta)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.realizado)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: 'var(--text-light)' }}>{r.qtd}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: pctColor(r.pct) }}>{r.pct == null ? '—' : `${r.pct}%`}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum responsável no escopo.</td></tr>}
              </tbody>
            </table>
          </div>
          {data.can_edit && <p className="text-[11px] mt-2" style={{ color: 'var(--text-light)' }}>Edite a meta e saia do campo (ou Enter) para salvar. Realizado = oportunidades ganhas no mês.</p>}
        </>
      )}
    </AppLayout>
  )
}
