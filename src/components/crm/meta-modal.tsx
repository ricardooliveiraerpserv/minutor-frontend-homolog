'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X, TrendingUp, Info } from 'lucide-react'

// Tipos persistidos no backend (inalterados) + rótulos e ajuda
export const META_TIPOS: { v: string; l: string; qtd?: boolean; help?: string }[] = [
  { v: 'receita', l: 'Receita (R$)' },
  { v: 'margem', l: 'Margem (R$)', help: 'Baseada na margem da oportunidade (valor − custo).' },
  { v: 'quantidade', l: 'Qtd. de negócios', qtd: true, help: 'Conta negócios ganhos no mês.' },
  { v: 'novos_clientes', l: 'Novos clientes', qtd: true, help: 'Conta apenas clientes inéditos (negócios do tipo Novo cliente).' },
  { v: 'receita_recorrente', l: 'Receita recorrente', help: 'Considera somente contratos recorrentes.' },
  { v: 'receita_projeto', l: 'Receita projeto', help: 'Receita de projetos fechados.' },
  { v: 'receita_sustentacao', l: 'Receita sustentação', help: 'Receita de contratos de sustentação.' },
]
export const tipoLabel = (v: string | null) => META_TIPOS.find(t => t.v === v)?.l ?? (v ?? 'Receita')
const isQtdTipo = (v: string) => !!META_TIPOS.find(t => t.v === v)?.qtd

// Categoria → modalidade
const RECEITA_MODS = [
  { v: 'receita', l: 'Receita Total' },
  { v: 'receita_recorrente', l: 'Recorrente' },
  { v: 'receita_projeto', l: 'Projeto' },
  { v: 'receita_sustentacao', l: 'Sustentação' },
  { v: 'margem', l: 'Margem' },
]
const catOf = (tipo: string) => tipo === 'quantidade' ? 'quantidade' : tipo === 'novos_clientes' ? 'clientes' : 'receita'

interface Resp { id: number; name: string; cargo?: string | null; meta?: number }
interface Atual { existe: boolean; meta: number; tipo: string; realizado: number; pct: number | null; ultima_alteracao: string | null; por: string | null }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const mesLabel = (comp: string) => { const [y, m] = comp.split('-'); const M = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']; return `${M[Number(m)]}/${y}` }
const fmtDt = (s: string | null) => s ? new Date(s.replace(' ', 'T')).toLocaleDateString('pt-BR') : null

export function MetaModal({ comp, responsaveis, initialUserId, onClose, onSaved }: {
  comp: string; responsaveis: Resp[]; initialUserId?: number; onClose: () => void; onSaved: () => void
}) {
  const [uid, setUid] = useState(initialUserId ? String(initialUserId) : '')
  const [competencia, setCompetencia] = useState(comp)
  const [cat, setCat] = useState('receita')
  const [tipo, setTipo] = useState('receita')
  const [cents, setCents] = useState('') // dígitos: centavos (receita) ou inteiro (quantidade)
  const [obs, setObs] = useState('')
  const [modo, setModo] = useState<'substituir' | 'somar'>('substituir')
  const [replOpt, setReplOpt] = useState('nao')
  const [replCustom, setReplCustom] = useState('3')
  const [escopo] = useState('individual')
  const [atual, setAtual] = useState<Atual | null>(null)
  const [saving, setSaving] = useState(false)

  const sel = responsaveis.find(x => String(x.id) === uid)
  const isQtd = isQtdTipo(tipo)
  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }

  // Desempenho / meta vigente do responsável na competência
  const loadAtual = useCallback(() => {
    if (!uid) { setAtual(null); return }
    api.get<{ data: Atual }>(`/crm/metas/atual?user_id=${uid}&competencia=${competencia}`).then(r => setAtual(r?.data ?? null)).catch(() => setAtual(null))
  }, [uid, competencia])
  useEffect(() => { loadAtual() }, [loadAtual])

