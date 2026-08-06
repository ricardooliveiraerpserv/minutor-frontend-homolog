'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { ArrowLeft, Briefcase, Trophy, XCircle, Clock, Package, DollarSign, MessageSquare, ChevronDown, Plus, Star, Users, TrendingUp, ShoppingBag, Info, X } from 'lucide-react'

interface Header {
  customer_id: number; name: string; crm_status: string | null; segment: string | null
  executivo_conta: string | null; responsavel_comercial: string | null; data_cadastro: string | null
  ultima_interacao_at: string | null; proxima_acao: { descricao: string | null; data: string | null } | null
}
interface Resumo {
  oportunidades_abertas?: number; valor_pipeline?: number; contratos_ativos: number; projetos_ativos: number
  horas_contratadas: number; horas_consumidas: number; receita_total?: number | null; rentabilidade?: number | null; financeiro_pendente?: boolean
}
interface Crm {
  lead_created_at: string | null; qualified_at: string | null
  oportunidades: { id: number; title: string; status: string; stage: string | null; valor: number; responsavel: string | null; proxima_acao_at: string | null }[]
  oportunidades_total?: number
  propostas_count: number; conversoes_count: number
  perdas: { title: string; motivo: string | null }[]
  produtos_interesse: { name: string; categoria: string | null }[]
}
interface NegKpis { valor_andamento: number; valor_vendido: number; valor_perdido: number; total: number; ticket_medio: number; tempo_medio_dias: number | null; abertas: number; ganhas: number; perdidas: number }
interface Neg { id: number; title: string; status: string; stage: string | null; valor: number; responsavel: string | null; qualificacao: string | null; estrelas: number | null; probabilidade: number | null; proxima_tarefa: { tipo: string; titulo: string | null; data: string | null } | null }
interface Negociacoes { kpis: NegKpis; negociacoes: Neg[] }
interface TimelineItem { when: string | null; source: string; type: string; label: string | null; user?: string | null }
interface Contrato { id: number; projeto: string; tipo: string; tipo_faturamento: string | null; status: string; valor: number; horas_contratadas: number; data_vencimento: string | null; executivo_conta: string | null; vendedor: string | null; is_banco_horas: boolean }
interface Adm { contratos: Contrato[]; contratos_total?: number; contratos_ativos: number; banco_horas: { contratadas: number; consumidas: number; saldo: number } }
interface ProjetoServ { id: number; name: string; status: string; ativo: boolean; sold_hours: number; horas_consumidas: number }
interface Apont { data: string | null; consultor: string | null; projeto: string | null; horas: number; obs: string | null }
interface Serv {
  projetos: ProjetoServ[]; projetos_total?: number; projetos_ativos: number
  apontamentos: { total_horas: number; lancamentos: number; recentes: Apont[] }
  despesas?: { total: number; pagas: number; pendentes: number; lancamentos: number }
  cronograma_pendente: boolean; atividades_pendente: boolean
}
interface Financeiro { competencia: string; receita?: number; recebido?: number; custo?: number; margem?: number; margem_pct?: number | null; horas?: number; sem_dados?: boolean; financeiro_indisponivel?: boolean; erro?: string }
interface Saude {
  score: number; status: 'saudavel' | 'atencao' | 'critico'; critico_imediato: boolean
  motivos: { texto: string; peso: number; critico: boolean }[]
  historico: { status: string; score: number; when: string | null }[]
}
const SAUDE_INFO: Record<string, { l: string; emoji: string; cor: string; bg: string }> = {
  saudavel: { l: 'Saudável', emoji: '🟢', cor: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  atencao:  { l: 'Atenção',  emoji: '🟡', cor: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  critico:  { l: 'Crítico',  emoji: '🔴', cor: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
interface Timeline { eventos: TimelineItem[]; total: number }
interface Permissoes { comercial: boolean; adm: boolean; serv: boolean; despesas: boolean }
interface Data360 { header: Header; resumo: Resumo; crm?: Crm; negociacoes?: Negociacoes; saude?: Saude; adm?: Adm; serv?: Serv; timeline: Timeline }

interface Profile { region: string | null; segment: string | null; porte: string | null; faturamento_estimado: number | null; num_funcionarios: number | null; erp_atual: string | null; indicacao: string | null; site?: string | null; cep?: string | null; endereco?: string | null; observacoes?: string | null }
interface CrmShow { crm_status: string | null; cgc: string | null; profile: Profile | null; executive?: { id: number; name: string } | null; tags?: { id: number; name: string }[] }
interface Contact { id: number; name: string; cargo: string | null; email: string | null; phone: string | null; whatsapp: string | null; departamento: string | null; influencia_decisao: string | null; canal_preferido: string | null }

const fmtBRL = (n: number | null) => n == null ? '—' : (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const STATUS_LABEL: Record<string, string> = { lead: 'Lead', prospect: 'Prospect', cliente: 'Cliente', contrato_ativo: 'Cliente', em_renovacao: 'Em Renovação', inativo: 'Inativo' }
const srcStyle = (s: string) => s === 'lead' ? { background: 'rgba(56,189,248,0.15)', color: '#38bdf8' } : s === 'crm' ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : s === 'followup' ? { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' } : { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
const srcLabel = (s: string) => s === 'lead' ? 'Lead' : s === 'crm' ? 'CRM' : s === 'followup' ? 'Follow-up' : 'Contrato'
const EVT_LABEL: Record<string, string> = {
  created: 'Criada', stage_changed: 'Mudou de etapa', valor_alterado: 'Valor alterado',
  probabilidade_alterada: 'Probabilidade alterada', previsao_alterada: 'Previsão alterada', parada_alterada: 'Motivo da parada',
  task_done: 'Tarefa concluída', task_reopened: 'Tarefa reaberta', task_updated: 'Tarefa editada', note: 'Nota',
  won: 'Ganha', lost: 'Perdida', converted: 'Convertida em contrato', automacao: 'Automação', automacao_erro: 'Falha em automação',
  field_changed: 'Campo alterado', qualified: 'Qualificado', prospect: 'Virou prospect', lead_created: 'Lead criado',
  cliente_pendente_cnpj: 'Cliente pendente de CNPJ', product_added: 'Produto adicionado', product_removed: 'Produto removido',
  renovacao_ignorada: 'Renovação ignorada',
}
const evtLabel = (t: string) => EVT_LABEL[t] ?? (t ? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : t)
const FU_CAT = ['retorno', 'proposta', 'reclamacao', 'aprovacao', 'sinalizou_renovacao', 'reuniao', 'outro']

// Status da negociação → rótulo + cor (em andamento / vendido / perdido).
const NEG_STATUS: Record<string, { l: string; c: string; b: string }> = {
  aberto:  { l: 'Em andamento', c: '#0ea5e9', b: 'rgba(14,165,233,0.14)' },
  ganho:   { l: 'Vendido',      c: '#16a34a', b: 'rgba(34,197,94,0.15)' },
  perdido: { l: 'Perdido',      c: 'var(--danger-border)', b: 'var(--danger-bg)' },
}
const initials = (name: string | null) => !name ? '—' : name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')

function Kpi({ label, value, sub, pending }: { label: string; value: string; sub?: string; pending?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: pending ? 'var(--text-light)' : 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// Card KPI grande do resumo de negociações (com faixa de cor opcional, estilo do print).
function BigKpi({ label, value, sub, tone, icon: Ic }: { label: string; value: string; sub?: string; tone?: 'info' | 'success' | 'danger'; icon?: typeof Info }) {
  const bg = tone === 'info' ? 'rgba(14,165,233,0.10)' : tone === 'success' ? 'rgba(34,197,94,0.10)' : tone === 'danger' ? 'var(--danger-bg)' : 'var(--surface)'
  const brd = tone === 'info' ? 'rgba(14,165,233,0.30)' : tone === 'success' ? 'rgba(34,197,94,0.30)' : tone === 'danger' ? 'var(--danger-border)' : 'var(--border)'
  const lc = tone === 'info' ? '#0ea5e9' : tone === 'success' ? '#16a34a' : tone === 'danger' ? 'var(--danger-border)' : 'var(--text-light)'
  return (
    <div className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${brd}` }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium" style={{ color: lc }}>{label}</p>
        {Ic && <Ic size={14} style={{ color: lc, opacity: 0.7 }} />}
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{sub}</p>}
    </div>
  )
}

// Seção accordion do painel lateral.
function SideSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {title}
        <ChevronDown size={16} style={{ color: 'var(--text-light)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-xs">
      <span className="shrink-0" style={{ color: 'var(--text-light)' }}>{label}</span>
      <span className="text-right" style={{ color: 'var(--text)' }}>{value ?? '—'}</span>
    </div>
  )
}

export default function Ficha360Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = Number(params.id)
  const [d, setD] = useState<Data360 | null>(null)
  const [perms, setPerms] = useState<Permissoes | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'negociacoes' | 'timeline' | 'crm' | 'adm' | 'serv'>('negociacoes')
  const [saudeOpen, setSaudeOpen] = useState(false)

  // Painel lateral (cadastro + contatos)
  const [crmShow, setCrmShow] = useState<CrmShow | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({ cadastro: true, info: false, obs: false })
  const [expContact, setExpContact] = useState<number | null>(null)
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', cargo: '', email: '', phone: '' })
  const [savingContact, setSavingContact] = useState(false)
  const toggleSec = (k: string) => setOpenSec(s => ({ ...s, [k]: !s[k] }))

  const [fups, setFups] = useState<{ id: number; categoria: string | null; tipo: string; titulo: string | null; data: string | null; concluida_at: string | null }[]>([])
  const [fuForm, setFuForm] = useState({ categoria: 'retorno', tipo: 'ligacao', titulo: '', data: '' })
  const loadFups = useCallback(() => { api.get<{ data: any[] }>(`/crm/tasks?customer_id=${id}`).then(r => setFups(r?.data ?? [])).catch(() => {}) }, [id])
  const loadContacts = useCallback(() => { api.get<{ data: Contact[] }>(`/customer-contacts?customer_id=${id}`).then(r => setContacts((r as any)?.data ?? (r as any) ?? [])).catch(() => {}) }, [id])
  const addFup = async () => {
    if (!fuForm.titulo.trim()) { toast.error('Descreva o follow-up'); return }
    try { await api.post('/crm/tasks', { customer_id: id, tipo: fuForm.tipo, categoria: fuForm.categoria, titulo: fuForm.titulo, data: fuForm.data || null }); setFuForm({ categoria: 'retorno', tipo: 'ligacao', titulo: '', data: '' }); loadFups(); toast.success('Follow-up registrado') }
    catch { toast.error('Erro ao registrar') }
  }
  const addContact = async () => {
    if (!newContact.name.trim()) { toast.error('Informe o nome do contato'); return }
    setSavingContact(true)
    try {
      await api.post('/customer-contacts', { customer_id: id, name: newContact.name.trim(), cargo: newContact.cargo.trim() || null, email: newContact.email.trim() || null, phone: newContact.phone.trim() || null })
      setNewContact({ name: '', cargo: '', email: '', phone: '' }); setShowAddContact(false); loadContacts(); toast.success('Contato adicionado')
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao adicionar contato') } finally { setSavingContact(false) }
  }

  // Financeiro (Fase B) — lazy/sob demanda (Keruak é HTTP).
  const [comp, setComp] = useState(() => new Date().toISOString().slice(0, 7))
  const [fin, setFin] = useState<Financeiro | null>(null)
  const [finLoading, setFinLoading] = useState(false)
  const calcFinanceiro = () => {
    setFinLoading(true); setFin(null)
    api.get<{ data: { financeiro: Financeiro } }>(`/customers/${id}/360?sections=financeiro&competencia=${comp}`)
      .then(r => setFin(r?.data?.financeiro ?? null)).catch(() => setFin({ competencia: comp, financeiro_indisponivel: true, erro: 'Falha ao calcular.' })).finally(() => setFinLoading(false))
  }

  useEffect(() => {
    api.get<{ data: Data360; permissoes: Permissoes }>(`/customers/${id}/360?sections=header,resumo,negociacoes,crm,saude,adm,serv,timeline`)
      .then(r => { setD(r?.data ?? null); setPerms(r?.permissoes ?? null) })
      .catch((e: any) => { if (e?.status === 403) setForbidden(true) })
      .finally(() => setLoading(false))
    api.get<{ data: CrmShow }>(`/customers/${id}/crm`).then(r => setCrmShow(r?.data ?? null)).catch(() => {})
    loadFups(); loadContacts()
  }, [id, loadFups, loadContacts])

  const h = d?.header; const r = d?.resumo; const crm = d?.crm; const neg = d?.negociacoes; const adm = d?.adm; const serv = d?.serv
  const comercial = perms?.comercial ?? false
  const prof = crmShow?.profile

  // Aba inicial: Negociações se comercial, senão a 1ª disponível.
  useEffect(() => {
    if (d) setTab(d.negociacoes ? 'negociacoes' : d.adm ? 'adm' : d.serv ? 'serv' : 'timeline')
  }, [d])

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <AppLayout title="Empresa">
      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : forbidden ? <p style={{ color: 'var(--danger-border)' }}>Você não tem acesso à ficha desta empresa.</p>
        : !d ? <p style={{ color: 'var(--text-light)' }}>Empresa não encontrada.</p> : (
        <>
          {/* CABEÇALHO */}
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div>
              <button onClick={() => router.back()} className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={13} /> Empresa</button>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{h!.name}</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{STATUS_LABEL[h!.crm_status ?? ''] ?? h!.crm_status ?? '—'}</span>
                {d.saude && (() => { const si = SAUDE_INFO[d.saude.status]; return (
                  <button onClick={() => setSaudeOpen(o => !o)} className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ background: si.bg, color: si.cor }} title="Saúde da conta — clique para detalhes">
                    {si.emoji} {si.l}{d.saude.score > 0 ? ` (${d.saude.score})` : ''}
                  </button>
                )})()}
              </div>
            </div>
            {comercial && (
              <button onClick={() => router.push(`/crm/pipeline?customer_id=${id}`)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                <Plus size={16} /> Criar negociação
              </button>
            )}
          </div>

          {/* Detalhes da Saúde da Conta */}
          {saudeOpen && d.saude && (
            <div className="mb-4 rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: `1px solid ${SAUDE_INFO[d.saude.status].cor}` }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: SAUDE_INFO[d.saude.status].cor }}>{SAUDE_INFO[d.saude.status].emoji} {SAUDE_INFO[d.saude.status].l} · score {d.saude.score}</p>
              {d.saude.motivos.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum fator de risco — conta saudável.</p> : (
                <ul className="space-y-0.5">
                  {d.saude.motivos.map((m, i) => (
                    <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: m.critico ? 'var(--danger-border)' : 'var(--text-muted)' }}>
                      <span>•</span> {m.texto}{m.critico ? ' (crítico)' : m.peso ? ` (+${m.peso})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(260px, 320px) 1fr' }}>
            {/* ─────────── PAINEL LATERAL ─────────── */}
            <div className="space-y-4 self-start">
              <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--text)' }}>Empresa</div>
                <SideSection title="Cadastro" open={!!openSec.cadastro} onToggle={() => toggleSec('cadastro')}>
                  <Row label="Empresa" value={<span title={h!.name}>{h!.name}</span>} />
                  <Row label="Segmento" value={prof?.segment || h!.segment} />
                  <Row label="CNPJ / CPF" value={crmShow?.cgc} />
                  <Row label="URL / site" value={prof?.site ? <a href={/^https?:\/\//.test(prof.site) ? prof.site : `https://${prof.site}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>{prof.site}</a> : '—'} />
                  {prof?.cep && <Row label="CEP" value={prof.cep} />}
                  <Row label="Endereço" value={prof?.endereco} />
                </SideSection>
                <SideSection title="Informações adicionais" open={!!openSec.info} onToggle={() => toggleSec('info')}>
                  <Row label="Região" value={prof?.region} />
                  <Row label="Porte" value={prof?.porte} />
                  <Row label="Faturamento est." value={prof?.faturamento_estimado != null ? fmtBRL(prof.faturamento_estimado) : '—'} />
                  <Row label="Nº funcionários" value={prof?.num_funcionarios ?? '—'} />
                  <Row label="ERP atual" value={prof?.erp_atual} />
                  <Row label="Indicação / origem" value={prof?.indicacao} />
                  <Row label="Executivo" value={h!.executivo_conta} />
                  <Row label="Resp. comercial" value={h!.responsavel_comercial} />
                  <Row label="Cadastro" value={fmtDate(h!.data_cadastro)} />
                  {adm && <Row label="Contratos ativos" value={adm.contratos_ativos} />}
                  {serv && <Row label="Projetos ativos" value={serv.projetos_ativos} />}
                  {crmShow?.tags && crmShow.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {crmShow.tags.map(t => <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{t.name}</span>)}
                    </div>
                  )}
                </SideSection>
                <SideSection title="Observações" open={!!openSec.obs} onToggle={() => toggleSec('obs')}>
                  <p className="text-xs whitespace-pre-wrap" style={{ color: prof?.observacoes ? 'var(--text)' : 'var(--text-light)' }}>{prof?.observacoes || 'Sem observações.'}</p>
                </SideSection>
              </div>

              {/* Contatos associados */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Users size={15} /> Contatos associados</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{contacts.length}</span>
                </div>
                {contacts.map(c => (
                  <div key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={() => setExpContact(e => e === c.id ? null : c.id)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{initials(c.name)}</span>
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}{c.cargo && <span className="block text-[10px] font-normal" style={{ color: 'var(--text-light)' }}>{c.cargo}</span>}</span>
                      <ChevronDown size={14} style={{ color: 'var(--text-light)', transform: expContact === c.id ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    {expContact === c.id && (
                      <div className="px-4 pb-2.5 pl-13 text-xs space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                        {c.email && <p>✉️ {c.email}</p>}
                        {c.phone && <p>📞 {c.phone}</p>}
                        {c.whatsapp && <p>💬 {c.whatsapp}</p>}
                        {c.departamento && <p>🏢 {c.departamento}</p>}
                        {!c.email && !c.phone && !c.whatsapp && !c.departamento && <p style={{ color: 'var(--text-light)' }}>Sem dados de contato.</p>}
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={() => setShowAddContact(true)} className="w-full flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold" style={{ borderTop: '1px solid var(--border)', color: 'var(--primary)' }}>
                  <Plus size={14} /> Adicionar contato
                </button>
              </div>
            </div>

            {/* ─────────── ÁREA PRINCIPAL ─────────── */}
            <div className="min-w-0">
              {/* Abas */}
              <div className="flex gap-1 mb-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
                {(() => {
                  const tabs: [typeof tab, string][] = []
                  if (neg) tabs.push(['negociacoes', 'Negociações'])
                  tabs.push(['timeline', 'Histórico'])
                  if (crm) tabs.push(['crm', 'Relacionamento'])
                  if (adm) tabs.push(['adm', 'Administrativo'])
                  if (serv) tabs.push(['serv', 'Serviços'])
                  return tabs.map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm font-semibold -mb-px" style={tab === k ? { color: 'var(--primary)', borderBottom: '2px solid var(--primary)' } : { color: 'var(--text-muted)', borderBottom: '2px solid transparent' }}>{l}</button>
                  ))
                })()}
              </div>

              {/* ── NEGOCIAÇÕES ── */}
              {tab === 'negociacoes' && neg && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <BigKpi label="Valor total em andamento" tone="info" value={fmtBRL(neg.kpis.valor_andamento)} sub={`${neg.kpis.abertas} em aberto`} />
                    <BigKpi label="Valor total vendido" tone="success" value={fmtBRL(neg.kpis.valor_vendido)} sub={`${neg.kpis.ganhas} ganha(s)`} />
                    <BigKpi label="Valor total perdido" tone="danger" value={fmtBRL(neg.kpis.valor_perdido)} sub={`${neg.kpis.perdidas} perdida(s)`} />
                    <BigKpi label="Total de negociações" value={String(neg.kpis.total)} icon={Briefcase} />
                    <BigKpi label="Ticket médio" value={fmtBRL(neg.kpis.ticket_medio)} icon={TrendingUp} sub="média das vendidas" />
                    <BigKpi label="Tempo médio até a venda" value={neg.kpis.tempo_medio_dias != null ? `${neg.kpis.tempo_medio_dias}` : '—'} sub="dias" icon={Clock} />
                  </div>

                  <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <table className="w-full text-sm">
                      <thead><tr style={{ color: 'var(--text-light)' }}>
                        {['Negociação', 'Responsável', 'Qualificação', 'Status', 'Valor total', 'Próxima tarefa'].map(hd => <th key={hd} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">{hd}</th>)}
                      </tr></thead>
                      <tbody>
                        {neg.negociacoes.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma negociação para esta empresa.</td></tr>
                        : neg.negociacoes.map(o => {
                          const st = NEG_STATUS[o.status] ?? NEG_STATUS.aberto
                          return (
                            <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td className="px-4 py-3">
                                <p className="font-medium" style={{ color: 'var(--primary)' }}>{o.title}</p>
                                {o.stage && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{o.stage}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{initials(o.responsavel)}</span>
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex gap-0.5">
                                  {[1, 2, 3].map(n => <Star key={n} size={13} style={{ color: (o.estrelas ?? 0) >= n ? '#f59e0b' : 'var(--border)' }} fill={(o.estrelas ?? 0) >= n ? '#f59e0b' : 'none'} />)}
                                </span>
                              </td>
                              <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: st.b, color: st.c }}>{st.l}</span></td>
                              <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(o.valor)}</td>
                              <td className="px-4 py-3 text-xs" style={{ color: o.proxima_tarefa ? 'var(--text-muted)' : 'var(--text-light)' }}>
                                {o.proxima_tarefa ? <>{o.proxima_tarefa.titulo || o.proxima_tarefa.tipo}<span className="block text-[10px]" style={{ color: 'var(--text-light)' }}>{fmtDate(o.proxima_tarefa.data)}</span></> : 'Não há tarefas'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── HISTÓRICO ── */}
              {tab === 'timeline' && (
                <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Trophy size={12} /> Histórico <span className="font-normal normal-case" style={{ color: 'var(--text-light)' }}>({d.timeline.total} eventos)</span></h3>
                  {d.timeline.eventos.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem eventos.</p> : (
                    <div className="space-y-2 max-h-[34rem] overflow-y-auto">
                      {d.timeline.eventos.map((t, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="shrink-0 w-16 tabular-nums" style={{ color: 'var(--text-light)' }}>{fmtDate(t.when)}</span>
                          <span className="mt-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0" style={srcStyle(t.source)}>{srcLabel(t.source)}</span>
                          <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{evtLabel(t.type)}{t.label ? ` · ${t.label}` : ''}{t.user ? <span style={{ color: 'var(--text-light)' }}> · 👤 {t.user}</span> : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── RELACIONAMENTO (CRM: follow-ups, produtos, perdas) ── */}
              {tab === 'crm' && crm && (
                <div className="space-y-4">
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><MessageSquare size={12} /> Relacionamento (follow-ups)</h3>
                    <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                      {fups.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem follow-ups.</p>
                        : fups.map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-xs">
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>{t.categoria ?? t.tipo}</span>
                            <span className="flex-1" style={{ color: 'var(--text)', textDecoration: t.concluida_at ? 'line-through' : 'none' }}>{t.titulo}</span>
                            <span className="shrink-0" style={{ color: 'var(--text-light)' }}>{fmtDate(t.concluida_at ?? t.data)}</span>
                          </div>
                        ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <select value={fuForm.categoria} onChange={e => setFuForm(f => ({ ...f, categoria: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>{FU_CAT.map(c => <option key={c} value={c}>{c}</option>)}</select>
                      <input value={fuForm.titulo} onChange={e => setFuForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex.: Cliente pediu retorno" className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none min-w-40" style={inputStyle} />
                      <input type="date" value={fuForm.data} onChange={e => setFuForm(f => ({ ...f, data: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
                      <button onClick={addFup} className="px-2.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Registrar</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi label="Lead criado" value={fmtDate(crm.lead_created_at)} />
                    <Kpi label="Qualificado" value={fmtDate(crm.qualified_at)} />
                    <Kpi label="Propostas" value={String(crm.propostas_count)} />
                    <Kpi label="Conversões" value={String(crm.conversoes_count)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><ShoppingBag size={12} /> Produtos de interesse</h3>
                      {crm.produtos_interesse.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>—</p> : (
                        <div className="flex flex-wrap gap-1.5">{crm.produtos_interesse.map((p, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{p.name}</span>)}</div>
                      )}
                    </div>
                    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><XCircle size={12} /> Perdas</h3>
                      {crm.perdas.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhuma.</p> : (
                        <div className="space-y-1">{crm.perdas.map((p, i) => <div key={i} className="text-xs flex justify-between"><span style={{ color: 'var(--text-muted)' }}>{p.title}</span><span style={{ color: 'var(--danger-border)' }}>{p.motivo ?? '—'}</span></div>)}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── ADMINISTRATIVO ── */}
              {tab === 'adm' && adm && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi label="Contratos ativos" value={String(adm.contratos_ativos)} />
                    <Kpi label="BH contratadas" value={`${adm.banco_horas.contratadas}h`} />
                    <Kpi label="BH consumidas" value={`${adm.banco_horas.consumidas}h`} />
                    <Kpi label="BH saldo" value={`${adm.banco_horas.saldo}h`} pending={adm.banco_horas.saldo < 0} />
                  </div>
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><DollarSign size={12} /> Receita & Rentabilidade (Rentabilidade × Keruak)</h3>
                      <div className="flex items-center gap-2">
                        <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
                        <button onClick={calcFinanceiro} disabled={finLoading} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{finLoading ? 'Calculando…' : 'Calcular'}</button>
                      </div>
                    </div>
                    {!fin ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Selecione a competência e clique em Calcular. (Dado financeiro é carregado sob demanda.)</p>
                      : fin.financeiro_indisponivel ? <p className="text-[11px]" style={{ color: 'var(--danger-border)' }}>{fin.erro ?? 'Indisponível no momento.'}</p>
                      : fin.sem_dados ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem movimento na competência {fin.competencia}.</p>
                      : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <Kpi label="Faturado" value={fmtBRL(fin.receita ?? 0)} />
                          <Kpi label="Recebido (Keruak)" value={fmtBRL(fin.recebido ?? 0)} />
                          <Kpi label="Custo" value={fmtBRL(fin.custo ?? 0)} />
                          <Kpi label="Margem" value={fmtBRL(fin.margem ?? 0)} />
                          <Kpi label="Margem %" value={`${fin.margem_pct ?? 0}%`} />
                        </div>
                      )}
                  </div>
                  <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead><tr style={{ color: 'var(--text-light)' }}>
                        {['Contrato', 'Tipo', 'Status', 'Valor', 'Horas', 'Vencimento', 'Executivo', 'Vendedor'].map(hd => <th key={hd} className="text-left px-3 py-2 text-[11px] font-semibold">{hd}</th>)}
                      </tr></thead>
                      <tbody>
                        {adm.contratos.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center" style={{ color: 'var(--text-light)' }}>Nenhum contrato.</td></tr>
                        : adm.contratos.map(c => (
                          <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{c.projeto}{c.is_banco_horas && <span className="text-[9px] ml-1 px-1 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>BH</span>}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{c.tipo}</td>
                            <td className="px-3 py-2"><span className="text-[11px]" style={{ color: c.status === 'ativo' ? '#22c55e' : 'var(--text-muted)' }}>{c.status}</span></td>
                            <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(c.valor)}</td>
                            <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.horas_contratadas || '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--text-light)' }}>{fmtDate(c.data_vencimento)}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{c.executivo_conta ?? '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{c.vendedor ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── SERVIÇOS ── */}
              {tab === 'serv' && serv && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi label="Projetos ativos" value={String(serv.projetos_ativos)} sub={`${serv.projetos_total ?? serv.projetos.length} no total`} />
                    <Kpi label="Horas apontadas" value={`${serv.apontamentos.total_horas}h`} sub={`${serv.apontamentos.lancamentos} lançamentos`} />
                    {serv.despesas && <Kpi label="Despesas" value={fmtBRL(serv.despesas.total)} sub={`${serv.despesas.lancamentos} lançamentos`} />}
                    {serv.despesas && <Kpi label="Despesas pendentes" value={fmtBRL(serv.despesas.pendentes)} pending={serv.despesas.pendentes > 0} />}
                  </div>
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Briefcase size={12} /> Projetos</h3>
                    {serv.projetos.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum projeto.</p> : (
                      <div className="space-y-1.5">
                        {serv.projetos.map(p => (
                          <div key={p.id} className="flex items-center gap-2 text-sm">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.ativo ? '#22c55e' : 'var(--text-light)' }} />
                            <span className="flex-1" style={{ color: 'var(--text)' }}>{p.name}</span>
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.status}</span>
                            <span className="text-[11px] tabular-nums w-28 text-right" style={{ color: 'var(--text-muted)' }}>{p.horas_consumidas}h / {p.sold_hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Clock size={12} /> Apontamentos recentes</h3>
                    {serv.apontamentos.recentes.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem apontamentos.</p> : (
                      <div className="space-y-1">
                        {serv.apontamentos.recentes.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-16 tabular-nums shrink-0" style={{ color: 'var(--text-light)' }}>{fmtDate(a.data)}</span>
                            <span className="shrink-0" style={{ color: 'var(--text)' }}>{a.consultor ?? '—'}</span>
                            <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{a.projeto}{a.obs ? ` · ${a.obs}` : ''}</span>
                            <span className="tabular-nums shrink-0" style={{ color: 'var(--text)' }}>{a.horas}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl p-3 flex items-center gap-2 text-xs" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
                    <Package size={14} /> Cronograma e Atividades serão integrados quando entrarem em produção (ponto de integração preparado).
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal — adicionar contato */}
          {showAddContact && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowAddContact(false)}>
              <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Adicionar contato</h2>
                  <button onClick={() => setShowAddContact(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome *</label>
                    <input value={newContact.name} onChange={e => setNewContact(f => ({ ...f, name: e.target.value }))} autoFocus className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Cargo</label>
                    <input value={newContact.cargo} onChange={e => setNewContact(f => ({ ...f, cargo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>E-mail</label>
                      <input value={newContact.email} onChange={e => setNewContact(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Telefone</label>
                      <input value={newContact.phone} onChange={e => setNewContact(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowAddContact(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                  <button onClick={addContact} disabled={savingContact} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{savingContact ? 'Salvando…' : 'Adicionar'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
