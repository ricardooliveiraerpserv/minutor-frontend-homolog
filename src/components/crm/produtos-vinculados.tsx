'use client'

import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Trash2, ChevronDown } from 'lucide-react'

export const OPP_CATEGORIAS = ['Licenciamento', 'Implantação', 'Sustentação', 'Banco de Horas', 'Pacote de Horas', 'Projeto Fechado', 'Treinamento', 'Customização']
export const OPP_PRECIFICACOES: { v: string; l: string }[] = [
  { v: 'hora', l: 'Por hora' }, { v: 'projeto', l: 'Por projeto' }, { v: 'mensal', l: 'Mensal' }, { v: 'licenca', l: 'Licença' },
]

export type OppProduct = {
  id: number; name: string; origem?: string | null
  pivot: { quantidade: number | string; valor: number | string; custo?: number | string | null; categoria?: string | null; tipo_precificacao?: string | null }
}

function ProdutoAddSearch({ options, onPick, busy }: { options: { id: number; name: string; origem?: string | null }[]; onPick: (id: number) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const list = options.filter(o => o.name.toLowerCase().includes(q.trim().toLowerCase()))
  const inp = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div ref={ref} className="relative mt-1.5">
      <button type="button" disabled={busy} onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] outline-none text-left disabled:opacity-50" style={inp}>
        <span style={{ color: 'var(--primary)' }}>{busy ? 'Adicionando…' : '+ Adicionar produto ou serviço…'}</span>
        <ChevronDown size={13} style={{ color: 'var(--text-light)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg overflow-hidden shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar…" className="w-full px-2 py-1 rounded text-[11px] outline-none" style={inp} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {list.map(o => (
              <button key={o.id} type="button" onClick={() => { onPick(o.id); setOpen(false); setQ('') }} className="w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)' }}>
                {o.name}{o.origem === 'parceiro' ? <span className="text-[9px] ml-1" style={{ color: 'var(--warning-border)' }}>(Parceiro)</span> : ''}
              </button>
            ))}
            {list.length === 0 && <p className="px-2.5 py-2 text-[10px]" style={{ color: 'var(--text-light)' }}>Nada encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Produtos/Serviços vinculados à oportunidade — Categoria e Precificação por linha.
 *  Somar/editar/remover; o total (Σ qtd × valor) soma ao Valor total da oportunidade no backend. */
export function ProdutosVinculados({ oppId, products, onChanged }: { oppId: number; products: OppProduct[]; onChanged: () => void }) {
  const [catalog, setCatalog] = useState<{ id: number; name: string; origem: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const sel = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  useEffect(() => {
    api.get<{ data: { id: number; name: string; ativo?: boolean; origem?: string | null }[] }>('/crm/products')
      .then(r => setCatalog((r?.data ?? []).filter(p => p.ativo !== false).map(p => ({ id: p.id, name: p.name, origem: p.origem ?? 'proprio' }))))
      .catch(() => {})
  }, [])
  const put = async (productId: number, body: Record<string, unknown>) => {
    try { await api.put(`/crm/opportunities/${oppId}/products/${productId}`, body); onChanged() }
    catch { toast.error('Erro ao salvar produto') }
  }
  const add = async (id: number) => {
    if (!id) return
    setBusy(true)
    try { await api.post(`/crm/opportunities/${oppId}/products`, { crm_product_id: id }); onChanged() }
    catch { toast.error('Erro ao adicionar produto') } finally { setBusy(false) }
  }
  const remove = async (productId: number) => {
    try { await api.delete(`/crm/opportunities/${oppId}/products/${productId}`); onChanged() }
    catch { toast.error('Erro ao remover produto') }
  }
  const num = (x: number | string | null | undefined) => Number(x) || 0
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const totalReceita = products.reduce((s, p) => s + num(p.pivot.quantidade) * num(p.pivot.valor), 0)
  const totalCusto = products.reduce((s, p) => s + num(p.pivot.quantidade) * num(p.pivot.custo), 0)
  const totalMargem = totalReceita - totalCusto
  const totalMargemPct = totalReceita > 0 ? (totalMargem / totalReceita) * 100 : 0
  const disponiveis = catalog.filter(c => !products.some(p => p.id === c.id))

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Produtos / Serviços</h3>
        {products.length > 0 && (
          <span className="text-[11px] font-semibold tabular-nums flex flex-wrap items-center gap-x-2">
            <span style={{ color: 'var(--primary)' }}>Σ {brl(totalReceita)}</span>
            <span style={{ color: 'var(--text-light)' }}>· Custo {brl(totalCusto)}</span>
            <span style={{ color: totalMargem >= 0 ? '#16a34a' : 'var(--danger-border)' }}>· Margem {brl(totalMargem)} ({totalMargemPct.toFixed(1)}%)</span>
          </span>
        )}
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {products.length === 0 ? (
          <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>Nenhum produto vinculado. Use “+ Adicionar produto ou serviço” abaixo.</p>
        ) : products.map(p => (
          <div key={p.id} className="px-2.5 py-2 space-y-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text)' }}>
                <span className="truncate">{p.name}</span>
                {p.origem === 'parceiro' && <span className="text-[9px] px-1 py-0.5 rounded font-bold shrink-0" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>Parceiro</span>}
              </span>
              <button onClick={() => remove(p.id)} className="p-1 rounded hover:bg-[var(--surface-hover)] shrink-0" title="Remover" style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <select value={p.pivot.categoria ?? ''} onChange={e => put(p.id, { categoria: e.target.value })} className="text-[11px] rounded px-1.5 py-1 outline-none" style={sel}>
                <option value="">Categoria…</option>
                {OPP_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={p.pivot.tipo_precificacao ?? ''} onChange={e => put(p.id, { tipo_precificacao: e.target.value })} className="text-[11px] rounded px-1.5 py-1 outline-none" style={sel}>
                <option value="">Precificação…</option>
                {OPP_PRECIFICACOES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: 'var(--text-light)' }}>Qtd
                <input key={`q${p.id}-${p.pivot.quantidade}`} type="number" step="0.01" min="0" defaultValue={String(p.pivot.quantidade)} onBlur={e => { if (e.target.value !== String(p.pivot.quantidade)) put(p.id, { quantidade: e.target.value === '' ? 0 : Number(e.target.value) }) }} className="w-full text-[11px] rounded px-1.5 py-1 outline-none text-right tabular-nums" style={sel} />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: 'var(--text-light)' }}>Preço unit.
                <input key={`v${p.id}-${p.pivot.valor}`} type="number" step="0.01" min="0" defaultValue={String(p.pivot.valor)} onBlur={e => { if (e.target.value !== String(p.pivot.valor)) put(p.id, { valor: e.target.value === '' ? 0 : Number(e.target.value) }) }} className="w-full text-[11px] rounded px-1.5 py-1 outline-none text-right tabular-nums" style={sel} />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: 'var(--text-light)' }}>Custo unit.
                <input key={`c${p.id}-${p.pivot.custo ?? 0}`} type="number" step="0.01" min="0" defaultValue={String(p.pivot.custo ?? 0)} onBlur={e => { if (e.target.value !== String(p.pivot.custo ?? 0)) put(p.id, { custo: e.target.value === '' ? 0 : Number(e.target.value) }) }} className="w-full text-[11px] rounded px-1.5 py-1 outline-none text-right tabular-nums" style={sel} />
              </label>
            </div>
            {(() => {
              const q = num(p.pivot.quantidade), v = num(p.pivot.valor), c = num(p.pivot.custo)
              const receita = q * v, custoTot = q * c, margem = receita - custoTot
              const margemPct = receita > 0 ? (margem / receita) * 100 : 0
              return (
                <div className="text-[10px] rounded px-2 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                  <span>{q} × {brl(v)} = <b style={{ color: 'var(--text)' }}>{brl(receita)}</b></span>
                  <span>· Custo {q} × {brl(c)} = {brl(custoTot)}</span>
                  <span>· Margem <b style={{ color: margem >= 0 ? '#16a34a' : 'var(--danger-border)' }}>{brl(margem)} ({margemPct.toFixed(1)}%)</b></span>
                </div>
              )
            })()}
          </div>
        ))}
      </div>
      {disponiveis.length > 0 && (
        <ProdutoAddSearch options={disponiveis} onPick={add} busy={busy} />
      )}
      <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-light)' }}>O total dos produtos (Σ quantidade × valor) soma ao Valor total da oportunidade.</p>
    </div>
  )
}
