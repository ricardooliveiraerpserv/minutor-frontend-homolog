'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Building2, ArrowLeft, Briefcase, Trophy, XCircle, Clock, Package, DollarSign, MessageSquare } from 'lucide-react'

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
interface TimelineItem { when: string | null; source: string; type: string; label: string | null }
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
interface Data360 { header: Header; resumo: Resumo; crm?: Crm; saude?: Saude; adm?: Adm; serv?: Serv; timeline: Timeline }

const fmtBRL = (n: number | null) => n == null ? '—' : (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const STATUS_LABEL: Record<string, string> = { lead: 'Lead', prospect: 'Prospect', cliente: 'Cliente', contrato_ativo: 'Contrato Ativo', em_renovacao: 'Em Renovação', inativo: 'Inativo' }
const srcStyle = (s: string) => s === 'lead' ? { background: 'rgba(56,189,248,0.15)', color: '#38bdf8' } : s === 'crm' ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : s === 'followup' ? { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' } : { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
const srcLabel = (s: string) => s === 'lead' ? 'Lead' : s === 'crm' ? 'CRM' : s === 'followup' ? 'Follow-up' : 'Contrato'
const FU_CAT = ['retorno', 'proposta', 'reclamacao', 'aprovacao', 'sinalizou_renovacao', 'reuniao', 'outro']

function Kpi({ label, value, sub, pending }: { label: string; value: string; sub?: string; pending?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: pending ? 'var(--text-light)' : 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
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
  const [tab, setTab] = useState<'crm' | 'adm' | 'serv' | 'timeline'>('crm')
  const [saudeOpen, setSaudeOpen] = useState(false)
  const [fups, setFups] = useState<{ id: number; categoria: string | null; tipo: string; titulo: string | null; data: string | null; concluida_at: string | null }[]>([])
  const [fuForm, setFuForm] = useState({ categoria: 'retorno', tipo: 'ligacao', titulo: '', data: '' })
  const loadFups = useCallback(() => { api.get<{ data: any[] }>(`/crm/tasks?customer_id=${id}`).then(r => setFups(r?.data ?? [])).catch(() => {}) }, [id])
  const addFup = async () => {
    if (!fuForm.titulo.trim()) { toast.error('Descreva o follow-up'); return }
    try { await api.post('/crm/tasks', { customer_id: id, tipo: fuForm.tipo, categoria: fuForm.categoria, titulo: fuForm.titulo, data: fuForm.data || null }); setFuForm({ categoria: 'retorno', tipo: 'ligacao', titulo: '', data: '' }); loadFups(); toast.success('Follow-up registrado') }
    catch { toast.error('Erro ao registrar') }
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
    api.get<{ data: Data360; permissoes: Permissoes }>(`/customers/${id}/360`)
      .then(r => { setD(r?.data ?? null); setPerms(r?.permissoes ?? null) })
      .catch((e: any) => { if (e?.status === 403) setForbidden(true) })
      .finally(() => setLoading(false))
    loadFups()
  }, [id, loadFups])

  const h = d?.header; const r = d?.resumo; const crm = d?.crm; const adm = d?.adm; const serv = d?.serv
  const comercial = perms?.comercial ?? false

  // Aba inicial = primeira disponível para o perfil.
  useEffect(() => {
    if (d) setTab(d.crm ? 'crm' : d.adm ? 'adm' : d.serv ? 'serv' : 'timeline')
  }, [d])

  return (
    <AppLayout title="Ficha da Empresa">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-xs mb-3" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={13} /> Voltar</button>

      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : forbidden ? <p style={{ color: 'var(--danger-border)' }}>Você não tem acesso à ficha desta empresa.</p>
        : !d ? <p style={{ color: 'var(--text-light)' }}>Empresa não encontrada.</p> : (
        <div className="space-y-5">
          {/* CABEÇALHO */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-start gap-3">
              <Building2 size={22} style={{ color: 'var(--primary)' }} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{h!.name}</h1>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{STATUS_LABEL[h!.crm_status ?? ''] ?? h!.crm_status ?? '—'}</span>
                  {d.saude && (() => { const si = SAUDE_INFO[d.saude.status]; return (
                    <button onClick={() => setSaudeOpen(o => !o)} className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ background: si.bg, color: si.cor }} title="Saúde da conta — clique para detalhes">
                      {si.emoji} {si.l}{d.saude.score > 0 ? ` (${d.saude.score})` : ''}
                    </button>
                  )})()}
                  {h!.segment && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {h!.segment}</span>}
                </div>
                {/* Detalhes da Saúde da Conta (por que está assim) */}
                {saudeOpen && d.saude && (
                  <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: `1px solid ${SAUDE_INFO[d.saude.status].cor}` }}>
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
                    {d.saude.historico.length > 1 && (
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Evolução:</span>
                        {d.saude.historico.map((s, i) => <span key={i} title={`${s.when} · ${s.status} (${s.score})`} className="w-2.5 h-2.5 rounded-full" style={{ background: SAUDE_INFO[s.status]?.cor ?? 'var(--text-light)' }} />)}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 mt-3 text-xs">
                  <div><span style={{ color: 'var(--text-light)' }}>Executivo da Conta: </span><span style={{ color: 'var(--text)' }}>{h!.executivo_conta ?? '—'}</span></div>
                  <div><span style={{ color: 'var(--text-light)' }}>Responsável Comercial: </span><span style={{ color: 'var(--text)' }}>{h!.responsavel_comercial ?? '—'}</span></div>
                  <div><span style={{ color: 'var(--text-light)' }}>Cadastro: </span><span style={{ color: 'var(--text)' }}>{fmtDate(h!.data_cadastro)}</span></div>
                  <div><span style={{ color: 'var(--text-light)' }}>Última interação: </span><span style={{ color: 'var(--text)' }}>{fmtDate(h!.ultima_interacao_at)}</span></div>
                </div>
                {h!.proxima_acao && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                    <Clock size={12} /> Próxima ação: <b style={{ color: 'var(--text)' }}>{h!.proxima_acao.descricao ?? '—'}</b> · {fmtDate(h!.proxima_acao.data)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RESUMO EXECUTIVO */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Resumo executivo</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {comercial && <Kpi label="Oportunidades abertas" value={String(r!.oportunidades_abertas ?? 0)} />}
              {comercial && <Kpi label="Valor em pipeline" value={fmtBRL(r!.valor_pipeline ?? 0)} />}
              <Kpi label="Contratos ativos" value={String(r!.contratos_ativos)} />
              <Kpi label="Projetos ativos" value={String(r!.projetos_ativos)} />
              <Kpi label="Horas contratadas" value={`${r!.horas_contratadas}h`} />
              <Kpi label="Horas consumidas" value={`${r!.horas_consumidas}h`} />
              {adm && <Kpi label={`Receita ${fin?.competencia ?? ''}`} value={fin && fin.recebido != null ? fmtBRL(fin.recebido) : '—'} sub={fin?.financeiro_indisponivel ? 'indisponível' : fin ? 'recebido (Keruak)' : 'calcular na aba Administrativo'} pending={!fin} />}
              {adm && <Kpi label="Rentabilidade" value={fin && fin.margem != null ? `${fin.margem_pct ?? 0}%` : '—'} sub={fin && fin.margem != null ? fmtBRL(fin.margem) : 'aba Administrativo'} pending={!fin} />}
            </div>
          </div>

          {/* ABAS — só as seções permitidas para o perfil (gating no backend) */}
          <div className="flex gap-1">
            {(() => {
              const tabs: [typeof tab, string][] = []
              if (crm) tabs.push(['crm', 'CRM'])
              if (adm) tabs.push(['adm', 'Administrativo'])
              if (serv) tabs.push(['serv', 'Serviços'])
              tabs.push(['timeline', 'Timeline'])
              return tabs.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={tab === k ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{l}</button>
              ))
            })()}
          </div>

          {tab === 'crm' && crm && (
            <div className="space-y-4">
              {/* Relacionamento — Follow-ups (Fase 7) */}
              <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
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
                  <select value={fuForm.categoria} onChange={e => setFuForm(f => ({ ...f, categoria: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>{FU_CAT.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <input value={fuForm.titulo} onChange={e => setFuForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex.: Cliente pediu retorno" className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none min-w-40" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <input type="date" value={fuForm.data} onChange={e => setFuForm(f => ({ ...f, data: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <button onClick={addFup} className="px-2.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Registrar</button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Lead criado" value={fmtDate(crm.lead_created_at)} />
                <Kpi label="Qualificado" value={fmtDate(crm.qualified_at)} />
                <Kpi label="Propostas" value={String(crm.propostas_count)} />
                <Kpi label="Conversões" value={String(crm.conversoes_count)} />
              </div>

              <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Briefcase size={12} /> Oportunidades</h3>
                {crm.oportunidades.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhuma oportunidade.</p> : (
                  <div className="space-y-1.5">
                    {crm.oportunidades.map(o => (
                      <div key={o.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1" style={{ color: 'var(--text)' }}>{o.title}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{o.stage ?? o.status}</span>
                        <span className="text-[11px]" style={{ color: o.status === 'ganho' ? '#22c55e' : o.status === 'perdido' ? 'var(--danger-border)' : 'var(--text-light)' }}>{o.status}</span>
                        <span className="tabular-nums font-semibold w-24 text-right" style={{ color: 'var(--text)' }}>{fmtBRL(o.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Package size={12} /> Produtos de interesse</h3>
                  {crm.produtos_interesse.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>—</p> : (
                    <div className="flex flex-wrap gap-1.5">{crm.produtos_interesse.map((p, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{p.name}</span>)}</div>
                  )}
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><XCircle size={12} /> Perdas</h3>
                  {crm.perdas.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhuma.</p> : (
                    <div className="space-y-1">{crm.perdas.map((p, i) => <div key={i} className="text-xs flex justify-between"><span style={{ color: 'var(--text-muted)' }}>{p.title}</span><span style={{ color: 'var(--danger-border)' }}>{p.motivo ?? '—'}</span></div>)}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'adm' && adm && (
            <div className="space-y-4">
              {/* Banco de Horas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Contratos ativos" value={String(adm.contratos_ativos)} />
                <Kpi label="BH contratadas" value={`${adm.banco_horas.contratadas}h`} />
                <Kpi label="BH consumidas" value={`${adm.banco_horas.consumidas}h`} />
                <Kpi label="BH saldo" value={`${adm.banco_horas.saldo}h`} pending={adm.banco_horas.saldo < 0} />
              </div>

              {/* Financeiro sob demanda (Receita / Rentabilidade) */}
              <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><DollarSign size={12} /> Receita & Rentabilidade (Rentabilidade × Keruak)</h3>
                  <div className="flex items-center gap-2">
                    <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
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

              {/* Contratos */}
              <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
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

          {tab === 'serv' && serv && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Projetos ativos" value={String(serv.projetos_ativos)} sub={`${serv.projetos_total ?? serv.projetos.length} no total`} />
                <Kpi label="Horas apontadas" value={`${serv.apontamentos.total_horas}h`} sub={`${serv.apontamentos.lancamentos} lançamentos`} />
                {serv.despesas && <Kpi label="Despesas" value={fmtBRL(serv.despesas.total)} sub={`${serv.despesas.lancamentos} lançamentos`} />}
                {serv.despesas && <Kpi label="Despesas pendentes" value={fmtBRL(serv.despesas.pendentes)} pending={serv.despesas.pendentes > 0} />}
              </div>

              {/* Projetos */}
              <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
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

              {/* Apontamentos recentes */}
              <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
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

              {/* Pontos de integração (Cronograma / Atividades) */}
              <div className="rounded-xl p-3 flex items-center gap-2 text-xs" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
                <Package size={14} /> Cronograma e Atividades serão integrados quando entrarem em produção (ponto de integração preparado).
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Trophy size={12} /> Timeline única <span className="font-normal normal-case" style={{ color: 'var(--text-light)' }}>({d.timeline.total} eventos)</span></h3>
              {d.timeline.eventos.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem eventos.</p> : (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {d.timeline.eventos.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 w-16 tabular-nums" style={{ color: 'var(--text-light)' }}>{fmtDate(t.when)}</span>
                      <span className="mt-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0" style={srcStyle(t.source)}>{srcLabel(t.source)}</span>
                      <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{t.type}{t.label ? ` · ${t.label}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pontos de integração futuros (Fases B/C) */}
          <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Pontos de integração preparados (não implementados): Cronograma e Atividades — entram quando estiverem em produção.</p>
        </div>
      )}
    </AppLayout>
  )
}
