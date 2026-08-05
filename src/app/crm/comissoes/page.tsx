'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Percent } from 'lucide-react'

interface Row { user_id: number; name: string; base: number; percentual: number; comissao: number; qtd: number }
interface Data { competencia: string; can_edit: boolean; percentual_padrao: number; total_base: number; total_comissao: number; rows: Row[] }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const curMonth = () => new Date().toISOString().slice(0, 7)

export default function CrmComissoesPage() {
  const [comp, setComp] = useState(curMonth())
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [defRate, setDefRate] = useState('')

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Data }>(`/crm/comissoes?competencia=${comp}`)
      .then(r => { setData(r?.data ?? null); setDefRate(r?.data ? String(r.data.percentual_padrao) : '') })
      .catch((e: any) => { if (String(e?.message || '').match(/permite|403/)) setDenied(true); else toast.error('Erro ao carregar comissões') })
      .finally(() => setLoading(false))
  }, [comp])
  useEffect(() => { load() }, [load])

  const saveRate = async (userId: number | null, raw: string) => {
    const val = Number(String(raw).replace(',', '.'))
    if (isNaN(val) || val < 0 || val > 100) { toast.error('Percentual inválido (0–100)'); return }
    try { await api.put('/crm/comissoes/rate', { user_id: userId, percentual: val }); toast.success('Percentual salvo'); load() }
    catch { toast.error('Erro ao salvar percentual') }
  }

  return (
    <AppLayout title="Comissões (CRM)">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Percent size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Comissões</h1>
        </div>
        <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Seu perfil não permite ver comissões.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : data && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="rounded-xl p-3.5 flex-1 min-w-[140px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Base (ganho no mês)</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(data.total_base)}</p>
            </div>
            <div className="rounded-xl p-3.5 flex-1 min-w-[140px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Comissão total</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: '#17914e' }}>{fmtBRL(data.total_comissao)}</p>
            </div>
            <div className="rounded-xl p-3.5 min-w-[180px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>% padrão da empresa</p>
              {data.can_edit ? (
                <div className="flex items-center gap-1">
                  <input inputMode="decimal" value={defRate} onChange={e => setDefRate(e.target.value)}
                    onBlur={() => defRate !== String(data.percentual_padrao) && saveRate(null, defRate)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="w-20 text-right rounded-lg px-2 py-1 outline-none tabular-nums" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <span style={{ color: 'var(--text-muted)' }}>%</span>
                </div>
              ) : <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>{data.percentual_padrao}%</p>}
            </div>
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Responsável</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Base (ganho)</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold">Negócios</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">%</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold">Comissão</th>
              </tr></thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{r.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.base)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: 'var(--text-light)' }}>{r.qtd}</td>
                    <td className="px-4 py-2.5 text-right">
                      {data.can_edit ? (
                        <input inputMode="decimal" defaultValue={String(r.percentual)}
                          onBlur={e => { const v = e.target.value; if (v !== String(r.percentual)) saveRate(r.user_id, v) }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="w-16 text-right rounded-lg px-2 py-1 outline-none tabular-nums" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      ) : <span className="tabular-nums" style={{ color: 'var(--text)' }}>{r.percentual}%</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: '#17914e' }}>{fmtBRL(r.comissao)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum responsável no escopo.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-light)' }}>Comissão = base (oportunidades ganhas no mês) × percentual. Percentual em branco usa o padrão da empresa.</p>
        </>
      )}
    </AppLayout>
  )
}
