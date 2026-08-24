'use client'

import { useEffect, useMemo, useState, useCallback, Fragment } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable, Button } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { MultiSelect } from '@/components/ui/multi-select'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { KeruakTitulosModal } from '@/components/shared/KeruakTitulosModal'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useTableSort } from '@/hooks/use-table-sort'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { escapeHtml } from '@/lib/sanitize'
import { TrendingUp, Download, FileText, X, ChevronDown, ChevronRight, RefreshCw, Check, Pencil, BarChart2, Wallet, Clock, Settings, Search } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

interface Row {
  user_id: number; consultor: string
  project_id: number; projeto: string; cliente: string
  valor_hora_projeto: number; valor_hora_consultor: number
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
  rate_type?: string; custo_fixo_mes?: number // 'monthly' = recebe fixo; salário mensal cheio
  fixo_excluir?: boolean // coordenador/diretor/Bizify → fora da seção Recebe Fixo
  is_investimento?: boolean // projeto de investimento (receita 0) — sempre incluído + em evidência
  categoria?: 'sustentacao' | 'projeto' // Cloud/Bizify/Sustentação = sustentacao
}
interface DiaRow { dia: string; user_id: number; project_id: number; cliente: string; horas: number; nao_util?: boolean }
// Consultor que recebe fixo SEM apontamento no período (custo do salário conta mesmo sem horas).
interface FixoZerado { user_id: number; consultor: string; custo_fixo_mes: number }
interface FixoExtra { user_id: number; extra_cost: number } // hora extra do banco de horas (BE), soma no Custo Fixo

// Linha exibida na tabela. Na visão "consultor" é a própria Row; na visão
// "projeto" é o consolidado de todos os consultores daquele projeto (custo/h = médio).
interface DisplayRow extends Row { key: string; n_consultores: number }

// Aba "Clientes": rentabilidade por cliente cruzada com o RECEBIMENTO do Keruak
// (por CNPJ). O recebido é sempre do mês seguinte ao apontamento (trabalha em M,
// recebe em M+1): apontamentos de maio ↔ recebimento de junho.
interface ProjetoRent { project_id: number; projeto: string; horas: number; custo: number; is_investimento: boolean }
interface ConsultorRent { user_id: number; consultor: string; valor_hora: number; horas: number; custo: number; tem_investimento?: boolean; projetos?: ProjetoRent[] }
interface ClienteRow {
  customer_id: number | null; cliente: string; cnpj: string; cnpjs?: string[]; executivo: string | null
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
  recebido: number; receita_total: number; em_aberto: number; receita_em_aberto?: number; margem_real: number; margem_real_pct: number | null; no_minutor: boolean
  consultores: ConsultorRent[]
  despesas?: { custo: number; projetos: DespesaProj[] }
  investimento_mo?: number; investimento_desp?: number
  // +40% Custo = 40% do Valor Recebido; Custo Total = Custo Operação + 40%; Resultado = Recebido − Custo Total.
  custo40: number; custo_total: number; resultado: number; resultado_pct: number | null; custo40_pct: number | null
  // Ajustes iniciais do ano (somados no custo/recebido): só p/ cliente cadastrado.
  custo_inicial?: number; receita_inicial?: number
}
interface DespesaUser { user_id: number; usuario: string; custo: number }
interface DespesaProj { project_id: number; projeto: string; custo: number; is_investimento: boolean; usuarios?: DespesaUser[] }

const fmtH = (h: number) => `${h.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`
const pctColor = (p: number | null) => p == null ? 'var(--text-light)' : p < 0 ? 'var(--danger)' : p < 20 ? 'var(--warning)' : 'var(--success)'

// Cores das colunas (mesmo conceito do BI): cabeçalho forte + célula tonalizada.
const COL_HEAD = { receita_total: '#1e6e2e', recebido: '#6aa84f', em_aberto: '#b8860b', custo: '#bf9000', custo40: '#d9683a', total: '#cc0000', resultado: '#1f6fbf', margem: '#bf9000' }
const COL_CELL = { receita_total: '#d9ead3', recebido: '#eaf4e6', em_aberto: '#fff2cc', custo: '#fff2cc', custo40: '#fce5cd', total: '#f4cccc', resultado: '#cfe2f3' }
const margemBg = (pct: number | null) => pct == null ? '#e5e7eb' : pct < 0 ? '#e06666' : pct < 5 ? '#f6b26b' : '#93c47d'
// Cor da legenda da Margem +40% (% mantido): <=49 vermelho, 50-79 amarelo, >=80 verde.
const pct40Color = (p: number | null) => p == null ? 'rgba(0,0,0,0.4)' : p >= 80 ? '#2e7d32' : p >= 50 ? '#b8860b' : '#cc0000'
// Cor da margem operacional ("Mg op."): >= 50% verde | 0 a 50% laranja | < 0 vermelho.
const mgOpColor = (p: number | null) => p == null ? 'rgba(0,0,0,0.4)' : p >= 50 ? '#2e7d32' : p >= 0 ? '#b8860b' : '#cc0000'

// Deriva a linha do cliente: injeta os AJUSTES INICIAIS do ano (custo inicial → Custo Operação,
// receita inicial → Valor Recebido) e recalcula todas as margens. Recebe a linha CRUA (soma dos
// meses) e o ajuste do cliente. Manter em sincronia com o cálculo do +40% no fechamento.
function deriveClienteRow(r: ClienteRow, init?: { custo_inicial: number; receita_inicial: number }): ClienteRow {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const custoInicial = init?.custo_inicial ?? 0
  const receitaInicial = init?.receita_inicial ?? 0
  const horas = r2(r.horas), receita = r2(r.receita)
  const custo = r2(r.custo + custoInicial)        // Custo Operação += custo inicial
  const recebido = r2(r.recebido)                 // Recebido (informativo — Valor Recebido do Keruak)
  const em_aberto = r2(r.receita_em_aberto ?? 0)  // Parcela+Multa dos títulos a receber (não pagos)
  // Receita Total = Parcela+Multa de TODOS os títulos (recebidos + em aberto) += receita inicial.
  // r.receita_total (do BE) é só dos recebidos; soma o em_aberto p/ a receita FATURADA (base da margem).
  // Fallback p/ recebido quando a fonte não separa parcela/multa (ex.: JSON BIZIFY).
  const receita_total = r2((r.receita_total ?? r.recebido) + em_aberto + receitaInicial)
  const margem = r2(receita - custo), margem_real = r2(receita_total - custo)
  const custo40Full = r2(receita_total * 0.40)
  let custo40 = custo40Full
  let resultado = r2(receita_total - custo - custo40)
  if (resultado < 0) {
    const absorvido = Math.min(-resultado, custo40)
    custo40 = r2(custo40 - absorvido)
    resultado = r2(resultado + absorvido)
  }
  const custo_total = r2(custo + custo40)
  const custo40_pct = custo40Full > 0 ? Math.round(custo40 / custo40Full * 1000) / 10 : null
  return {
    ...r, horas, receita, custo, recebido, receita_total, em_aberto, margem,
    margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
    margem_real, margem_real_pct: receita_total > 0 ? Math.round(margem_real / receita_total * 1000) / 10 : null,
    custo40, custo_total, resultado,
    resultado_pct: receita_total > 0 ? Math.round(resultado / receita_total * 1000) / 10 : (resultado < 0 ? -100 : null),
    custo40_pct,
    custo_inicial: custoInicial, receita_inicial: receitaInicial,
  }
}