  // Ao editar (veio com responsável), pré-preenche tipo/valor com a meta vigente (uma vez).
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (!prefilled && initialUserId && atual?.existe) {
      setTipo(atual.tipo); setCat(catOf(atual.tipo))
      setCents(isQtdTipo(atual.tipo) ? String(atual.meta) : String(Math.round(atual.meta * 100)))
      setPrefilled(true)
    }
  }, [atual, initialUserId, prefilled])

  const setCategoria = (c: string) => { setCat(c); setTipo(c === 'quantidade' ? 'quantidade' : c === 'clientes' ? 'novos_clientes' : 'receita') }

  // Valor mascarado
  const valorNum = isQtd ? Number(cents || '0') : Number(cents || '0') / 100
  const valorDisplay = isQtd ? (cents ? String(Number(cents)) : '') : (Number(cents || '0') / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  const dezMeses = Math.max(0, 12 - Number(competencia.slice(5, 7)))
  const replicarMeses = replOpt === 'nao' ? 0 : replOpt === 'prox' ? 1 : replOpt === '3' ? 2 : replOpt === '6' ? 5 : replOpt === 'dez' ? dezMeses : Math.max(0, Number(replCustom) - 1)
  const replLabel = replOpt === 'nao' ? 'Somente esta competência' : replOpt === 'prox' ? 'Este mês + próximo' : replOpt === '3' ? 'Próximos 3 meses' : replOpt === '6' ? 'Próximos 6 meses' : replOpt === 'dez' ? `Até dezembro (${dezMeses + 1} meses)` : `${Number(replCustom)} meses`

  const save = async () => {
    if (!uid) { toast.error('Escolha o responsável'); return }
    if (valorNum < 0 || (valorNum === 0 && !cents)) { toast.error('Informe o valor da meta'); return }
    setSaving(true)
    try {
      const r = await api.put<{ data: { periodos: string[] } }>('/crm/metas', {
        user_id: Number(uid), competencia, valor_meta: valorNum, tipo, escopo,
        observacao: obs || null, modo, replicar_meses: replicarMeses,
      })
      const n = r?.data?.periodos?.length ?? 1
      toast.success(n > 1 ? `Meta aplicada a ${n} competências` : 'Meta salva'); onSaved()
    } catch { toast.error('Erro ao salvar meta') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[94vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Definir meta</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="space-y-3.5">
          {/* Responsável + avatar/cargo */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Responsável</label>
            <select value={uid} onChange={e => setUid(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}>
              <option value="">Selecione…</option>
              {responsaveis.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {sel && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{initials(sel.name)}</div>
                <div><p className="text-sm font-medium leading-tight" style={{ color: 'var(--text)' }}>{sel.name}</p><p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{sel.cargo ?? '—'}</p></div>
              </div>
            )}
          </div>

          {/* Desempenho atual */}
          {atual?.existe && (
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)' }}>
              <div className="flex items-center gap-1.5 mb-1.5"><TrendingUp size={13} style={{ color: 'var(--primary)' }} /><span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Desempenho atual</span></div>
              <div className="flex items-center justify-between text-xs mb-1"><span style={{ color: 'var(--text-muted)' }}>Meta vigente</span><span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(atual.meta)}</span></div>
              <div className="flex items-center justify-between text-xs mb-1.5"><span style={{ color: 'var(--text-muted)' }}>Realizado</span><span className="tabular-nums font-semibold" style={{ color: '#17914e' }}>{fmtBRL(atual.realizado)} {atual.pct != null && `· ${Math.round(atual.pct)}%`}</span></div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}><div style={{ width: `${Math.min(100, atual.pct ?? 0)}%`, height: '100%', background: '#17914e' }} /></div>
              {atual.ultima_alteracao && <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-light)' }}>Última alteração {fmtDt(atual.ultima_alteracao)}{atual.por ? ` · ${atual.por}` : ''}</p>}
            </div>
          )}

          {/* Competência */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Competência <span style={{ color: 'var(--text-light)' }}>· meta mensal</span></label>
            <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} />
          </div>

          {/* Categoria + modalidade */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de meta</label>
            <div className="flex gap-1.5 mb-2">
              {[['receita', 'Receita'], ['quantidade', 'Quantidade'], ['clientes', 'Clientes']].map(([c, l]) => (
                <button key={c} onClick={() => setCategoria(c)} className="flex-1 text-xs px-2 py-1.5 rounded-lg font-medium" style={cat === c ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{l}</button>
              ))}
            </div>
            {cat === 'receita' && (
              <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} title={META_TIPOS.find(t => t.v === tipo)?.help}>
                {RECEITA_MODS.map(mo => <option key={mo.v} value={mo.v}>{mo.l}</option>)}
              </select>
            )}
            {(cat === 'quantidade' || cat === 'clientes') && (
              <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Info size={11} /> {META_TIPOS.find(t => t.v === tipo)?.help}</p>
            )}
          </div>

          {/* Valor mascarado */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isQtd ? 'Quantidade' : 'Valor da meta'}</label>
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
              {!isQtd && <span className="px-3 text-sm" style={{ color: 'var(--text-light)' }}>R$</span>}
              <input inputMode="numeric" value={valorDisplay} onChange={e => setCents(e.target.value.replace(/\D/g, ''))} className="flex-1 px-3 py-2 text-sm outline-none bg-transparent tabular-nums text-right" style={{ color: 'var(--text)' }} placeholder={isQtd ? '0' : '0,00'} />
            </div>
          </div>

          {/* Observação (auto-expand) */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Observação</label>
            <textarea value={obs} onChange={e => { setObs(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} rows={1} placeholder="Ex.: Meta revisada após reunião comercial." className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ ...inp, minHeight: 38 }} />
          </div>

          {/* Escopo */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Escopo</label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--text)' }}><input type="radio" checked readOnly /> Individual</label>
              {['Equipe', 'Unidade', 'Empresa'].map(e => (
                <label key={e} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-light)' }} title="Disponível em breve"><input type="radio" disabled /> {e} <span className="text-[9px] px-1 rounded" style={{ background: 'var(--surface-sunken)' }}>em breve</span></label>
              ))}
            </div>
          </div>

          {/* Atualização */}
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Como atualizar?</span>
            {(['substituir', 'somar'] as const).map(mo => (
              <label key={mo} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                <input type="radio" checked={modo === mo} onChange={() => setModo(mo)} /> {mo === 'substituir' ? 'Substituir' : 'Acrescentar'}
              </label>
            ))}
          </div>

          {/* Replicar */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Replicar</label>
            <select value={replOpt} onChange={e => setReplOpt(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}>
              <option value="nao">Não replicar</option>
              <option value="prox">Próximo mês</option>
              <option value="3">Próximos 3 meses</option>
              <option value="6">Próximos 6 meses</option>
              <option value="dez">Até dezembro</option>
              <option value="custom">Personalizado…</option>
            </select>
            {replOpt === 'custom' && <input inputMode="numeric" value={replCustom} onChange={e => setReplCustom(e.target.value.replace(/\D/g, ''))} placeholder="Nº de meses" className="w-full px-3 py-2 rounded-lg text-sm outline-none mt-2 tabular-nums" style={inp} />}
          </div>

          {/* Resumo */}
          {uid && cents && (
            <div className="rounded-lg p-3 text-xs space-y-1" style={{ border: '1px dashed var(--border)' }}>
              <p className="font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Resumo</p>
              <Res k="Responsável" v={sel?.name ?? '—'} />
              <Res k="Competência" v={mesLabel(competencia)} />
              <Res k="Tipo" v={tipoLabel(tipo)} />
              <Res k="Meta" v={isQtd ? `${valorNum} negócios` : fmtBRL(valorNum)} />
              <Res k="Atualização" v={modo === 'substituir' ? 'Substituir' : 'Acrescentar'} />
              <Res k="Replicação" v={replLabel} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function Res({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><span style={{ color: 'var(--text-muted)' }}>{k}</span><span className="font-medium tabular-nums" style={{ color: 'var(--text)' }}>{v}</span></div>
}