// Editor inline dos ajustes iniciais do ano (custo/receita) de um cliente. Salva no blur.
function InitialsEditor({ custoInicial, receitaInicial, onSave }: {
  custoInicial: number; receitaInicial: number; onSave: (custo: number, receita: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [custo, setCusto] = useState(custoInicial ? String(custoInicial) : '')
  const [receita, setReceita] = useState(receitaInicial ? String(receitaInicial) : '')
  const startEdit = () => {
    setCusto(custoInicial ? String(custoInicial) : '')
    setReceita(receitaInicial ? String(receitaInicial) : '')
    setEditing(true)
  }
  const save = () => {
    const c = Number(custo) || 0, rec = Number(receita) || 0
    if (c !== custoInicial || rec !== receitaInicial) onSave(c, rec)
    setEditing(false)
  }
  const inp: React.CSSProperties = { width: 120, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, textAlign: 'right' }
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)' }
  return (
    <div className="flex items-center gap-4 flex-wrap" style={{ padding: '8px 8px 10px' }} onClick={e => e.stopPropagation()}>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Ajustes iniciais do ano</span>
      {editing ? (
        <>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Custo inicial
            <input autoFocus type="number" step="0.01" min="0" value={custo} onChange={e => setCusto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="0,00" style={inp} />
          </label>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Receita inicial
            <input type="number" step="0.01" min="0" value={receita} onChange={e => setReceita(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="0,00" style={inp} />
          </label>
          <button type="button" onClick={save} title="Salvar e fechar"
            style={{ ...btn, background: 'var(--success-bg)', borderColor: 'var(--success-border)', color: 'var(--success-border)' }}>
            <Check size={15} strokeWidth={3} />
          </button>
        </>
      ) : (
        <>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Custo inicial <b style={{ color: 'var(--text)' }}>{formatBRL(custoInicial)}</b></span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Receita inicial <b style={{ color: 'var(--text)' }}>{formatBRL(receitaInicial)}</b></span>
          <button type="button" onClick={startEdit} title="Editar"
            style={{ ...btn, background: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
            <Pencil size={14} />
          </button>
        </>
      )}
      <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Somam no Custo Operação e no Valor Recebido deste ano.</span>
    </div>
  )
}
const thCol = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.25)', position: 'sticky', top: 0, zIndex: 2 })
const tdCol = (bg: string, color = '#111827'): React.CSSProperties => ({ background: bg, color, padding: '6px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' })

// Tooltip dos gráficos de horas: Sustentação × Projeto × Total (+ nota fim de semana/feriado no diário).
function HorasCatTooltip({ active, payload, label }: { active?: boolean; payload?: { payload?: { suporte?: number; projeto?: number; investimento?: number; total?: number; horas?: number; naoUtil?: boolean } }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload ?? {}
  const sup = p.suporte ?? 0, proj = p.projeto ?? 0, inv = p.investimento ?? 0
  const tot = p.total ?? p.horas ?? (sup + proj + inv)
  const h = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`
  const row = (k: string, v: string, c: string, strong?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, ...(strong ? { borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4, fontWeight: 700 } : {}) }}>
      <span style={{ color: c }}>{k}</span><span className="tabular-nums" style={{ color: 'var(--text)' }}>{v}</span>
    </div>
  )
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--text)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}{p.naoUtil ? ' · fim de semana/feriado' : ''}</div>
      {row('Sustentação', h(sup), 'var(--primary)')}
      {row('Projeto', h(proj), 'var(--success-border)')}
      {p.investimento !== undefined && row('Investimento', h(inv), 'var(--danger)')}
      {row('Total', h(tot), 'var(--text)', true)}
    </div>
  )
}

// Ordena linhas por uma chave (string → alfabético; número → numérico).
function sortRows<T>(arr: T[], sort: { key: string; dir: 'asc' | 'desc' }): T[] {
  const { key, dir } = sort
  return [...arr].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key], bv = (b as Record<string, unknown>)[key]
    const c = (typeof av === 'string' || typeof bv === 'string')
      ? String(av ?? '').localeCompare(String(bv ?? ''))
      : ((Number(av) || 0) - (Number(bv) || 0))
    return dir === 'asc' ? c : -c
  })
}

// Cabeçalho de coluna clicável p/ ordenar (tabelas Recebe Fixo / Horistas).
function SortableTh({ label, k, sort, onSort, left, title }: { label: string; k: string; sort: { key: string; dir: 'asc' | 'desc' }; onSort: (k: string) => void; left?: boolean; title?: string }) {
  const active = sort.key === k
  return (
    <th onClick={() => onSort(k)} title={title}
      style={{ textAlign: left ? 'left' : 'right', padding: '6px 8px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: active ? 'var(--primary)' : undefined }}>
      {label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
}

// Selo de categoria do projeto (Sustentação = Cloud/Bizify/Sustentação; senão Projeto).
function CatBadge({ cat }: { cat?: 'sustentacao' | 'projeto' | 'misto' | null }) {
  if (!cat) return <span style={{ color: 'var(--text-light)' }}>—</span>
  const label = cat === 'misto' ? 'Misto' : cat === 'sustentacao' ? 'Sustentação' : 'Projeto'
  const color = cat === 'sustentacao' ? 'var(--primary)' : cat === 'misto' ? 'var(--warning)' : 'var(--text-muted)'
  return <span style={{ fontSize: 10, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 4, padding: '0 5px', whiteSpace: 'nowrap' }}>{label}</span>
}

const RENTAB_FILTERS_KEY = 'minutor_rentab_filtros_v1'
function lfRead(): Record<string, unknown> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(RENTAB_FILTERS_KEY) || '{}') } catch { return {} }
}
function lf<T>(o: Record<string, unknown>, key: string, def: T): T { return (key in o ? (o[key] as T) : def) }

// Modal admin: escolhe quais usuários aparecem na Rentabilidade. Desmarcar = oculto (sai da tela E dos totais).
interface CfgUser { id: number; name: string; type: string; enabled: boolean }
const CFG_TYPE_LABEL: Record<string, string> = { admin: 'Admin', coordenador: 'Coordenador', consultor: 'Consultor', parceiro_admin: 'Parceiro' }
function HiddenUsersModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<CfgUser[]>([])
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [q, setQ] = useState('')
  const [fType, setFType] = useState('') // filtro por tipo (admin/coordenador/…); '' = todos
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ hidden_ids: number[]; users: CfgUser[] }>('/relatorios/rentabilidade/hidden-users')
      .then(r => { setUsers(r?.users ?? []); setHidden(new Set(r?.hidden_ids ?? [])) })
      .catch(() => toast.error('Erro ao carregar usuários'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: number) => setHidden(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const types = [...new Set(users.map(u => u.type))]
  const filtered = users.filter(u => u.name.toLowerCase().includes(q.trim().toLowerCase()) && (!fType || u.type === fType))

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/relatorios/rentabilidade/hidden-users', { user_ids: [...hidden] })
      toast.success('Visibilidade atualizada')
      onSaved(); onClose()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--primary-soft)', borderBottom: '1px solid var(--border)' }}>
          <Settings size={18} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Quem aparece na Rentabilidade</span>
          <button onClick={onClose} className="ml-auto" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="px-5 pt-3">
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-light)' }}>
            Desmarque quem você <b>não</b> quer que apareça. Ocultos saem da tela <b>e</b> dos totais. · {hidden.size} oculto{hidden.size !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 mb-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-light)' }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar usuário…" className="text-sm outline-none w-full bg-transparent" style={{ color: 'var(--text)' }} />
          </div>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {['', ...types].map(val => (
                <button key={val || 'all'} type="button" onClick={() => setFType(val)}
                  className="text-[11px] px-2 py-0.5 rounded-full transition-colors"
                  style={{ background: fType === val ? 'var(--primary-soft)' : 'var(--surface-sunken)', color: fType === val ? 'var(--primary)' : 'var(--text-muted)', fontWeight: fType === val ? 600 : 400 }}>
                  {val ? (CFG_TYPE_LABEL[val] ?? val) : 'Todos'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 overflow-y-auto flex-1" style={{ minHeight: 140 }}>
          {loading && <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
          {!loading && filtered.map(u => {
            const visible = !hidden.has(u.id)
            return (
              <label key={u.id} className="flex items-center gap-2.5 py-2 border-t cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                <input type="checkbox" checked={visible} onChange={() => toggle(u.id)} className="h-4 w-4 cursor-pointer" style={{ accentColor: 'var(--primary)' }} />
                <span className="flex-1 text-sm" style={{ color: visible ? 'var(--text)' : 'var(--text-light)', textDecoration: visible ? 'none' : 'line-through' }}>{u.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{CFG_TYPE_LABEL[u.type] ?? u.type}</span>
                {!u.enabled && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>inativo</span>}
              </label>
            )
          })}
          {!loading && filtered.length === 0 && <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>Nenhum usuário.</p>}
        </div>
        <div className="px-5 py-3 flex justify-between items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex gap-3">
            <button onClick={() => setHidden(prev => { const n = new Set(prev); filtered.forEach(u => n.delete(u.id)); return n })} className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Mostrar todos</button>
            <button onClick={() => setHidden(prev => { const n = new Set(prev); filtered.forEach(u => n.add(u.id)); return n })} className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Ocultar todos</button>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
            <button onClick={save} disabled={saving || loading} className="text-sm px-5 py-2 rounded-lg font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: (saving || loading) ? .6 : 1 }}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RentabilidadePage({ visaoForced, embedded, periodo }: { visaoForced?: 'consultor' | 'projeto' | 'clientes'; embedded?: boolean; periodo?: { fromM: number; fromY: number; toM: number; toY: number } } = {}) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const [sf] = useState(lfRead)
  const [year, setYear]   = useState(() => lf(sf, 'year', currentYear))
  // Período (abas consultor/projeto): toggle Mês/Ano (mês único) ou Período (De..Até).
  const [periodModo, setPeriodModo] = useState<'mesano' | 'periodo'>(() => lf<'mesano' | 'periodo'>(sf, 'periodModo', 'mesano'))
  const [reloadTick, setReloadTick] = useState(0) // botão atualizar
  const { user } = useAuth()
  const isAdmin = (user?.type ?? '') === 'admin'
  const [showHiddenCfg, setShowHiddenCfg] = useState(false) // modal admin: quem aparece na Rentabilidade
  const [fromM, setFromM] = useState(() => lf(sf, 'fromM', currentMonth))
  const [fromY, setFromY] = useState(() => lf(sf, 'fromY', currentYear))
  const [toM, setToM]     = useState(() => lf(sf, 'toM', currentMonth))
  const [toY, setToY]     = useState(() => lf(sf, 'toY', currentYear))
  // Período por DIA (modo "Período"): intervalo de datas YYYY-MM-DD.
  const [dateFrom, setDateFrom] = useState(() => lf(sf, 'dateFrom', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`))
  const [dateTo, setDateTo]     = useState(() => lf(sf, 'dateTo', new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]))
  // Embutido (Portal de Sustentação): o período vem do filtro do portal via prop.
  useEffect(() => {
    if (periodo) { setFromM(periodo.fromM); setFromY(periodo.fromY); setToM(periodo.toM); setToY(periodo.toY) }
  }, [periodo?.fromM, periodo?.fromY, periodo?.toM, periodo?.toY])
  const [rows, setRows]   = useState<Row[]>([])
  const [monthly, setMonthly] = useState<{ ym: string; rows: Row[]; dias: DiaRow[]; fixos: FixoZerado[]; extras: FixoExtra[] }[]>([]) // dados crus por mês (gráficos + fixos)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState(() => lf(sf, 'busca', ''))
  const [incluirErpserv, setIncluirErpserv] = useState(() => lf(sf, 'incluirErpserv', true)) // Consultor×Projeto: incluir apontamentos da ERPSERV (interna) nos dados/totais
  const [fCategoria, setFCategoria] = useState<'' | 'sustentacao' | 'projeto' | 'investimento'>('') // filtro por segmento (cards clicáveis) — NÃO persiste: abre sempre em "Total" p/ não "grudar" num segmento entre sessões
  const [diaModal, setDiaModal] = useState<string | null>(null) // dia (YYYY-MM-DD) clicado no gráfico "Horas apontadas por dia"
  const [fCliente, setFCliente]     = useState(() => lf(sf, 'fCliente', ''))
  const [fProjeto, setFProjeto]     = useState(() => lf(sf, 'fProjeto', ''))
  const [fConsultor, setFConsultor] = useState<string[]>(() => {
    const v = lf(sf, 'fConsultor', [] as string[])
    return Array.isArray(v) ? v.map(String) : (v ? [String(v)] : [])
  })
  // Persiste os filtros (consultor/projeto) entre reloads — não no modo embutido (usa o filtro do portal).
  useEffect(() => {
    if (embedded || typeof window === 'undefined') return
    try { localStorage.setItem(RENTAB_FILTERS_KEY, JSON.stringify({ periodModo, fromM, fromY, toM, toY, dateFrom, dateTo, busca, incluirErpserv, fCategoria, fCliente, fProjeto, fConsultor, year })) } catch { /* noop */ }
  }, [embedded, periodModo, fromM, fromY, toM, toY, dateFrom, dateTo, busca, incluirErpserv, fCategoria, fCliente, fProjeto, fConsultor, year])
  // Cada visão é uma rotina própria no menu Relatórios (sub-rotas que reusam este
  // componente). A visão é derivada do pathname:
  //   /relatorios/rentabilidade            → Clientes (BI Keruak)
  //   /relatorios/rentabilidade/consultor  → Consultor × Projeto
  //   /relatorios/rentabilidade/projeto    → Por projeto
  const pathname = usePathname()
  const visao: 'consultor' | 'projeto' | 'clientes' = visaoForced ??
    (pathname?.endsWith('/rentabilidade/consultor') ? 'consultor'
    : pathname?.endsWith('/rentabilidade/projeto') ? 'projeto'
    : 'clientes')
  // Linhas CRUAS (agregadas dos meses, sem ajuste inicial). A derivação (que injeta os
  // iniciais do ano e calcula margens) é feita em useMemo abaixo → editar é instantâneo.
  const [rawClientesRows, setRawClientesRows] = useState<ClienteRow[]>([])
  // Ajustes iniciais do ANO por cliente: { customer_id: { custo_inicial, receita_inicial } }.
  const [initials, setInitials] = useState<Record<number, { custo_inicial: number; receita_inicial: number }>>({})
  const [clientesLoading, setClientesLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [soMinutor, setSoMinutor] = useState(false)
  const [soForaMinutor, setSoForaMinutor] = useState(false)
  const [considerarErpserv, setConsiderarErpserv] = useState(false) // ERPSERV vem separada; botão p/ incluí-la (ou não) nos totais
  const [fExecutivo, setFExecutivo] = useState('')
  // Drill-down: títulos do Keruak ao clicar no Valor Recebido de um cliente.
  const [keruakModal, setKeruakModal] = useState<{ cliente: string; cnpjs: string[]; valorInicial: number; modo?: 'recebido' | 'aberto' } | null>(null)
  const [fConsultorCli, setFConsultorCli] = useState('')
  const [expandedCli, setExpandedCli] = useState<Set<string>>(new Set())
  const [expandedCons, setExpandedCons] = useState<Set<string>>(new Set()) // consultor expandido → projetos que atuou

  // Filtro ANUAL. Minutor a partir de maio/2026 (início dos dados); anos seguintes
  // começam em janeiro. NUNCA traz o mês ATUAL — vai sempre até o mês ANTERIOR (mês
  // corrente incompleto e recebimento Keruak M+1 ainda não chegou). Anos anteriores
  // vão até dezembro. O endpoint de clientes pareia Minutor[M] × Keruak[M+1].
  const monthsToFetch = useMemo(() => {
    const out: string[] = []
    // Clientes (BI Keruak): ANUAL, NUNCA traz o mês atual (recebimento M+1 ainda não chegou).
    if (visao === 'clientes') {
      const startMonth = year <= 2026 ? 5 : 1
      const endMonth = year === currentYear ? currentMonth - 1 : 12
      for (let m = startMonth; m <= endMonth; m++) out.push(`${year}-${String(m).padStart(2, '0')}`)
      return out
    }
    // Consultor/Projeto. Modo "Período" = intervalo de DIAS → busca os meses que ele cobre
    // (a BE clampa cada mês ao range via ?from/?to). Modo "Mês/Ano" = mês único.
    if (periodModo === 'periodo') {
      const [fy, fm] = dateFrom.split('-').map(Number)
      const [ty, tm] = dateTo.split('-').map(Number)
      let y = fy, m = fm, guard = 0
      while ((y < ty || (y === ty && m <= tm)) && guard++ < 60) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
      return out
    }
    let y = fromY, m = fromM, guard = 0
    while ((y < toY || (y === toY && m <= toM)) && guard++ < 60) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return out
  }, [visao, year, currentYear, currentMonth, periodModo, dateFrom, dateTo, fromM, fromY, toM, toY])

  // Meses de recebimento Keruak (M+1) que compõem o Valor Recebido exibido —
  // usados pelo drill-down de títulos pra o total bater com a célula.
  const recebMonths = useMemo(() => monthsToFetch.map(ym => {
    const [y, m] = ym.split('-').map(Number)
    const ny = m === 12 ? y + 1 : y
    const nm = m === 12 ? 1 : m + 1
    return `${ny}-${String(nm).padStart(2, '0')}`
  }), [monthsToFetch])

  useEffect(() => {
    setLoading(true)
    // Modo "Período" (dias): clampa o range a cada mês via ?from/?to. Mês/Ano = mês inteiro.
    const clamp = (ym: string) => {
      if (periodModo !== 'periodo') return ''
      const [yy, mm] = ym.split('-').map(Number)
      const mStart = `${ym}-01`, mEnd = `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
      return `?from=${dateFrom > mStart ? dateFrom : mStart}&to=${dateTo < mEnd ? dateTo : mEnd}`
    }
    // Apontamento na ERPSERV (empresa interna) = INVESTIMENTO: normaliza is_investimento
    // na ingestão → propaga p/ segmento, gráfico diário, Horas Invest e selo de uma vez.
    const isErpsRow = (c?: string) => (c || '').toUpperCase().includes('ERPSERV')
    Promise.all(monthsToFetch.map(ym =>
      api.get<{ data: { rows: Row[]; por_dia?: DiaRow[]; fixos_zerados?: FixoZerado[]; fixos_extras?: FixoExtra[] } }>(`/relatorios/rentabilidade/${ym}${clamp(ym)}`)
        .then(r => ({ ym, rows: (r?.data?.rows ?? []).map(row => ({ ...row, is_investimento: !!row.is_investimento || isErpsRow(row.cliente) })), dias: r?.data?.por_dia ?? [], fixos: r?.data?.fixos_zerados ?? [], extras: r?.data?.fixos_extras ?? [] })).catch(() => ({ ym, rows: [] as Row[], dias: [] as DiaRow[], fixos: [] as FixoZerado[], extras: [] as FixoExtra[] }))
    )).then(perMonth => {
      setMonthly(perMonth)
      const results = perMonth.map(x => x.rows)
      const all = results.flat()
      if (monthsToFetch.length === 1) { setRows(all); return }
      // Período: agrega por consultor × projeto somando horas/receita/custo.
      const map = new Map<string, Row>()
      for (const r of all) {
        const k = `${r.user_id}:${r.project_id}`
        const e = map.get(k)
        if (!e) map.set(k, { ...r })
        else { e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.valor_hora_projeto = r.valor_hora_projeto; e.valor_hora_consultor = r.valor_hora_consultor }
      }
      setRows([...map.values()].map(r => {
        const horas = Math.round(r.horas * 100) / 100, receita = Math.round(r.receita * 100) / 100, custo = Math.round(r.custo * 100) / 100
        const margem = Math.round((receita - custo) * 100) / 100
        return { ...r, horas, receita, custo, margem, margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null }
      }))
    }).finally(() => setLoading(false))
  }, [monthsToFetch, reloadTick, periodModo, dateFrom, dateTo])

  // Aba Clientes: busca a rentabilidade-por-cliente + recebido Keruak (M+1).
  // refresh=true → ?refresh=1 (botão "Atualizar Keruak": ignora o cache de 3h).
  const loadClientes = useCallback((refresh = false) => {
    if (refresh) setRefreshing(true); else setClientesLoading(true)
    const qs = refresh ? '?refresh=1' : ''
    return Promise.all(monthsToFetch.map(ym =>
      api.get<{ data: { rows: ClienteRow[] } }>(`/relatorios/rentabilidade/clientes/${ym}${qs}`)
        .then(r => r?.data?.rows ?? []).catch(() => [] as ClienteRow[])
    )).then(results => {
      const all = results.flat()
      const map = new Map<string, ClienteRow>()
      for (const r of all) {
        const k = r.customer_id != null ? 'c' + r.customer_id : (r.cnpj || r.cliente)
        const e = map.get(k)
        if (!e) map.set(k, { ...r,
          consultores: (r.consultores || []).map(c => ({ ...c, projetos: (c.projetos || []).map(p => ({ ...p })) })),
          despesas: r.despesas ? { custo: r.despesas.custo, projetos: (r.despesas.projetos || []).map(p => ({ ...p, usuarios: (p.usuarios || []).map(u => ({ ...u })) })) } : undefined,
        })
        else {
          e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.recebido += r.recebido
          e.receita_total = (e.receita_total ?? 0) + (r.receita_total ?? 0)
          // Em Aberto é SALDO ATUAL (mesmo valor repetido em cada mês) → MAX, não soma (senão N× overcount).
          e.receita_em_aberto = Math.max(e.receita_em_aberto ?? 0, r.receita_em_aberto ?? 0)
          e.investimento_mo = (e.investimento_mo ?? 0) + (r.investimento_mo ?? 0)
          e.investimento_desp = (e.investimento_desp ?? 0) + (r.investimento_desp ?? 0)
          e.no_minutor = e.no_minutor || r.no_minutor
          if (!e.executivo && r.executivo) e.executivo = r.executivo
          if (r.despesas) {
            e.despesas = e.despesas || { custo: 0, projetos: [] }
            e.despesas.custo += r.despesas.custo
            for (const p of (r.despesas.projetos || [])) {
              const ep = e.despesas.projetos.find(x => x.project_id === p.project_id)
              if (ep) {
                ep.custo += p.custo; ep.is_investimento = ep.is_investimento || p.is_investimento
                ep.usuarios = ep.usuarios || []
                for (const u of (p.usuarios || [])) {
                  const eu = ep.usuarios.find(x => x.user_id === u.user_id)
                  if (eu) eu.custo += u.custo
                  else ep.usuarios.push({ ...u })
                }
              } else e.despesas.projetos.push({ ...p, usuarios: (p.usuarios || []).map(u => ({ ...u })) })
            }
          }
          for (const c of (r.consultores || [])) {
            const ex = e.consultores.find(x => x.user_id === c.user_id)
            if (ex) {
              ex.horas += c.horas; ex.custo += c.custo
              ex.tem_investimento = ex.tem_investimento || c.tem_investimento
              for (const p of (c.projetos || [])) {
                const ep = (ex.projetos = ex.projetos || []).find(x => x.project_id === p.project_id)
                if (ep) { ep.horas += p.horas; ep.custo += p.custo; ep.is_investimento = ep.is_investimento || p.is_investimento }
                else ex.projetos.push({ ...p })
              }
            } else e.consultores.push({ ...c, projetos: (c.projetos || []).map(p => ({ ...p })) })
          }
        }
      }
      // Guarda CRU; a derivação (injeção dos iniciais + margens) é o useMemo clientesRows.
      setRawClientesRows([...map.values()])
    }).finally(() => { setClientesLoading(false); setRefreshing(false) })
  }, [monthsToFetch])

  useEffect(() => { if (visao === 'clientes') void loadClientes(false) }, [visao, loadClientes])

  // Ajustes iniciais do ano (custo/receita inicial por cliente). Buscados 1x por ano.
  useEffect(() => {
    if (visao !== 'clientes') return
    api.get<{ data: Record<number, { custo_inicial: number; receita_inicial: number }> }>(`/relatorios/rentabilidade/initials/${year}`)
      .then(r => setInitials(r?.data ?? {}))
      .catch(() => setInitials({}))
  }, [visao, year])

  // Derivação: injeta os iniciais do ano e calcula margens (instantâneo ao editar).
  const clientesRows = useMemo(
    () => rawClientesRows.map(r => deriveClienteRow(r, r.customer_id != null ? initials[r.customer_id] : undefined)),
    [rawClientesRows, initials],
  )

  // Salva o ajuste inicial de um cliente (upsert) e atualiza local (re-deriva na hora).
  const saveInitial = useCallback(async (customerId: number, custo: number, receita: number) => {
    try {
      await api.put('/relatorios/rentabilidade/initials', { customer_id: customerId, year, custo_inicial: custo, receita_inicial: receita })
      setInitials(prev => ({ ...prev, [customerId]: { custo_inicial: custo, receita_inicial: receita } }))
      toast.success('Ajuste inicial salvo')
    } catch {
      toast.error('Erro ao salvar ajuste inicial')
    }
  }, [year])

  // Opções dos filtros (distintos, derivados das linhas carregadas).
  const optClientes = useMemo(() => {
    const set = new Map<string, string>()
    rows.forEach(r => { if (r.cliente) set.set(r.cliente, r.cliente) })
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ id: c, name: c }))
  }, [rows])
  const optProjetos = useMemo(() => {
    const set = new Map<number, string>()
    rows.forEach(r => set.set(r.project_id, r.projeto))
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => ({ id, name }))
  }, [rows])
  const optConsultores = useMemo(() => {
    const set = new Map<number, string>()
    rows.forEach(r => set.set(r.user_id, r.consultor))
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => ({ id, name }))
  }, [rows])

  // ERPSERV = empresa interna; quando o toggle "Incluir ERPSERV" está off, seus
  // apontamentos saem da tabela, totais e gráficos do Consultor×Projeto.
  const isErpservNome = (c?: string) => (c || '').toUpperCase().includes('ERPSERV')
  // Segmento do apontamento p/ os cards/filtro (partição exclusiva, igual ao gráfico): investimento sai de sust/proj.
  const catSeg = (r: Row): 'sustentacao' | 'projeto' | 'investimento' => r.is_investimento ? 'investimento' : (r.categoria === 'sustentacao' ? 'sustentacao' : 'projeto')

  const filteredBase = useMemo(() => rows.filter(r => {
    if (!incluirErpserv && isErpservNome(r.cliente)) return false
    if (fCliente && r.cliente !== fCliente) return false
    if (fProjeto && String(r.project_id) !== fProjeto) return false
    if (fConsultor.length > 0 && !fConsultor.includes(String(r.user_id))) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      if (!r.consultor.toLowerCase().includes(q) && !r.projeto.toLowerCase().includes(q) && !r.cliente.toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, busca, incluirErpserv, fCliente, fProjeto, fConsultor])
  // fCategoria (cards clicáveis) aplicado sobre a base; os cards usam filteredBase p/ mostrar SEMPRE as duas categorias.
  const filtered = useMemo(() => fCategoria ? filteredBase.filter(r => catSeg(r) === fCategoria) : filteredBase, [filteredBase, fCategoria])
  const totCat = useMemo(() => {
    const mk = () => ({ horas: 0, receita: 0, custo: 0 })
    const cat: Record<'sustentacao' | 'projeto' | 'investimento', { horas: number; receita: number; custo: number }> = { sustentacao: mk(), projeto: mk(), investimento: mk() }
    for (const r of filteredBase) { const k = catSeg(r); cat[k].horas += r.horas; cat[k].receita += r.receita; cat[k].custo += r.custo }
    return cat
  }, [filteredBase])

  const r2 = (n: number) => Math.round(n * 100) / 100
  const fmtMesCurto = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(y).slice(2) }
  // Categoria por projeto (resolve a categoria dos apontamentos diários, que só têm project_id).
  const catByProject = useMemo(() => {
    const m = new Map<number, 'sustentacao' | 'projeto'>()
    for (const { rows: mr } of monthly) for (const r of mr) m.set(r.project_id, r.categoria === 'sustentacao' ? 'sustentacao' : 'projeto')
    return m
  }, [monthly])
  // Projetos de investimento (p/ o segmento do gráfico diário, que só tem project_id).
  const investByProject = useMemo(() => {
    const s = new Set<number>()
    for (const { rows: mr } of monthly) for (const r of mr) if (r.is_investimento) s.add(r.project_id)
    return s
  }, [monthly])

  // Gráfico de apontamento (horas). Sem consultor filtrado → barras POR CONSULTOR (top 15);
  // com consultor filtrado → barras POR PERÍODO (mês a mês do consultor selecionado).
  const chartData = useMemo(() => {
    const passaFiltro = (r: Row) => {
      if (!incluirErpserv && isErpservNome(r.cliente)) return false
      if (fCategoria && catSeg(r) !== fCategoria) return false
      if (fCliente && r.cliente !== fCliente) return false
      if (fProjeto && String(r.project_id) !== fProjeto) return false
      if (busca.trim()) {
        const q = busca.trim().toLowerCase()
        if (!r.consultor.toLowerCase().includes(q) && !r.projeto.toLowerCase().includes(q) && !r.cliente.toLowerCase().includes(q)) return false
      }
      return true
    }
    // Segmento sem dupla contagem: investimento sai de sustentação/projeto.
    const seg = (r: Row): 'investimento' | 'suporte' | 'projeto' => r.is_investimento ? 'investimento' : (r.categoria === 'sustentacao' ? 'suporte' : 'projeto')
    if (fConsultor.length > 0) {
      return monthly.map(({ ym, rows: mr }) => {
        let sup = 0, proj = 0, inv = 0
        for (const r of mr) { if (!fConsultor.includes(String(r.user_id)) || !passaFiltro(r)) continue; const s = seg(r); if (s === 'investimento') inv += r.horas; else if (s === 'suporte') sup += r.horas; else proj += r.horas }
        return { label: fmtMesCurto(ym), suporte: r2(sup), projeto: r2(proj), investimento: r2(inv), horas: r2(sup + proj + inv) }
      })
    }
    const map = new Map<number, { label: string; suporte: number; projeto: number; investimento: number }>()
    for (const r of filtered) {
      const e = map.get(r.user_id) ?? { label: r.consultor, suporte: 0, projeto: 0, investimento: 0 }
      const s = seg(r); if (s === 'investimento') e.investimento += r.horas; else if (s === 'suporte') e.suporte += r.horas; else e.projeto += r.horas
      map.set(r.user_id, e)
    }
    return [...map.values()].map(e => ({ label: e.label, suporte: r2(e.suporte), projeto: r2(e.projeto), investimento: r2(e.investimento), horas: r2(e.suporte + e.projeto + e.investimento) })).sort((a, b) => b.horas - a.horas)
  }, [fConsultor, monthly, filtered, incluirErpserv, fCategoria, fCliente, fProjeto, busca])

  // Gráfico de horas apontadas POR DIA (respeita filtros consultor/cliente/projeto + período).
  // Mês filtrado (≤ ~31 dias) mostra o mês inteiro; período longo → últimos 60 dias (legibilidade).
  const DIA_MAX = 60
  const diaChart = useMemo(() => {
    const map = new Map<string, { suporte: number; projeto: number; naoUtil: boolean }>()
    for (const { dias } of monthly) {
      for (const d of dias) {
        if (fConsultor.length > 0 && !fConsultor.includes(String(d.user_id))) continue
        if (fProjeto && String(d.project_id) !== fProjeto) continue
        if (fCliente && d.cliente !== fCliente) continue
        if (!incluirErpserv && isErpservNome(d.cliente)) continue
        const cat = catByProject.get(d.project_id) ?? 'projeto'
        const seg = investByProject.has(d.project_id) ? 'investimento' : cat
        if (fCategoria && seg !== fCategoria) continue
        const e = map.get(d.dia) ?? { suporte: 0, projeto: 0, naoUtil: !!d.nao_util }
        if (cat === 'sustentacao') e.suporte += d.horas; else e.projeto += d.horas
        map.set(d.dia, e)
      }
    }
    const all = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, v]) => ({ label: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, suporte: r2(v.suporte), projeto: r2(v.projeto), total: r2(v.suporte + v.projeto), naoUtil: v.naoUtil, dia }))
    const limitado = all.length > DIA_MAX
    const data = limitado ? all.slice(-DIA_MAX) : all
    return { data, limitado, total: r2(data.reduce((s, d) => s + d.total, 0)), temNaoUtil: data.some(d => d.naoUtil) }
  }, [monthly, fConsultor, fProjeto, fCliente, incluirErpserv, fCategoria, catByProject, investByProject])

  // Nome do consultor/projeto por user_id:project_id (resolve os IDs dos apontamentos diários).
  const nomesByUP = useMemo(() => {
    const m = new Map<string, { consultor: string; projeto: string; cliente: string }>()
    for (const { rows: mr } of monthly) for (const r of mr) m.set(`${r.user_id}:${r.project_id}`, { consultor: r.consultor, projeto: r.projeto, cliente: r.cliente })
    return m
  }, [monthly])

  // Detalhe do dia clicado (modal): apontamentos do dia respeitando os filtros ativos.
  const diaDetalhe = useMemo(() => {
    if (!diaModal) return null
    const itens: { consultor: string; projeto: string; cliente: string; horas: number }[] = []
    for (const { dias } of monthly) for (const d of dias) {
      if (d.dia !== diaModal) continue
      if (fConsultor.length > 0 && !fConsultor.includes(String(d.user_id))) continue
      if (fProjeto && String(d.project_id) !== fProjeto) continue
      if (fCliente && d.cliente !== fCliente) continue
      if (!incluirErpserv && isErpservNome(d.cliente)) continue
      const nm = nomesByUP.get(`${d.user_id}:${d.project_id}`)
      itens.push({ consultor: nm?.consultor ?? `#${d.user_id}`, projeto: nm?.projeto ?? `#${d.project_id}`, cliente: d.cliente, horas: r2(d.horas) })
    }
    itens.sort((a, b) => b.horas - a.horas)
    return { itens, total: r2(itens.reduce((s, i) => s + i.horas, 0)) }
  }, [diaModal, monthly, nomesByUP, fConsultor, fProjeto, fCliente, incluirErpserv])

  // Seção "Recebe Fixo": consultores com rate_type 'monthly'. Custo Fixo = salário/mês ×
  // nº de meses do período; Receita = apontamentos no período; Resultado = Receita − Custo Fixo.
  // Derivado do MESMO `filtered` da tabela (mesmos filtros) → as horas/receita batem com a linha do consultor.
  const fixosData = useMemo(() => {
    // Horas de investimento por consultor — INCLUI ERPSERV e ignora soReceita/categoria (só is_investimento), no período.
    const investByUser = new Map<number, number>()
    for (const { rows: mr } of monthly) for (const r of mr) {
      if (!r.is_investimento) continue
      if (fConsultor.length > 0 && !fConsultor.includes(String(r.user_id))) continue
      investByUser.set(r.user_id, (investByUser.get(r.user_id) ?? 0) + r.horas)
    }
    // Recebe Fixo mostra SEMPRE todos os fixos (o salário é fixo, independe de cliente/projeto):
    // itera as linhas CRUAS (não o `filtered`) → ignora filtros de Cliente/Projeto/Categoria/busca.
    // Só o filtro de Consultor e o Incluir ERPSERV valem; o consultor aparece mesmo com receita 0.
    const byUser = new Map<number, { user_id: number; consultor: string; receita: number; custoHoras: number; horas: number; salary: number }>()
    for (const { rows: mr } of monthly) for (const r of mr) {
      if (r.rate_type !== 'monthly') continue
      // coord/diretor/Bizify NÃO são excluídos: quem entra é decidido só na config Visibilidade (ocultos).
      if (fConsultor.length > 0 && !fConsultor.includes(String(r.user_id))) continue
      const e = byUser.get(r.user_id) ?? { user_id: r.user_id, consultor: r.consultor, receita: 0, custoHoras: 0, horas: 0, salary: 0 }
      if (incluirErpserv || !isErpservNome(r.cliente)) { e.receita += r.receita; e.custoHoras += r.custo; e.horas += r.horas }
      if (r.custo_fixo_mes) e.salary = r.custo_fixo_mes
      byUser.set(r.user_id, e)
    }
    // Fixos SEM apontamento no período (vêm à parte do BE): o custo do salário conta
    // mesmo sem horas → entram com receita/horas 0 e resultado negativo.
    const zerados = new Map<number, FixoZerado>()
    for (const { fixos } of monthly) for (const z of fixos) zerados.set(z.user_id, z)
    for (const z of zerados.values()) {
      if (fConsultor.length > 0 && !fConsultor.includes(String(z.user_id))) continue
      const e = byUser.get(z.user_id)
      if (!e) byUser.set(z.user_id, { user_id: z.user_id, consultor: z.consultor, receita: 0, custoHoras: 0, horas: 0, salary: z.custo_fixo_mes })
      else if (!e.salary) e.salary = z.custo_fixo_mes
    }
    // Hora extra do BANCO DE HORAS (do BE, por mês) → entra no Custo Fixo do consultor.
    const extraByUser = new Map<number, number>()
    for (const { extras } of monthly) for (const x of extras) extraByUser.set(x.user_id, (extraByUser.get(x.user_id) ?? 0) + x.extra_cost)
    const nMeses = monthsToFetch.length || 1
    return [...byUser.values()].map(e => {
      const extra = r2(extraByUser.get(e.user_id) ?? 0)   // hora extra (banco de horas)
      const custoFixo = r2(e.salary * nMeses + extra)      // salário cheio + hora extra
      return { ...e, extra, receita: r2(e.receita), custoHoras: r2(e.custoHoras), horas: r2(e.horas), horasInvest: r2(investByUser.get(e.user_id) ?? 0), nMeses, custoFixo, resultado: r2(e.receita - custoFixo) }
    }).sort((a, b) => a.resultado - b.resultado)
  }, [monthsToFetch, monthly, fConsultor, incluirErpserv])
  const fixosTot = useMemo(() => fixosData.reduce((a, f) => ({ custoFixo: a.custoFixo + f.custoFixo, receita: a.receita + f.receita, resultado: a.resultado + f.resultado, horasInvest: a.horasInvest + f.horasInvest, horas: a.horas + f.horas, extra: a.extra + f.extra }), { custoFixo: 0, receita: 0, resultado: 0, horasInvest: 0, horas: 0, extra: 0 }), [fixosData])
  const [fixoSort, setFixoSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'resultado', dir: 'asc' })
  const sortFixo = (k: string) => setFixoSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' })
  const fixosSorted = useMemo(() => sortRows(fixosData, fixoSort), [fixosData, fixoSort])

  // Seção "Horistas": consultores NÃO mensalistas (rate_type ≠ monthly). Custo = horas × R$/h.
  // Como o Recebe Fixo: itera as linhas CRUAS (ignora filtros de Cliente/Projeto); coord/diretor/Bizify
  // NÃO são excluídos — quem entra é decidido só na config Visibilidade. Só Consultor + Incluir ERPSERV valem.
  const horistasData = useMemo(() => {
    const investByUser = new Map<number, number>()
    for (const { rows: mr } of monthly) for (const r of mr) {
      if (!r.is_investimento) continue
      if (fConsultor.length > 0 && !fConsultor.includes(String(r.user_id))) continue
      investByUser.set(r.user_id, (investByUser.get(r.user_id) ?? 0) + r.horas)
    }
    const byUser = new Map<number, { user_id: number; consultor: string; receita: number; custo: number; horas: number }>()
    for (const { rows: mr } of monthly) for (const r of mr) {
      if (r.rate_type === 'monthly') continue // horista = não mensalista
      if (fConsultor.length > 0 && !fConsultor.includes(String(r.user_id))) continue
      const e = byUser.get(r.user_id) ?? { user_id: r.user_id, consultor: r.consultor, receita: 0, custo: 0, horas: 0 }
      if (incluirErpserv || !isErpservNome(r.cliente)) { e.receita += r.receita; e.custo += r.custo; e.horas += r.horas }
      byUser.set(r.user_id, e)
    }
    return [...byUser.values()].map(e => ({
      ...e, receita: r2(e.receita), custo: r2(e.custo), horas: r2(e.horas),
      horasInvest: r2(investByUser.get(e.user_id) ?? 0), rhCusto: e.horas > 0 ? r2(e.custo / e.horas) : 0, resultado: r2(e.receita - e.custo),
    })).sort((a, b) => a.resultado - b.resultado)
  }, [monthly, fConsultor, incluirErpserv])
  const horistasTot = useMemo(() => horistasData.reduce((a, h) => ({ horas: a.horas + h.horas, horasInvest: a.horasInvest + h.horasInvest, receita: a.receita + h.receita, custo: a.custo + h.custo, resultado: a.resultado + h.resultado }), { horas: 0, horasInvest: 0, receita: 0, custo: 0, resultado: 0 }), [horistasData])
  const [horistaSort, setHoristaSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'resultado', dir: 'asc' })
  const sortHorista = (k: string) => setHoristaSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' })
  const horistasSorted = useMemo(() => sortRows(horistasData, horistaSort), [horistasData, horistaSort])

  // Linhas-pai: consolidado por projeto (soma horas/receita/custo, conta consultores,
  // custo/h = custo total ÷ horas). Cada pai expande nas linhas dos consultores.
  const projectRows = useMemo<DisplayRow[]>(() => {
    const map = new Map<number, { projeto: string; cliente: string; vhp: number; horas: number; receita: number; custo: number; users: Set<number>; inv: boolean }>()
    for (const r of filtered) {
      let e = map.get(r.project_id)
      if (!e) { e = { projeto: r.projeto, cliente: r.cliente, vhp: r.valor_hora_projeto, horas: 0, receita: 0, custo: 0, users: new Set(), inv: false }; map.set(r.project_id, e) }
      e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.users.add(r.user_id); e.inv = e.inv || !!r.is_investimento
    }
    return [...map.entries()].map(([project_id, e]) => {
      const horas = Math.round(e.horas * 100) / 100, receita = Math.round(e.receita * 100) / 100, custo = Math.round(e.custo * 100) / 100
      const margem = Math.round((receita - custo) * 100) / 100
      return {
        key: `p${project_id}`, user_id: 0, consultor: '', n_consultores: e.users.size,
        project_id, projeto: e.projeto, cliente: e.cliente, is_investimento: e.inv,
        valor_hora_projeto: e.vhp, valor_hora_consultor: horas > 0 ? Math.round(custo / horas * 100) / 100 : 0,
        horas, receita, custo, margem, margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
      }
    })
  }, [filtered])

  // Filhos (consultores) de cada projeto, ordenados por receita desc.
  const childrenByProject = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of filtered) { const a = m.get(r.project_id) ?? []; a.push(r); m.set(r.project_id, a) }
    for (const a of m.values()) a.sort((x, y) => y.receita - x.receita)
    return m
  }, [filtered])

  // Linhas-pai por CONSULTOR (visão "Consultor × Projeto"): uma linha única por consultor
  // totalizando horas/receita/custo (custo já vem convertido /160 p/ fixo no filho).
  // n_consultores reaproveita o campo p/ guardar a contagem de projetos do consultor.
  const consultorRows = useMemo<DisplayRow[]>(() => {
    const map = new Map<number, { consultor: string; vhc: number; horas: number; receita: number; custo: number; projs: Set<number>; inv: boolean }>()
    for (const r of filtered) {
      let e = map.get(r.user_id)
      if (!e) { e = { consultor: r.consultor, vhc: r.valor_hora_consultor, horas: 0, receita: 0, custo: 0, projs: new Set(), inv: false }; map.set(r.user_id, e) }
      e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.projs.add(r.project_id); e.inv = e.inv || !!r.is_investimento
    }
    return [...map.entries()].map(([user_id, e]) => {
      const horas = Math.round(e.horas * 100) / 100, receita = Math.round(e.receita * 100) / 100, custo = Math.round(e.custo * 100) / 100
      const margem = Math.round((receita - custo) * 100) / 100
      return {
        key: `u${user_id}`, user_id, consultor: e.consultor, n_consultores: e.projs.size,
        project_id: 0, projeto: '', cliente: '', is_investimento: e.inv,
        valor_hora_projeto: horas > 0 ? Math.round(receita / horas * 100) / 100 : 0, // R$/h projeto médio (mix)
        valor_hora_consultor: e.vhc,
        horas, receita, custo, margem, margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
      }
    })
  }, [filtered])

  // Filhos (projetos) de cada consultor, ordenados por receita desc.
  const childrenByConsultor = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of filtered) { const a = m.get(r.user_id) ?? []; a.push(r); m.set(r.user_id, a) }
    for (const a of m.values()) a.sort((x, y) => y.receita - x.receita)
    return m
  }, [filtered])

  // Pai conforme a visão: projeto (id = project_id) ou consultor (id = user_id).
  const parentId = (r: DisplayRow) => visao === 'projeto' ? r.project_id : r.user_id
  const childrenOf = (r: DisplayRow) => (visao === 'projeto' ? childrenByProject.get(r.project_id) : childrenByConsultor.get(r.user_id)) ?? []
  const { sorted, thProps } = useTableSort(visao === 'projeto' ? projectRows : consultorRows)

  // Árvore: começa recolhida (uma linha por pai); clique expande. Reseta ao trocar de visão.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  useEffect(() => { setExpanded(new Set()) }, [visao])
  const toggleRow = (pid: number) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(pid)) n.delete(pid); else n.add(pid)
    return n
  })
  // Abrir/fechar todas as linhas-pai da árvore de uma vez.
  const expandAll = () => setExpanded(new Set(sorted.filter(r => childrenOf(r).length > 0).map(r => parentId(r))))
  const collapseAll = () => setExpanded(new Set())

  // Total da TABELA (por apontamento) — usado no rodapé do export; custo proporcional às horas.
  const tot = useMemo(() => {
    const receita = filtered.reduce((s, r) => s + r.receita, 0)
    const custo   = filtered.reduce((s, r) => s + r.custo, 0)
    const horas   = filtered.reduce((s, r) => s + r.horas, 0)
    return { receita, custo, horas, margem: receita - custo, pct: receita > 0 ? (receita - custo) / receita * 100 : null }
  }, [filtered])
  // Totalizador dos CARDS do topo = custo REAL da folha dos consultores (fixos + horistas):
  // fixo = salário cheio + hora extra do banco de horas; horista = horas × R$/h.
  // = soma das seções Recebe Fixo + Horistas (custo de folha é total; ignora filtro de Cliente/Projeto).
  const totReal = useMemo(() => {
    const receita = r2(fixosTot.receita + horistasTot.receita)
    const custo   = r2(fixosTot.custoFixo + horistasTot.custo)
    const horas   = r2(fixosTot.horas + horistasTot.horas)
    return { receita, custo, horas, margem: r2(receita - custo), pct: receita > 0 ? (receita - custo) / receita * 100 : null }
  }, [fixosTot, horistasTot])
  // Detalhamento do CUSTO (clique no card): pessoa × valor. Fixos (salário + hora extra) + horistas (horas × R$/h).
  const [showCustoDetail, setShowCustoDetail] = useState(false)
  const custoBreakdown = useMemo(() => [
    ...fixosData.map(f => ({ user_id: f.user_id, name: f.consultor, tipo: f.extra > 0 ? 'Fixo + extra' : 'Fixo', value: f.custoFixo })),
    ...horistasData.map(h => ({ user_id: h.user_id, name: h.consultor, tipo: 'Horista', value: h.custo })),
  ].sort((a, b) => b.value - a.value), [fixosData, horistasData])

  // Exporta a visão "Custo por pessoa" (modal) em Excel — nome, tipo e custo + total.
  const exportCustoExcel = () => {
    if (custoBreakdown.length === 0) return
    const rows = custoBreakdown.map(it => ({ Pessoa: it.name, Tipo: it.tipo, Custo: it.value }))
    rows.push({ Pessoa: `Total · ${custoBreakdown.length} pessoa(s)`, Tipo: '', Custo: totReal.custo })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Custo por pessoa')
    XLSX.writeFile(wb, `custo_por_pessoa_${periodoLabel}.xlsx`)
  }

  // ── Aba Clientes: filtro/ordenação/total ──
  const clientesFiltered = useMemo(() => clientesRows.filter(r => {
    if (soMinutor && !r.no_minutor) return false
    if (soForaMinutor && r.no_minutor) return false
    if (fCliente && r.cliente !== fCliente) return false
    if (fExecutivo && (r.executivo ?? '') !== fExecutivo) return false
    if (fConsultorCli && !(r.consultores ?? []).some(c => String(c.user_id) === fConsultorCli)) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      const digits = busca.replace(/\D/g, '')
      const matchNome = r.cliente.toLowerCase().includes(q)
      const matchCnpj = digits.length > 0 && r.cnpj.includes(digits)
      if (!matchNome && !matchCnpj) return false
    }
    return true
  }), [clientesRows, soMinutor, soForaMinutor, fCliente, fExecutivo, fConsultorCli, busca])
  const executivos = useMemo(() => [...new Set(clientesRows.map(r => r.executivo).filter(Boolean) as string[])].sort(), [clientesRows])
  const clientesOpts = useMemo(() => [...new Set(clientesRows.map(r => r.cliente).filter(Boolean))].sort().map(c => ({ id: c, name: c })), [clientesRows])
  const consultoresCli = useMemo(() => {
    const m = new Map<number, string>()
    clientesRows.forEach(r => (r.consultores ?? []).forEach(c => m.set(c.user_id, c.consultor)))
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [clientesRows])
  // ERPSERV (empresa interna) vem SEPARADA da lista de clientes; só entra nos totais
  // quando "Considerar ERPSERV" está ligado.
  const isErpserv = (r: ClienteRow) => (r.cliente || '').toUpperCase().includes('ERPSERV')
  // ERPSERV é fixada no TOPO, em evidência — vem da lista CRUA (clientesRows), sem sofrer
  // os filtros (inclusive "Só com movimento", que ignora custo); sempre aparece se existir.
  const erpservRow = useMemo(() => clientesRows.find(isErpserv) ?? null, [clientesRows])
  const clientesSemErp = useMemo(() => clientesFiltered.filter(r => !isErpserv(r)), [clientesFiltered])
  const { sorted: clientesSorted, thProps: cliThProps } = useTableSort(clientesSemErp)
  const clientesTot = useMemo(() => {
    const base = considerarErpserv && erpservRow ? [...clientesSemErp, erpservRow] : clientesSemErp
    const receita = base.reduce((s, r) => s + r.receita, 0)
    const custo = base.reduce((s, r) => s + r.custo, 0)
    const despesa = base.reduce((s, r) => s + (r.despesas?.custo ?? 0), 0)
    const investimentoMo = base.reduce((s, r) => s + (r.investimento_mo ?? 0), 0)
    const investimentoDesp = base.reduce((s, r) => s + (r.investimento_desp ?? 0), 0)
    const investimento = investimentoMo + investimentoDesp
    const recebido = base.reduce((s, r) => s + r.recebido, 0)
    const receitaTotal = base.reduce((s, r) => s + (r.receita_total ?? 0), 0)  // base da margem
    const emAberto = base.reduce((s, r) => s + (r.em_aberto ?? 0), 0)
    const custo40 = base.reduce((s, r) => s + r.custo40, 0)
    const custoTotal = custo + custo40
    const resultado = receitaTotal - custoTotal
    // Margem operacional = resultado SEM os 40% (só custo operação), sobre a Receita Total.
    const margemOpPct = receitaTotal > 0 ? (receitaTotal - custo) / receitaTotal * 100 : null
    // Margem +40% total = +40% mantido (somado) ÷ +40% cheio (40% da Receita Total).
    const custo40Full = receitaTotal * 0.40
    const custo40Pct = custo40Full > 0 ? custo40 / custo40Full * 100 : null
    return { receita, custo, despesa, investimento, investimentoMo, investimentoDesp, recebido, receitaTotal, emAberto, custo40, custoTotal, resultado, pct: receitaTotal > 0 ? resultado / receitaTotal * 100 : null, margemOpPct, custo40Pct }
  }, [clientesSemErp, erpservRow, considerarErpserv])
  // Para exportar: clientes (sem ERPSERV) + a linha da ERPSERV no fim, espelhando a tela.
  const clientesExport = erpservRow ? [erpservRow, ...clientesSorted] : clientesSorted

  const limpar = () => { setFCliente(''); setFProjeto(''); setFConsultor([]); setBusca(''); setSoMinutor(false); setSoForaMinutor(false); setFExecutivo(''); setFConsultorCli('') }
  const hasFiltros = !!(fCliente || fProjeto || fConsultor.length || busca.trim() || soMinutor || soForaMinutor || fExecutivo || fConsultorCli)

  const fmtYm = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) }
  const fmtMes = () => !monthsToFetch.length
    ? `Ano ${year}`
    : visao === 'clientes'
      ? `Ano ${year} (${fmtYm(monthsToFetch[0])} – ${fmtYm(monthsToFetch[monthsToFetch.length - 1])})`
      : `${fmtYm(monthsToFetch[0])} – ${fmtYm(monthsToFetch[monthsToFetch.length - 1])}`
  const periodoLabel = visao === 'clientes' || !monthsToFetch.length
    ? `${year}`
    : `${monthsToFetch[0]}_a_${monthsToFetch[monthsToFetch.length - 1]}`

  // Excel/PDF "Por projeto" = consolidado (sorted); "Consultor × Projeto" = detalhe
  // por consultor (filtered, ordenado por projeto e consultor).
  const detalheConsultor = () => [...filtered].sort((a, b) =>
    a.projeto.localeCompare(b.projeto, 'pt-BR') || a.consultor.localeCompare(b.consultor, 'pt-BR'))

  const exportExcel = () => {
    if (visao === 'clientes') {
      const data = clientesExport.map(r => ({
        Cliente: r.cliente, 'No Minutor': r.no_minutor ? 'Sim' : 'Não',
        'Receita Total': r.receita_total, 'Recebido': r.recebido, 'Em Aberto': r.em_aberto, 'Custo Operação': r.custo, '+40% Custo': r.custo40,
        'Custo Total': r.custo_total, 'Lucro/Prejuízo': r.resultado,
        'Margem Operacional %': r.margem_real_pct, 'Margem +40% %': r.custo40_pct, 'Margem Total %': r.resultado_pct,
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
      XLSX.writeFile(wb, `rentabilidade_clientes_${periodoLabel}.xlsx`)
      return
    }
    const src = visao === 'projeto' ? sorted : detalheConsultor()
    const data = src.map(r => visao === 'projeto'
      ? { Projeto: r.projeto, Cliente: r.cliente, Consultores: (r as DisplayRow).n_consultores, Horas: r.horas, 'R$/h Projeto': r.valor_hora_projeto, 'Custo/h médio': r.valor_hora_consultor, Receita: r.receita, Custo: r.custo, Margem: r.margem, 'Margem %': r.margem_pct }
      : { Consultor: r.consultor, Projeto: r.projeto, Cliente: r.cliente, Horas: r.horas, 'R$/h Projeto': r.valor_hora_projeto, 'R$/h Consultor': r.valor_hora_consultor, Receita: r.receita, Custo: r.custo, Margem: r.margem, 'Margem %': r.margem_pct })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidade')
    XLSX.writeFile(wb, `rentabilidade_${visao}_${periodoLabel}.xlsx`)
  }

  const exportPdf = () => {
    if (visao === 'clientes') {
      const linhas = clientesExport.map(r => `
        <tr><td>${escapeHtml(r.cliente)}${r.no_minutor ? '' : ' <span style="color:#9ca3af">(fora do Minutor)</span>'}</td>
        <td class="r">${formatBRL(r.receita_total)}</td>
        <td class="r">${formatBRL(r.recebido)}</td>
        <td class="r">${formatBRL(r.em_aberto)}</td>
        <td class="r">${formatBRL(r.custo)}${r.margem_real_pct == null ? '' : `<br><span style="color:${mgOpColor(r.margem_real_pct)}">Mg op. ${r.margem_real_pct}%</span>`}</td>
        <td class="r">${formatBRL(r.custo40)}${r.custo40_pct == null ? '' : `<br><span style="color:${pct40Color(r.custo40_pct)}">(${r.custo40_pct}%)</span>`}</td><td class="r">${formatBRL(r.custo_total)}</td>
        <td class="r">${formatBRL(r.resultado)}</td>
        <td class="r">${r.resultado_pct == null ? '—' : r.resultado_pct + '%'}</td></tr>`).join('')
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rentabilidade Clientes — ${fmtMes()}</title>
        <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:11px;padding:20px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:14px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:5px 6px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>
        <h1>Rentabilidade por Cliente</h1>
        <div class="sub">${fmtMes()} · recebimento do mês seguinte (M+1) · ${clientesExport.length} cliente(s)</div>
        <table><thead><tr><th>Cliente</th><th class="r">Receita Total</th><th class="r">Recebido</th><th class="r">Em Aberto</th><th class="r">Custo Operação</th><th class="r">+40% Custo</th><th class="r">Custo Total</th><th class="r">Lucro/Prejuízo</th><th class="r">Margem Total</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td class="r">Total</td><td class="r">${formatBRL(clientesTot.receitaTotal)}</td><td class="r">${formatBRL(clientesTot.recebido)}</td><td class="r">${formatBRL(clientesTot.emAberto)}</td><td class="r">${formatBRL(clientesTot.custo)}${clientesTot.margemOpPct == null ? '' : `<br><span style="color:${mgOpColor(clientesTot.margemOpPct)}">Mg op. ${clientesTot.margemOpPct.toFixed(1)}%</span>`}</td><td class="r">${formatBRL(clientesTot.custo40)}${clientesTot.custo40Pct == null ? '' : `<br><span style="color:${pct40Color(clientesTot.custo40Pct)}">(${clientesTot.custo40Pct.toFixed(1)}%)</span>`}</td><td class="r">${formatBRL(clientesTot.custoTotal)}</td><td class="r">${formatBRL(clientesTot.resultado)}</td><td class="r">${clientesTot.pct == null ? '—' : clientesTot.pct.toFixed(1) + '%'}</td></tr></tfoot></table>
        <script>window.onload=function(){window.print();}</script></body></html>`
      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close() }
      return
    }
    const src = visao === 'projeto' ? sorted : detalheConsultor()
    const linhas = src.map(r => `
      <tr>
        ${visao === 'consultor' ? `<td>${escapeHtml(r.consultor)}</td>` : ''}<td>${escapeHtml(r.projeto)}</td><td>${escapeHtml(r.cliente)}</td>
        ${visao === 'projeto' ? `<td class="r">${(r as DisplayRow).n_consultores}</td>` : ''}
        <td class="r">${fmtH(r.horas)}</td><td class="r">${formatBRL(r.valor_hora_projeto)}</td><td class="r">${formatBRL(r.valor_hora_consultor)}</td>
        <td class="r">${formatBRL(r.receita)}</td><td class="r">${formatBRL(r.custo)}</td><td class="r">${formatBRL(r.margem)}</td>
        <td class="r">${r.margem_pct == null ? '—' : r.margem_pct + '%'}</td>
      </tr>`).join('')
    const thead = visao === 'projeto'
      ? '<th>Projeto</th><th>Cliente</th><th class="r">Cons.</th><th class="r">Horas</th><th class="r">R$/h Proj</th><th class="r">Custo/h</th><th class="r">Receita</th><th class="r">Custo</th><th class="r">Margem</th><th class="r">%</th>'
      : '<th>Consultor</th><th>Projeto</th><th>Cliente</th><th class="r">Horas</th><th class="r">R$/h Proj</th><th class="r">R$/h Cons</th><th class="r">Receita</th><th class="r">Custo</th><th class="r">Margem</th><th class="r">%</th>'
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rentabilidade — ${fmtMes()}</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:11px;padding:20px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:14px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:5px 6px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
      <h1>Relatório de Rentabilidade</h1>
      <div class="sub">${fmtMes()} · ${visao === 'projeto' ? 'por projeto' : 'consultor × projeto'} · ${sorted.length} linha(s)</div>
      <table><thead><tr>${thead}</tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="6" class="r">Total</td><td class="r">${formatBRL(tot.receita)}</td><td class="r">${formatBRL(tot.custo)}</td><td class="r">${formatBRL(tot.margem)}</td><td class="r">${tot.pct == null ? '—' : tot.pct.toFixed(1) + '%'}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print();}</script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  const content = (
    <>
      <div className="max-w-[1400px] mx-auto">
        <PageHeader
          icon={TrendingUp}
          title="Rentabilidade"
          subtitle={visao === 'clientes' ? 'Custo Minutor × recebimento Keruak por cliente (CNPJ) — recebido do mês seguinte (M+1)' : visao === 'projeto' ? 'Receita, custo e margem por projeto' : 'Receita, custo e margem por consultor × projeto'}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {visao === 'clientes' ? (<>
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Ano</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                  {Array.from({ length: currentYear - 2026 + 1 }, (_, i) => 2026 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-light)' }}>
                  {monthsToFetch.length ? `até ${fmtYm(monthsToFetch[monthsToFetch.length - 1])} · não inclui o mês atual` : 'sem mês fechado neste ano ainda'}
                </span>
              </>) : embedded ? null : (<>
                {/* Toggle Mês/Ano ↔ Período */}
                <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--border)' }}>
                  {(['mesano', 'periodo'] as const).map(m => (
                    <button key={m} type="button"
                      onClick={() => {
                        if (m === 'mesano') { const [ty, tm] = dateTo.split('-').map(Number); setFromM(tm); setFromY(ty); setToM(tm); setToY(ty) }
                        else { const mm = String(toM).padStart(2, '0'); setDateFrom(`${toY}-${mm}-01`); setDateTo(`${toY}-${mm}-${String(new Date(toY, toM, 0).getDate()).padStart(2, '0')}`) }
                        setPeriodModo(m)
                      }}
                      className="px-3 py-1.5 font-medium transition-colors"
                      style={{ background: periodModo === m ? 'var(--primary)' : 'transparent', color: periodModo === m ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                      {m === 'mesano' ? 'Mês/Ano' : 'Período'}
                    </button>
                  ))}
                </div>
                {periodModo === 'mesano' ? (
                  <MonthYearPicker month={toM} year={toY} placeholder="Mês/Ano" onChange={(m, y) => { if (m && y) { setFromM(m); setFromY(y); setToM(m); setToY(y) } }} />
                ) : (
                  <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { if (f && t) { setDateFrom(f); setDateTo(t) } }} />
                )}
                <button type="button" onClick={() => setReloadTick(t => t + 1)} title="Atualizar" className="p-1.5 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}>
                  <RefreshCw size={14} />
                </button>
              </>)}
              {visao === 'clientes' && (
                <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing}
                  onClick={() => loadClientes(true).then(() => toast.success('Recebimentos do Keruak atualizados'))}>
                  {refreshing ? 'Atualizando…' : 'Atualizar Keruak'}
                </Button>
              )}
              {isAdmin && !embedded && (
                <Button variant="ghost" size="sm" icon={Settings} onClick={() => setShowHiddenCfg(true)} title="Escolher quais usuários aparecem na Rentabilidade">Visibilidade</Button>
              )}
              <Button variant="ghost" size="sm" icon={Download} onClick={exportExcel} disabled={(visao === 'clientes' ? clientesFiltered : filtered).length === 0}>Excel</Button>
              <Button variant="ghost" size="sm" icon={FileText} onClick={exportPdf} disabled={(visao === 'clientes' ? clientesFiltered : filtered).length === 0}>PDF</Button>
            </div>
          }
        />

        {/* Legenda em evidência: o mês selecionado é apurado no FECHAMENTO FINANCEIRO do mês POSTERIOR. */}
        {visao !== 'clientes' && !embedded && periodModo === 'mesano' && (() => {
          const nm = toM === 12 ? 1 : toM + 1, ny = toM === 12 ? toY + 1 : toY
          const raw = new Date(ny, nm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          const nextLabel = raw.charAt(0).toUpperCase() + raw.slice(1)
          return (
            <div className="rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
              <Clock size={16} style={{ color: 'var(--danger)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
                Referente ao fechamento financeiro de {nextLabel} — sempre o mês posterior ao selecionado.
              </span>
            </div>
          )
        })()}

        <div className="flex flex-wrap items-end gap-3 mb-4">
          {visao !== 'clientes' && (<>
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Cliente</p>
              <SearchSelect value={fCliente} onChange={setFCliente} options={optClientes} placeholder="Todos os clientes" />
            </div>
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Projeto</p>
              <SearchSelect value={fProjeto} onChange={setFProjeto} options={optProjetos} placeholder="Todos os projetos" />
            </div>
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Consultor</p>
              <MultiSelect value={fConsultor} onChange={setFConsultor} options={optConsultores} placeholder="Todos os consultores" />
            </div>
          </>)}
          {visao !== 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }} title="ERPSERV é a empresa interna; desmarque para tirar os apontamentos dela dos dados e totais">
              <input type="checkbox" checked={incluirErpserv} onChange={e => setIncluirErpserv(e.target.checked)} />
              Incluir ERPSERV
            </label>
          )}
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={soMinutor} onChange={e => { setSoMinutor(e.target.checked); if (e.target.checked) setSoForaMinutor(false) }} />
              Só clientes do Minutor
            </label>
          )}
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={soForaMinutor} onChange={e => { setSoForaMinutor(e.target.checked); if (e.target.checked) setSoMinutor(false) }} />
              Fora do Minutor
            </label>
          )}
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={considerarErpserv} onChange={e => setConsiderarErpserv(e.target.checked)} />
              Considerar ERPSERV
            </label>
          )}
          {visao === 'clientes' && (
            <div className="w-52 pb-2">
              <SearchSelect value={fCliente} onChange={setFCliente} options={clientesOpts} placeholder="Cliente (todos)" />
            </div>
          )}
          {visao === 'clientes' && (
            <div className="w-48 pb-2">
              <SearchSelect value={fExecutivo} onChange={setFExecutivo} options={executivos.map(e => ({ id: e, name: e }))} placeholder="Executivo (todos)" />
            </div>
          )}
          {visao === 'clientes' && (
            <div className="w-52 pb-2">
              <SearchSelect value={fConsultorCli} onChange={setFConsultorCli} options={consultoresCli} placeholder="Consultor (todos)" />
            </div>
          )}
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <Button variant="ghost" size="sm" icon={X} onClick={limpar} disabled={!hasFiltros}>Limpar</Button>
        </div>

        {/* Cards de total */}
        <div className={`grid gap-3 mb-4 ${visao === 'clientes' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          {(visao === 'clientes' ? [
            // Receita: Total=Parcela+Multa (base da margem) · Recebido (informativo) · Em Aberto. E Custo Total.
            { label: 'Receita', lines: [
              { k: 'Receita Total', v: formatBRL(clientesTot.receitaTotal), strong: true },
              { k: 'Recebido', v: formatBRL(clientesTot.recebido) },
              { k: 'Em Aberto', v: formatBRL(clientesTot.emAberto), aberto: true },
            ] },
            { label: 'Custo', lines: [
              { k: 'Operação', v: formatBRL(clientesTot.custo - clientesTot.despesa - clientesTot.investimentoMo) },
              { k: 'Despesa', v: formatBRL(clientesTot.despesa - clientesTot.investimentoDesp) },
              { k: '+40%', v: formatBRL(clientesTot.custo40) },
              { k: 'Investimento', v: formatBRL(clientesTot.investimento), invest: true },
              { k: 'Total', v: formatBRL(clientesTot.custoTotal), strong: true },
            ] },
          ] : [
            { label: 'Receita', value: formatBRL(totReal.receita), color: 'var(--text)' },
            { label: 'Custo', value: formatBRL(totReal.custo), color: 'var(--text)', onClick: () => setShowCustoDetail(true) },
            { label: 'Margem', value: formatBRL(totReal.margem), color: 'var(--primary)' },
            { label: 'Margem %', value: totReal.pct == null ? '—' : totReal.pct.toFixed(1) + '%', color: pctColor(totReal.pct) },
          ]).map(c => (
            <div key={c.label} onClick={'onClick' in c ? (c as { onClick?: () => void }).onClick : undefined}
              className="rounded-xl p-3 transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: ('onClick' in c && (c as { onClick?: () => void }).onClick) ? 'pointer' : undefined }}>
              <p className="text-[10px] uppercase tracking-wider inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}>{c.label}{('onClick' in c && (c as { onClick?: () => void }).onClick) ? <ChevronRight size={11} /> : null}</p>
              {'lines' in c && c.lines ? (
                <div className="mt-1 space-y-0.5">
                  {c.lines.map(l => (
                    <div key={l.k} className="flex items-baseline justify-between gap-2" style={'strong' in l && l.strong ? { borderTop: '1px solid var(--border)', paddingTop: 2, marginTop: 2 } : undefined}>
                      <span className="text-[10px]" style={{ color: 'invest' in l && l.invest ? '#cc0000' : 'aberto' in l && l.aberto ? '#b8860b' : 'var(--text-light)' }}>{l.k}</span>
                      <span className={`tabular-nums ${'strong' in l && l.strong ? 'text-sm font-bold' : 'text-xs font-semibold'}`} style={{ color: 'invest' in l && l.invest ? '#cc0000' : 'aberto' in l && l.aberto ? '#b8860b' : 'var(--text)' }}>{l.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-lg font-bold tabular-nums" style={{ color: (c as { color?: string }).color }}>{(c as { value?: string }).value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Total de horas no período (por segmento) */}
        {visao !== 'clientes' && (
          <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Total de horas no período</div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-1.5 text-sm">
              <span style={{ color: 'var(--primary)' }}>Sustentação <b className="tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(totCat.sustentacao.horas)}</b></span>
              <span style={{ color: 'var(--success-border)' }}>Projeto <b className="tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(totCat.projeto.horas)}</b></span>
              <span style={{ color: 'var(--danger)' }}>Investimento <b className="tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(totCat.investimento.horas)}</b></span>
              <span className="font-bold" style={{ color: 'var(--text)', borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>Total <b className="tabular-nums">{fmtH(totCat.sustentacao.horas + totCat.projeto.horas + totCat.investimento.horas)}</b></span>
            </div>
          </div>
        )}

        {/* Totais por segmento (Sustentação · Projeto · Investimento) — clicáveis p/ filtrar */}
        {visao !== 'clientes' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {([
              { k: 'sustentacao', label: 'Sustentação', cor: 'var(--primary)' },
              { k: 'projeto', label: 'Projeto', cor: 'var(--success-border)' },
              { k: 'investimento', label: 'Investimento', cor: 'var(--danger)' },
            ] as const).map(({ k, label, cor }) => {
              const c = totCat[k]; const margem = c.receita - c.custo; const ativo = fCategoria === k
              return (
                <div key={k} onClick={() => setFCategoria(prev => prev === k ? '' : k)} title={ativo ? 'Clique para remover o filtro' : `Filtrar só ${label}`}
                  className={`group rounded-xl p-3 cursor-pointer border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg ${ativo ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: cor }}>
                      {label}
                      {ativo
                        ? <span style={{ fontSize: 9, color: 'var(--primary)' }}>● filtrando</span>
                        : <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: 9, color: 'var(--text-light)' }}>● filtrar</span>}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-light)' }}>{c.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    {k !== 'investimento' && <span style={{ color: 'var(--text-light)' }}>Receita <b className="tabular-nums" style={{ color: 'var(--text)' }}>{formatBRL(c.receita)}</b></span>}
                    <span style={{ color: 'var(--text-light)' }}>Custo <b className="tabular-nums" style={{ color: 'var(--text)' }}>{formatBRL(c.custo)}</b></span>
                    {k !== 'investimento' && <span style={{ color: 'var(--text-light)' }}>Margem <b className="tabular-nums" style={{ color: margem < 0 ? 'var(--danger)' : 'var(--success-border)' }}>{formatBRL(margem)}</b></span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Gráfico de apontamento (consultor/projeto) + seção Recebe Fixo */}
        {visao !== 'clientes' && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {fConsultor.length > 0 ? 'Apontamento por período (mês)' : 'Apontamento por consultor'}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>horas{fConsultor.length === 0 ? ` · ${chartData.length} consultores` : ''}</span>
            </div>
            {chartData.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-light)' }}>Sem apontamentos no período.</p>
            ) : (<>
              {/* Legenda fixa acima do scroll */}
              <div className="flex items-center gap-4 mb-2 px-1 text-[11px]" style={{ color: 'var(--text-light)' }}>
                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)' }} /> Sustentação</span>
                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success-border)' }} /> Projeto</span>
                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--danger)' }} /> Investimento</span>
              </div>
              {/* Eixo X fixo no topo (mesmo domínio do gráfico que rola) */}
              <ResponsiveContainer width="100%" height={24}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 0, bottom: 0 }}>
                  <XAxis type="number" orientation="top" tick={{ fontSize: 10, fill: 'var(--text-light)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={160} tick={false} axisLine={false} tickLine={false} />
                  <Bar dataKey="horas" fill="transparent" />
                </BarChart>
              </ResponsiveContainer>
              {/* Quadro de altura fixa com rolagem vertical (mostra todos os consultores) */}
              <div style={{ maxHeight: 410, overflowY: 'auto', overflowX: 'hidden' }}>
                <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 26)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="label" width={160} interval={0} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<HorasCatTooltip />} />
                    <Bar dataKey="suporte" name="Sustentação" stackId="a" fill="var(--primary)" />
                    <Bar dataKey="projeto" name="Projeto" stackId="a" fill="var(--success-border)" />
                    <Bar dataKey="investimento" name="Investimento" stackId="a" fill="var(--danger)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>)}
          </div>
        )}

        {visao !== 'clientes' && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Horas apontadas por dia</span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{diaChart.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h {diaChart.limitado ? '· últimos 60 dias' : 'no período'}</span>
            </div>
            {diaChart.data.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-light)' }}>Sem apontamentos no período.</p>
            ) : (<>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={diaChart.data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }} style={{ cursor: 'pointer' }}
                  onClick={((e: { activePayload?: { payload?: { dia?: string } }[] }) => { const d = e?.activePayload?.[0]?.payload?.dia; if (d) setDiaModal(d) }) as never}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-light)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip cursor={{ stroke: 'var(--border)' }} content={<HorasCatTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
                  <Line type="monotone" dataKey="suporte" name="Sustentação" stroke="var(--primary)" strokeWidth={2} dot={false}
                    activeDot={((pr: { cx?: number; cy?: number; payload?: { dia?: string } }) => <circle cx={pr.cx} cy={pr.cy} r={5} fill="var(--surface)" stroke="var(--primary)" strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => { if (pr.payload?.dia) setDiaModal(pr.payload.dia) }} />) as never} />
                  <Line type="monotone" dataKey="projeto" name="Projeto" stroke="var(--success-border)" strokeWidth={2} dot={false}
                    activeDot={((pr: { cx?: number; cy?: number; payload?: { dia?: string } }) => <circle cx={pr.cx} cy={pr.cy} r={5} fill="var(--surface)" stroke="var(--success-border)" strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => { if (pr.payload?.dia) setDiaModal(pr.payload.dia) }} />) as never} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-light)' }}>Clique num dia para ver os apontamentos · fim de semana/feriado aparece no tooltip</p>
            </>)}
          </div>
        )}

        {visao !== 'clientes' && fixosData.length > 0 && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Recebe Fixo — Custo × Receita × Resultado</span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fixosData[0].nMeses} mês(es) · custo = salário × meses</span>
              {(fCategoria || fCliente || fProjeto || busca.trim()) && (
                <span className="text-[11px] font-medium" style={{ color: 'var(--warning)' }} title="O salário é fixo e cobre o mês todo; por isso este quadro sempre soma o mês inteiro, mesmo com um segmento/cliente/projeto selecionado na tabela.">· sempre mês inteiro — não aplica o filtro ativo (segmento/cliente/projeto)</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-light)' }}>
                    <SortableTh label="Consultor" k="consultor" sort={fixoSort} onSort={sortFixo} left />
                    <SortableTh label="Salário/mês" k="salary" sort={fixoSort} onSort={sortFixo} />
                    <SortableTh label="Custo Fixo" k="custoFixo" sort={fixoSort} onSort={sortFixo} />
                    <SortableTh label="Horas" k="horas" sort={fixoSort} onSort={sortFixo} />
                    <SortableTh label="Horas Invest." k="horasInvest" sort={fixoSort} onSort={sortFixo} title="Horas em projetos de investimento (inclui ERPSERV)" />
                    <SortableTh label="Receita (apontado)" k="receita" sort={fixoSort} onSort={sortFixo} />
                    <SortableTh label="Resultado" k="resultado" sort={fixoSort} onSort={sortFixo} />
                  </tr>
                </thead>
                <tbody>
                  {fixosSorted.map(f => (
                    <tr key={f.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>{f.consultor}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(f.salary)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(f.custoFixo)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-light)' }} className="tabular-nums">{f.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: f.horasInvest > 0 ? 'var(--danger)' : 'var(--text-light)' }} className="tabular-nums">{f.horasInvest > 0 ? `${f.horasInvest.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(f.receita)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: f.resultado < 0 ? 'var(--danger)' : 'var(--success-border)' }} className="tabular-nums">{formatBRL(f.resultado)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text)' }}>Total</td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(fixosTot.custoFixo)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: fixosTot.horasInvest > 0 ? 'var(--danger)' : 'var(--text-light)' }} className="tabular-nums">{fixosTot.horasInvest > 0 ? `${fixosTot.horasInvest.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(fixosTot.receita)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: fixosTot.resultado < 0 ? 'var(--danger)' : 'var(--success-border)' }} className="tabular-nums">{formatBRL(fixosTot.resultado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {visao !== 'clientes' && horistasData.length > 0 && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Horistas — Custo × Receita × Resultado</span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>custo = horas × R$/h apontado</span>
              {(fCategoria || fCliente || fProjeto || busca.trim()) && (
                <span className="text-[11px] font-medium" style={{ color: 'var(--warning)' }} title="Este quadro sempre soma o mês inteiro, mesmo com um segmento/cliente/projeto selecionado na tabela.">· sempre mês inteiro — não aplica o filtro ativo (segmento/cliente/projeto)</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-light)' }}>
                    <SortableTh label="Consultor" k="consultor" sort={horistaSort} onSort={sortHorista} left />
                    <SortableTh label="R$/h (custo)" k="rhCusto" sort={horistaSort} onSort={sortHorista} />
                    <SortableTh label="Horas" k="horas" sort={horistaSort} onSort={sortHorista} />
                    <SortableTh label="Horas Invest." k="horasInvest" sort={horistaSort} onSort={sortHorista} title="Horas em projetos de investimento (inclui ERPSERV)" />
                    <SortableTh label="Receita (apontado)" k="receita" sort={horistaSort} onSort={sortHorista} />
                    <SortableTh label="Custo" k="custo" sort={horistaSort} onSort={sortHorista} />
                    <SortableTh label="Resultado" k="resultado" sort={horistaSort} onSort={sortHorista} />
                  </tr>
                </thead>
                <tbody>
                  {horistasSorted.map(h => (
                    <tr key={h.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>{h.consultor}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(h.rhCusto)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-light)' }} className="tabular-nums">{h.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: h.horasInvest > 0 ? 'var(--danger)' : 'var(--text-light)' }} className="tabular-nums">{h.horasInvest > 0 ? `${h.horasInvest.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(h.receita)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(h.custo)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: h.resultado < 0 ? 'var(--danger)' : 'var(--success-border)' }} className="tabular-nums">{formatBRL(h.resultado)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text)' }}>Total</td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{horistasTot.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: horistasTot.horasInvest > 0 ? 'var(--danger)' : 'var(--text-light)' }} className="tabular-nums">{horistasTot.horasInvest > 0 ? `${horistasTot.horasInvest.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(horistasTot.receita)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(horistasTot.custo)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: horistasTot.resultado < 0 ? 'var(--danger)' : 'var(--success-border)' }} className="tabular-nums">{formatBRL(horistasTot.resultado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {visao === 'clientes' ? (
          clientesLoading && clientesRows.length === 0 ? (
            <SkeletonTable rows={8} cols={9} />
          ) : clientesSemErp.length === 0 && !erpservRow ? (
            <EmptyState icon={TrendingUp} title="Sem dados" description="Nenhum cliente/recebimento para o mês/filtros." />
          ) : (
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)', maxHeight: '70vh' }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th onClick={cliThProps('cliente').onClick} style={{ background: 'var(--surface)', color: 'var(--text-light)', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 }}>Cliente</th>
                    <th onClick={cliThProps('executivo').onClick} style={{ background: 'var(--surface)', color: 'var(--text-light)', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 }}>Executivo</th>
                    <th onClick={cliThProps('receita_total').onClick} style={thCol(COL_HEAD.receita_total)}>Receita Total</th>
                    <th onClick={cliThProps('recebido').onClick} style={thCol(COL_HEAD.recebido)}>Recebido</th>
                    <th onClick={cliThProps('em_aberto').onClick} style={thCol(COL_HEAD.em_aberto)}>Em Aberto</th>
                    <th onClick={cliThProps('custo').onClick} style={thCol(COL_HEAD.custo)}>Custo Operação</th>
                    <th onClick={cliThProps('custo40').onClick} style={thCol(COL_HEAD.custo40)}>+40% Custo</th>
                    <th onClick={cliThProps('custo_total').onClick} style={thCol(COL_HEAD.total)}>Custo Total</th>
                    <th onClick={cliThProps('resultado').onClick} style={thCol(COL_HEAD.resultado)}>Lucro/Prejuízo</th>
                    <th onClick={cliThProps('resultado_pct').onClick} style={thCol(COL_HEAD.margem)}>Margem Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ERPSERV — empresa interna, EM EVIDÊNCIA no topo; expande por consultores; entra nos totais só com "Considerar ERPSERV" */}
                  {erpservRow && (() => {
                    const erpOpen = expandedCli.has('erpserv')
                    const erpTemCons = (erpservRow.consultores?.length ?? 0) > 0
                    const bb = '2px solid var(--primary)'
                    return (
                    <Fragment key="erpserv">
                    <tr style={{ background: 'var(--primary-soft)', opacity: considerarErpserv ? 1 : 0.7, cursor: erpTemCons ? 'pointer' : 'default' }}
                      onClick={() => { if (erpTemCons) setExpandedCli(prev => { const n = new Set(prev); n.has('erpserv') ? n.delete('erpserv') : n.add('erpserv'); return n }) }}>
                      <td style={{ padding: '8px 10px', color: 'var(--text)', fontWeight: 800, borderBottom: bb }}>
                        {erpTemCons && (erpOpen ? <ChevronDown size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                        ★ {erpservRow.cliente}
                        <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>— interno {considerarErpserv ? '(considerado nos totais)' : '(fora dos totais)'}</span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)', borderBottom: bb, textAlign: 'center' }}>{erpservRow.executivo || '—'}</td>
                      <td style={{ ...tdCol(COL_CELL.receita_total), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.receita_total)}</td>
                      <td style={{ ...tdCol(COL_CELL.recebido), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.recebido)}</td>
                      <td style={{ ...tdCol(COL_CELL.em_aberto), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.em_aberto)}</td>
                      <td style={{ ...tdCol(COL_CELL.custo), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.custo)}{erpservRow.margem_real_pct != null && <div style={{ fontSize: 10, fontWeight: 600, color: mgOpColor(erpservRow.margem_real_pct) }}>Mg op. {erpservRow.margem_real_pct}%</div>}</td>
                      <td style={{ ...tdCol(COL_CELL.custo40), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.custo40)}{erpservRow.custo40_pct != null && <div style={{ color: pct40Color(erpservRow.custo40_pct), fontWeight: 700, fontSize: 10 }}>({erpservRow.custo40_pct}%)</div>}</td>
                      <td style={{ ...tdCol(COL_CELL.total), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.custo_total)}</td>
                      <td style={{ ...tdCol(COL_CELL.resultado, erpservRow.resultado < 0 ? '#cc0000' : '#111827'), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.resultado)}</td>
                      <td style={{ ...tdCol(margemBg(erpservRow.resultado_pct), '#fff'), borderBottom: bb }}><strong>{erpservRow.resultado_pct == null ? '—' : erpservRow.resultado_pct + '%'}</strong></td>
                    </tr>
                    {erpOpen && erpTemCons && (
                      <tr>
                        <td colSpan={10} style={{ padding: '0 0 8px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-light)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>% Particip.</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Custo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...erpservRow.consultores].sort((a, b) => b.horas - a.horas).map(c => {
                                const pct = erpservRow.horas > 0 ? c.horas / erpservRow.horas : 0
                                const consKey = `erpserv:${c.user_id}`
                                const consOpen = expandedCons.has(consKey)
                                const temProj = (c.projetos?.length ?? 0) > 0
                                return (
                                  <Fragment key={c.user_id}>
                                  <tr style={{ borderTop: '1px solid var(--border)', background: c.tem_investimento ? 'var(--danger-bg)' : undefined, cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(consKey) ? n.delete(consKey) : n.add(consKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>
                                      {temProj && (consOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      {c.consultor} <span style={{ color: 'var(--text-light)', fontSize: 11 }}>({formatBRL(c.valor_hora)}/h)</span>
                                      {c.tem_investimento && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 4, padding: '0 4px' }}>INVEST.</span>}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{fmtH(c.horas)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{(pct * 100).toFixed(1)}%</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(c.custo)}</td>
                                  </tr>
                                  {consOpen && temProj && [...(c.projetos ?? [])].sort((a, b) => b.horas - a.horas).map(p => (
                                    <tr key={p.project_id} style={{ background: 'var(--surface)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: 'var(--danger)', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: 'var(--danger)', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{fmtH(p.horas)}</td>
                                      <td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                    </tr>
                                  ))}
                                  </Fragment>
                                )
                              })}
                              {(erpservRow.despesas?.custo ?? 0) > 0 && (() => {
                                const dKey = 'erpserv:despesas'
                                const dOpen = expandedCons.has(dKey)
                                const dProj = erpservRow.despesas?.projetos ?? []
                                const temProj = dProj.length > 0
                                return (
                                  <Fragment key="despesas">
                                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--warning-bg)', cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(dKey) ? n.delete(dKey) : n.add(dKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)', fontWeight: 600 }}>
                                      {temProj && (dOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      🧾 Despesas
                                    </td>
                                    <td></td><td></td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(erpservRow.despesas?.custo ?? 0)}</td>
                                  </tr>
                                  {dOpen && temProj && [...dProj].sort((a, b) => b.custo - a.custo).map(p => (
                                    <Fragment key={p.project_id}>
                                    <tr style={{ background: 'var(--surface)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: 'var(--danger)', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: 'var(--danger)', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td></td><td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                    </tr>
                                    {[...(p.usuarios ?? [])].sort((a, b) => b.custo - a.custo).map(u => (
                                      <tr key={`${p.project_id}-u${u.user_id}`} style={{ background: 'var(--surface)' }}>
                                        <td style={{ textAlign: 'left', padding: '2px 8px 2px 52px', color: 'var(--text-light)', fontSize: 11 }}>👤 {u.usuario}</td>
                                        <td></td><td></td>
                                        <td style={{ textAlign: 'right', padding: '2px 8px', color: 'var(--text-light)', fontSize: 11 }} className="tabular-nums">{formatBRL(u.custo)}</td>
                                      </tr>
                                    ))}
                                    </Fragment>
                                  ))}
                                  </Fragment>
                                )
                              })()}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  })()}
                  {clientesSorted.map(r => {
                    const ck = r.cnpj || `c${r.customer_id}` || r.cliente
                    const open = expandedCli.has(ck)
                    const temConsultores = (r.consultores?.length ?? 0) > 0
                    // Cliente cadastrado pode expandir p/ editar os ajustes iniciais do ano (mesmo sem consultores).
                    const canExpand = temConsultores || r.customer_id != null
                    return (
                    <Fragment key={ck}>
                    <tr style={{ cursor: canExpand ? 'pointer' : 'default' }}
                      onClick={() => { if (canExpand) setExpandedCli(prev => { const n = new Set(prev); n.has(ck) ? n.delete(ck) : n.add(ck); return n }) }}>
                      <td style={{ padding: '6px 10px', color: 'var(--text)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
                        {canExpand && (open ? <ChevronDown size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                        <span className="truncate max-w-[220px] inline-block align-bottom">{r.cliente}</span>
                        {!r.no_minutor && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>(fora do Minutor)</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>{r.executivo || '—'}</td>
                      <td style={tdCol(COL_CELL.receita_total)}>{formatBRL(r.receita_total)}</td>
                      <td
                        style={{ ...tdCol(COL_CELL.recebido), cursor: r.recebido > 0 ? 'pointer' : undefined, textDecoration: r.recebido > 0 ? 'underline dotted' : undefined }}
                        title={r.recebido > 0 ? 'Ver títulos do Keruak' : undefined}
                        onClick={r.recebido > 0 ? (e) => { e.stopPropagation(); setKeruakModal({ cliente: r.cliente, cnpjs: (r.cnpjs?.length ? r.cnpjs : [r.cnpj]).filter(Boolean), valorInicial: 0 }) } : undefined}
                      >{formatBRL(r.recebido)}</td>
                      <td
                        style={{ ...tdCol(COL_CELL.em_aberto), cursor: r.em_aberto > 0 ? 'pointer' : undefined, textDecoration: r.em_aberto > 0 ? 'underline dotted' : undefined }}
                        title={r.em_aberto > 0 ? 'Ver títulos em aberto' : undefined}
                        onClick={r.em_aberto > 0 ? (e) => { e.stopPropagation(); setKeruakModal({ cliente: r.cliente, cnpjs: (r.cnpjs?.length ? r.cnpjs : [r.cnpj]).filter(Boolean), valorInicial: 0, modo: 'aberto' }) } : undefined}
                      >{formatBRL(r.em_aberto)}</td>
                      <td style={tdCol(COL_CELL.custo)}>{formatBRL(r.custo)}{r.margem_real_pct != null && <div style={{ fontSize: 10, fontWeight: 600, color: mgOpColor(r.margem_real_pct) }}>Mg op. {r.margem_real_pct}%</div>}</td>
                      <td style={tdCol(COL_CELL.custo40)}>{formatBRL(r.custo40)}{r.custo40_pct != null && <div style={{ color: pct40Color(r.custo40_pct), fontSize: 10, fontWeight: 700 }}>({r.custo40_pct}%)</div>}</td>
                      <td style={tdCol(COL_CELL.total)}>{formatBRL(r.custo_total)}</td>
                      <td style={tdCol(COL_CELL.resultado, r.resultado < 0 ? '#cc0000' : '#111827')}>{formatBRL(r.resultado)}</td>
                      <td style={tdCol(margemBg(r.resultado_pct), '#fff')}><strong>{r.resultado_pct == null ? '—' : r.resultado_pct + '%'}</strong></td>
                    </tr>
                    {open && canExpand && (
                      <tr>
                        <td colSpan={10} style={{ padding: '0 0 8px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          {r.customer_id != null && (
                            <InitialsEditor
                              key={`init-${r.customer_id}`}
                              custoInicial={r.custo_inicial ?? 0}
                              receitaInicial={r.receita_inicial ?? 0}
                              onSave={(c, rec) => saveInitial(r.customer_id as number, c, rec)}
                            />
                          )}
                          {temConsultores && (
                          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-light)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>% Particip.</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Receita (rateio)</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Custo</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Margem</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>% Margem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...r.consultores].sort((a, b) => b.horas - a.horas).map(c => {
                                const pct = r.horas > 0 ? c.horas / r.horas : 0
                                const receitaC = Math.round(r.recebido * pct * 100) / 100
                                const margemC = Math.round((receitaC - c.custo) * 100) / 100
                                const margemPctC = receitaC > 0 ? Math.round(margemC / receitaC * 1000) / 10 : null
                                const consKey = `${ck}:${c.user_id}`
                                const consOpen = expandedCons.has(consKey)
                                const temProj = (c.projetos?.length ?? 0) > 0
                                return (
                                  <Fragment key={c.user_id}>
                                  <tr style={{ borderTop: '1px solid var(--border)', background: c.tem_investimento ? 'var(--danger-bg)' : undefined, cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(consKey) ? n.delete(consKey) : n.add(consKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>
                                      {temProj && (consOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      {c.consultor} <span style={{ color: 'var(--text-light)', fontSize: 11 }}>({formatBRL(c.valor_hora)}/h)</span>
                                      {c.tem_investimento && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 4, padding: '0 4px' }}>INVEST.</span>}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{fmtH(c.horas)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{(pct * 100).toFixed(1)}%</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(receitaC)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(c.custo)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: margemC < 0 ? 'var(--danger)' : 'var(--text)' }} className="tabular-nums">{formatBRL(margemC)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: pctColor(margemPctC) }} className="tabular-nums">{margemPctC == null ? '—' : margemPctC + '%'}</td>
                                  </tr>
                                  {consOpen && temProj && [...(c.projetos ?? [])].sort((a, b) => b.horas - a.horas).map(p => (
                                    <tr key={p.project_id} style={{ background: 'var(--bg)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: 'var(--danger)', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: 'var(--danger)', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{fmtH(p.horas)}</td>
                                      <td></td><td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                      <td></td><td></td>
                                    </tr>
                                  ))}
                                  </Fragment>
                                )
                              })}
                              {(r.despesas?.custo ?? 0) > 0 && (() => {
                                const dKey = `${ck}:despesas`
                                const dOpen = expandedCons.has(dKey)
                                const dProj = r.despesas?.projetos ?? []
                                const temProj = dProj.length > 0
                                return (
                                  <Fragment key="despesas">
                                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--warning-bg)', cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(dKey) ? n.delete(dKey) : n.add(dKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)', fontWeight: 600 }}>
                                      {temProj && (dOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      🧾 Despesas
                                    </td>
                                    <td></td><td></td><td></td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(r.despesas?.custo ?? 0)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--danger)' }} className="tabular-nums">{formatBRL(-(r.despesas?.custo ?? 0))}</td>
                                    <td></td>
                                  </tr>
                                  {dOpen && temProj && [...dProj].sort((a, b) => b.custo - a.custo).map(p => (
                                    <Fragment key={p.project_id}>
                                    <tr style={{ background: 'var(--bg)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: 'var(--danger)', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: 'var(--danger)', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td></td><td></td><td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                      <td></td><td></td>
                                    </tr>
                                    {[...(p.usuarios ?? [])].sort((a, b) => b.custo - a.custo).map(u => (
                                      <tr key={`${p.project_id}-u${u.user_id}`} style={{ background: 'var(--bg)' }}>
                                        <td style={{ textAlign: 'left', padding: '2px 8px 2px 52px', color: 'var(--text-light)', fontSize: 11 }}>👤 {u.usuario}</td>
                                        <td></td><td></td><td></td>
                                        <td style={{ textAlign: 'right', padding: '2px 8px', color: 'var(--text-light)', fontSize: 11 }} className="tabular-nums">{formatBRL(u.custo)}</td>
                                        <td></td><td></td>
                                      </tr>
                                    ))}
                                    </Fragment>
                                  ))}
                                  </Fragment>
                                )
                              })()}
                            </tbody>
                          </table>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  })}
                  {/* Total */}
                  <tr>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', borderTop: '2px solid var(--border)' }}>Total</td>
                    <td style={{ borderTop: '2px solid var(--border)' }}></td>
                    <td style={{ ...tdCol(COL_HEAD.receita_total, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.receitaTotal)}</td>
                    <td style={{ ...tdCol(COL_HEAD.recebido, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.recebido)}</td>
                    <td style={{ ...tdCol(COL_HEAD.em_aberto, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.emAberto)}</td>
                    <td style={{ ...tdCol(COL_HEAD.custo, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custo)}{clientesTot.margemOpPct != null && <div style={{ color: mgOpColor(clientesTot.margemOpPct), fontWeight: 700, fontSize: 10 }}>Mg op. {clientesTot.margemOpPct.toFixed(1)}%</div>}</td>
                    <td style={{ ...tdCol(COL_HEAD.custo40, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custo40)}{clientesTot.custo40Pct != null && <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 10 }}>({clientesTot.custo40Pct.toFixed(1)}%)</div>}</td>
                    <td style={{ ...tdCol(COL_HEAD.total, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custoTotal)}</td>
                    <td style={{ ...tdCol(COL_HEAD.resultado, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.resultado)}</td>
                    <td style={{ ...tdCol(margemBg(clientesTot.pct), '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{clientesTot.pct == null ? '—' : clientesTot.pct.toFixed(1) + '%'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : loading ? (
          <SkeletonTable rows={8} cols={10} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Sem dados" description="Nenhum apontamento para o mês/filtros." />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
              <button onClick={expandAll} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ChevronDown size={13} /> Expandir tudo
              </button>
              <button onClick={collapseAll} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight size={13} /> Recolher tudo
              </button>
            </div>
          <Table>
            <Thead>
              <tr>
                <Th {...thProps(visao === 'projeto' ? 'projeto' : 'consultor')}>{visao === 'projeto' ? 'Projeto' : 'Consultor'}</Th>
                <Th {...thProps('cliente')}>Cliente</Th>
                <Th>Categoria</Th>
                <Th right {...thProps('n_consultores')}>{visao === 'projeto' ? 'Cons.' : 'Proj.'}</Th>
                <Th right {...thProps('horas')}>Horas</Th><Th right {...thProps('valor_hora_projeto')}>R$/h Proj.</Th>
                <Th right {...thProps('valor_hora_consultor')}>{visao === 'projeto' ? 'Custo/h' : 'R$/h Cons.'}</Th>
                <Th right {...thProps('receita')}>Receita</Th><Th right {...thProps('custo')}>Custo</Th><Th right {...thProps('margem')}>Margem</Th><Th right {...thProps('margem_pct')}>%</Th>
              </tr>
            </Thead>
            <Tbody>
              {sorted.map((r) => {
                const pid = parentId(r)
                const isOpen = expanded.has(pid)
                const kids = childrenOf(r)
                const nomePai = visao === 'projeto' ? r.projeto : r.consultor
                const cats = new Set(kids.map(k => k.categoria).filter(Boolean))
                const parentCat: 'sustentacao' | 'projeto' | 'misto' | null = cats.size === 0 ? null : cats.size === 1 ? ([...cats][0] as 'sustentacao' | 'projeto') : 'misto'
                return (
                  <Fragment key={r.key}>
                    <Tr onClick={() => toggleRow(pid)}>
                      <Td className="font-medium" style={{ color: 'var(--text)' }}>
                        <span className="inline-flex items-center gap-1.5">
                          {kids.length > 0
                            ? (isOpen ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />)
                            : <span style={{ display: 'inline-block', width: 13 }} />}
                          <span className="truncate max-w-[240px]">{nomePai}</span>
                          {r.is_investimento && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 4, padding: '0 4px' }}>INVEST.</span>}
                        </span>
                      </Td>
                      <Td muted className="truncate max-w-[140px]">{visao === 'projeto' ? r.cliente : '—'}</Td>
                      <Td><CatBadge cat={parentCat} /></Td>
                      <Td right muted className="tabular-nums">{r.n_consultores}</Td>
                      <Td right className="tabular-nums">{fmtH(r.horas)}</Td>
                      <Td right muted className="tabular-nums">{formatBRL(r.valor_hora_projeto)}</Td>
                      <Td right muted className="tabular-nums">{formatBRL(r.valor_hora_consultor)}</Td>
                      <Td right className="tabular-nums">{formatBRL(r.receita)}</Td>
                      <Td right muted className="tabular-nums">{formatBRL(r.custo)}</Td>
                      <Td right className="font-semibold tabular-nums">{formatBRL(r.margem)}</Td>
                      <Td right className="font-semibold tabular-nums" style={{ color: pctColor(r.margem_pct) }}>{r.margem_pct == null ? '—' : r.margem_pct + '%'}</Td>
                    </Tr>
                    {isOpen && kids.map(c => (
                      <Tr key={`${r.key}:${visao === 'projeto' ? c.user_id : c.project_id}`} baseBackground="var(--surface-hover)">
                        <Td>
                          <span className="inline-flex items-center gap-1.5 pl-6" style={{ color: 'var(--text-muted)' }}>
                            <span className="text-[var(--text-muted)]">↳</span>
                            <span className="truncate max-w-[220px]">
                              {visao !== 'projeto' && c.is_investimento && <span style={{ color: 'var(--danger)', marginRight: 4 }}>●</span>}
                              {visao === 'projeto' ? c.consultor : c.projeto}
                              {visao !== 'projeto' && c.is_investimento && <span style={{ color: 'var(--danger)', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                            </span>
                          </span>
                        </Td>
                        <Td muted className="truncate max-w-[140px]">{visao === 'projeto' ? '—' : c.cliente}</Td>
                        <Td><CatBadge cat={c.categoria ?? null} /></Td>
                        <Td right muted></Td>
                        <Td right muted className="tabular-nums">{fmtH(c.horas)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.valor_hora_projeto)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.valor_hora_consultor)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.receita)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.custo)}</Td>
                        <Td right className="tabular-nums">{formatBRL(c.margem)}</Td>
                        <Td right className="tabular-nums" style={{ color: pctColor(c.margem_pct) }}>{c.margem_pct == null ? '—' : c.margem_pct + '%'}</Td>
                      </Tr>
                    ))}
                  </Fragment>
                )
              })}
            </Tbody>
          </Table>
          </>
        )}
      </div>

      {diaModal && diaDetalhe && (
        <div onClick={() => setDiaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(580px, 100%)', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Apontamentos de {diaModal.split('-').reverse().join('/')}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{diaDetalhe.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h em {diaDetalhe.itens.length} lançamento(s)</p>
              </div>
              <button onClick={() => setDiaModal(null)} style={{ color: 'var(--text-muted)' }} title="Fechar"><X size={18} /></button>
            </div>
            <div className="p-2">
              {diaDetalhe.itens.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-light)' }}>Sem apontamentos neste dia.</p>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: 'var(--text-light)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Projeto</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Cliente</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                  </tr></thead>
                  <tbody>
                    {diaDetalhe.itens.map((it, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 8px', color: 'var(--text)' }}>{it.consultor}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{it.projeto}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-light)' }}>{it.cliente}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text)' }} className="tabular-nums">{it.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {keruakModal && (
        <KeruakTitulosModal
          cliente={keruakModal.cliente}
          cnpjs={keruakModal.cnpjs}
          recebMonths={recebMonths}
          valorInicial={keruakModal.valorInicial}
          modo={keruakModal.modo}
          onClose={() => setKeruakModal(null)}
        />
      )}

      {showCustoDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => setShowCustoDetail(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--primary-soft)', borderBottom: '1px solid var(--border)' }}>
              <Wallet size={18} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Custo por pessoa</span>
              <button
                onClick={exportCustoExcel}
                disabled={custoBreakdown.length === 0}
                className="ml-auto flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg disabled:opacity-40"
                style={{ color: 'var(--primary)', background: 'var(--surface)', border: '1px solid var(--border)' }}
                title="Exportar em Excel"
              >
                <Download size={13} /> Excel
              </button>
              <button onClick={() => setShowCustoDetail(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5">
              {custoBreakdown.map(it => (
                <div key={`${it.user_id}:${it.tipo}`} className="flex items-center justify-between gap-3 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm truncate" style={{ color: 'var(--text)' }}>{it.name}<span className="text-[10px] ml-1.5" style={{ color: 'var(--text-light)' }}>{it.tipo}</span></span>
                  <span className="text-sm tabular-nums font-semibold shrink-0" style={{ color: 'var(--text)' }}>{formatBRL(it.value)}</span>
                </div>
              ))}
              {custoBreakdown.length === 0 && <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>Sem custo no período.</p>}
            </div>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '2px solid var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Total · {custoBreakdown.length} pessoa(s)</span>
              <span className="text-base tabular-nums font-bold" style={{ color: 'var(--primary)' }}>{formatBRL(totReal.custo)}</span>
            </div>
          </div>
        </div>
      )}
      {showHiddenCfg && <HiddenUsersModal onClose={() => setShowHiddenCfg(false)} onSaved={() => setReloadTick(t => t + 1)} />}
    </>
  )
  return embedded ? content : <AppLayout title="Relatório de Rentabilidade">{content}</AppLayout>
}
