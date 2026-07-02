'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { BarChart2, AlertTriangle, UserPlus } from 'lucide-react'

interface Summary {
  abertas_count: number; abertas_valor: number
  ganhas_count: number; ganhas_valor: number; perdidas_count: number
  empresas_por_status: Record<string, number>
  sem_proxima_acao: number; proxima_acao_vencida: number
  sem_interacao_7: number; sem_interacao_15: number; sem_interacao_30: number
  perdas_por_motivo: { motivo: string; qtd: number; valor: number }[]
  perdas_por_executivo: { executivo: string; qtd: number }[]
  perdas_por_produto: { produto: string; qtd: number }[]
  tempo_medio_fechamento_dias: number
  por_responsavel: { responsavel: string; abertas: number; valor_aberto: number; valor_ganho: number }[]
  por_segmento: { segment: string; valor: number }[]
  por_produto: { produto: string; valor: number }[]
  por_categoria: { categoria: string; valor: number }[]
  forecast_por_etapa: { etapa: string; qtd: number; valor: number }[]
}

interface Renovacoes {
  contratos_proximos_vencimento: number; renovacoes_abertas: number
  renovacoes_ganhas: number; renovacoes_perdidas: number; valor_em_renovacao: number
}

interface RiscoRenovacao {
  buckets: { vencido: number; vence_30: number; vence_60: number; vence_90: number }
  risco: { baixo: number; medio: number; alto: number; critico: number }
  contratos: { contract_id: number; projeto: string; cliente: string | null; customer_id: number; data_vencimento: string | null; dias: number; valor: number; utilizacao_pct: number; dias_sem_interacao: number | null; saude: string | null; score: number; risco: string }[]
}

interface Relacionamento {
  resumo: { sem_interacao_15: number; sem_interacao_30: number; sem_interacao_60: number; sem_interacao_90: number; sem_proxima_acao: number; total_comercial: number }
  clientes: { customer_id: number; name: string; executivo: string | null; dias_sem_interacao: number | null; tem_proxima_acao: boolean }[]
}

interface OrigemRow {
  origem: string; leads: number; qualificados: number; oportunidades: number; ganhas: number; contratos: number
  receita: number; ticket_medio: number; conversao_lead_contrato: number; tempo_medio_fechamento_dias: number
}

interface FunilData {
  etapas: { etapa: string; qtd: number }[]
  contagens: Record<string, number>
  conversoes: { lead_prospect: number; prospect_oportunidade: number; oportunidade_proposta: number; proposta_contrato: number }
  tempo_medio_dias: { lead_prospect: number; prospect_oportunidade: number; oportunidade_contrato: number }
}

interface LeadsSummary {
  leads_criados: number; leads_qualificados: number; leads_perdidos: number
  taxa_conversao: number; tempo_medio_qualificacao_dias: number
  sem_proxima_acao: number; sem_atividade: number
  por_origem: { origem: string; leads: number; qualificados: number; conversao: number; receita: number }[]
}

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'

function Card({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: danger ? 'var(--danger-border)' : 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function MiniTable({ title, rows }: { title: string; rows: { label: string; value: string; extra?: string }[] }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>{title}</h3>
      <div className="space-y-1.5">
        {rows.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem dados.</p>
          : rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>{r.label}{r.extra && <span className="text-[10px] ml-1" style={{ color: 'var(--text-light)' }}>{r.extra}</span>}</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{r.value}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export default function CrmDashboardsPage() {
  const [s, setS] = useState<Summary | null>(null)
  const [ld, setLd] = useState<LeadsSummary | null>(null)
  const [fn, setFn] = useState<FunilData | null>(null)
  const [rv, setRv] = useState<Renovacoes | null>(null)
  const [origem, setOrigem] = useState<OrigemRow[]>([])
  const [rel, setRel] = useState<Relacionamento | null>(null)
  const [risco, setRisco] = useState<RiscoRenovacao | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([
      api.get<{ data: Summary }>('/crm/dashboard/summary').then(r => setS(r?.data ?? null)).catch(() => {}),
      api.get<{ data: LeadsSummary }>('/crm/dashboard/leads').then(r => setLd(r?.data ?? null)).catch(() => {}),
      api.get<{ data: FunilData }>('/crm/dashboard/funil').then(r => setFn(r?.data ?? null)).catch(() => {}),
      api.get<{ data: Renovacoes }>('/crm/dashboard/renovacoes').then(r => setRv(r?.data ?? null)).catch(() => {}),
      api.get<{ data: OrigemRow[] }>('/crm/dashboard/origem').then(r => setOrigem(r?.data ?? [])).catch(() => {}),
      api.get<{ data: Relacionamento }>('/crm/dashboard/relacionamento').then(r => setRel(r?.data ?? null)).catch(() => {}),
      api.get<{ data: RiscoRenovacao }>('/crm/dashboard/risco-renovacao').then(r => setRisco(r?.data ?? null)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])
  const RISCO_COR: Record<string, string> = { critico: 'var(--danger-border)', alto: '#f59e0b', medio: '#eab308', baixo: '#22c55e' }

  return (
    <AppLayout title="Dashboards (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Painel comercial</h1>
      </div>

      {/* ── Risco de Renovação (Fase 5) ── */}
      {risco && (risco.contratos.length > 0 || Object.values(risco.buckets).some(v => v > 0)) && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Risco de renovação</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Card label="Vence em 90d" value={String(risco.buckets.vence_90)} />
            <Card label="Vence em 60d" value={String(risco.buckets.vence_60)} />
            <Card label="Vence em 30d" value={String(risco.buckets.vence_30)} danger={risco.buckets.vence_30 > 0} />
            <Card label="Vencido" value={String(risco.buckets.vencido)} danger={risco.buckets.vencido > 0} />
          </div>
          <div className="flex gap-2 mb-3 flex-wrap">
            {(['critico', 'alto', 'medio', 'baixo'] as const).map(k => (
              <span key={k} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--surface-sunken)', color: RISCO_COR[k] }}>{k}: {risco.risco[k]}</span>
            ))}
          </div>
          <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr style={{ color: 'var(--text-light)' }}>
                {['Risco', 'Cliente', 'Contrato', 'Vencimento', 'Dias', 'Utilização', 'Saúde', 'Score'].map((h, i) => <th key={h} className={`px-3 py-2 text-[11px] font-semibold ${i > 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {risco.contratos.map(c => (
                  <tr key={c.contract_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2"><span className="text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase" style={{ background: 'var(--surface-sunken)', color: RISCO_COR[c.risco] }}>{c.risco}</span></td>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{c.cliente}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{c.projeto}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-light)' }}>{fmtDate(c.data_vencimento)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.dias < 0 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{c.dias < 0 ? `${-c.dias}d vencido` : `${c.dias}d`}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.utilizacao_pct > 90 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{c.utilizacao_pct}%</td>
                    <td className="px-3 py-2 text-right">{c.saude ? <span style={{ color: c.saude === 'critico' ? 'var(--danger-border)' : c.saude === 'atencao' ? '#f59e0b' : '#22c55e' }}>{c.saude}</span> : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{c.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Relacionamento comercial (Fase 3) ── */}
      {rel && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Relacionamento comercial <span className="font-normal normal-case" style={{ color: 'var(--text-light)' }}>({rel.resumo.total_comercial} clientes)</span></h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <Card label="Sem interação 15d+" value={String(rel.resumo.sem_interacao_15)} danger={rel.resumo.sem_interacao_15 > 0} />
            <Card label="Sem interação 30d+" value={String(rel.resumo.sem_interacao_30)} danger={rel.resumo.sem_interacao_30 > 0} />
            <Card label="Sem interação 60d+" value={String(rel.resumo.sem_interacao_60)} danger={rel.resumo.sem_interacao_60 > 0} />
            <Card label="Sem interação 90d+" value={String(rel.resumo.sem_interacao_90)} danger={rel.resumo.sem_interacao_90 > 0} />
            <Card label="Sem próxima ação" value={String(rel.resumo.sem_proxima_acao)} danger={rel.resumo.sem_proxima_acao > 0} />
          </div>
          <MiniTable title="Clientes esquecidos (maior tempo sem interação)" rows={rel.clientes.slice(0, 8).map(c => ({ label: c.name, value: c.dias_sem_interacao != null ? `${c.dias_sem_interacao}d` : '—', extra: c.executivo ?? '' }))} />
        </div>
      )}

      {/* ── Origem real da receita (Fase 6) ── */}
      {origem.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Origem real da receita</h2>
          <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr style={{ color: 'var(--text-light)' }}>
                {['Origem', 'Leads', 'Oport.', 'Ganhas', 'Contratos', 'Receita', 'Ticket médio', 'Conv. Lead→Contrato', 'Tempo fech.'].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[11px] font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {origem.filter(o => o.leads > 0 || o.oportunidades > 0 || o.receita > 0).map((o, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{o.origem}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.oportunidades}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.ganhas}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.contratos}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(o.receita)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(o.ticket_medio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: o.conversao_lead_contrato >= 20 ? '#22c55e' : o.conversao_lead_contrato > 0 ? '#f59e0b' : 'var(--text-light)' }}>{o.conversao_lead_contrato}%</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-light)' }}>{o.tempo_medio_fechamento_dias ? `${o.tempo_medio_fechamento_dias}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Funil de conversão (Lead → Contrato) ── */}
      {fn && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Funil de conversão</h2>
          </div>
          {(() => {
            const max = Math.max(1, ...fn.etapas.map(e => e.qtd))
            const conv: Record<string, number> = {
              Prospects: fn.conversoes.lead_prospect, Oportunidades: fn.conversoes.prospect_oportunidade,
              Propostas: fn.conversoes.oportunidade_proposta, Contratos: fn.conversoes.proposta_contrato,
            }
            return (
              <div className="rounded-xl p-4 mb-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {fn.etapas.map((e, i) => (
                  <div key={e.etapa} className="flex items-center gap-3">
                    <span className="w-28 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{e.etapa}</span>
                    <div className="flex-1 rounded-full h-6 relative overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                      <div className="h-full rounded-full flex items-center px-2" style={{ width: `${Math.max(6, e.qtd / max * 100)}%`, background: 'var(--primary)' }}>
                        <span className="text-[11px] font-bold" style={{ color: 'var(--primary-fg)' }}>{e.qtd}</span>
                      </div>
                    </div>
                    <span className="w-16 text-right text-[11px] tabular-nums shrink-0" style={{ color: 'var(--text-light)' }}>{conv[e.etapa] != null ? `↓ ${conv[e.etapa]}%` : ''}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Card label="Lead → Prospect" value={`${fn.conversoes.lead_prospect}%`} sub={`${fn.tempo_medio_dias.lead_prospect}d em média`} />
            <Card label="Prospect → Oportunidade" value={`${fn.conversoes.prospect_oportunidade}%`} sub={`${fn.tempo_medio_dias.prospect_oportunidade}d em média`} />
            <Card label="Oportunidade → Proposta" value={`${fn.conversoes.oportunidade_proposta}%`} />
            <Card label="Proposta → Contrato" value={`${fn.conversoes.proposta_contrato}%`} sub={`Opp → Contrato ${fn.tempo_medio_dias.oportunidade_contrato}d`} />
          </div>
        </div>
      )}

      {/* ── Renovações (Item 5) ── */}
      {rv && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Renovações</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card label="Próximos do vencimento" value={String(rv.contratos_proximos_vencimento)} sub="≤ 90 dias" />
            <Card label="Renovações abertas" value={String(rv.renovacoes_abertas)} />
            <Card label="Em renovação (R$)" value={fmtBRL(rv.valor_em_renovacao)} />
            <Card label="Ganhas" value={String(rv.renovacoes_ganhas)} />
            <Card label="Perdidas" value={String(rv.renovacoes_perdidas)} />
          </div>
        </div>
      )}

      {/* ── Camada de Leads (captação + qualificação) ── */}
      {ld && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={15} style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Leads</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
            <Card label="Criados" value={String(ld.leads_criados)} />
            <Card label="Qualificados" value={String(ld.leads_qualificados)} />
            <Card label="Perdidos" value={String(ld.leads_perdidos)} />
            <Card label="Taxa conversão" value={`${ld.taxa_conversao}%`} />
            <Card label="Tempo médio qualif." value={`${ld.tempo_medio_qualificacao_dias}d`} />
            <Card label="Sem próx. ação" value={String(ld.sem_proxima_acao)} danger={ld.sem_proxima_acao > 0} />
            <Card label="Sem atividade" value={String(ld.sem_atividade)} danger={ld.sem_atividade > 0} />
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>Indicadores por origem</h3>
            {ld.por_origem.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem dados.</p> : (
              <table className="w-full text-sm">
                <thead><tr style={{ color: 'var(--text-light)' }}>
                  <th className="text-left font-semibold text-[11px] pb-1.5">Origem</th>
                  <th className="text-right font-semibold text-[11px] pb-1.5">Leads</th>
                  <th className="text-right font-semibold text-[11px] pb-1.5">Qualif.</th>
                  <th className="text-right font-semibold text-[11px] pb-1.5">Conversão</th>
                  <th className="text-right font-semibold text-[11px] pb-1.5">Receita gerada</th>
                </tr></thead>
                <tbody>
                  {ld.por_origem.filter(o => o.leads > 0 || o.receita > 0).map((o, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-1.5" style={{ color: 'var(--text)' }}>{o.origem}</td>
                      <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.leads}</td>
                      <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.qualificados}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: o.conversao >= 30 ? '#22c55e' : o.conversao > 0 ? '#f59e0b' : 'var(--text-light)' }}>{o.conversao}%</td>
                      <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(o.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Empresas por status (empresa única — customers.crm_status) */}
      {s?.empresas_por_status && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Empresas por status</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([['lead', 'Leads'], ['prospect', 'Prospects'], ['cliente', 'Clientes'], ['em_renovacao', 'Em Renovação']] as const).map(([k, l]) => (
              <Card key={k} label={l} value={String(s.empresas_por_status[k] ?? 0)} />
            ))}
          </div>
        </div>
      )}

      {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : !s ? <p style={{ color: 'var(--text-light)' }}>Sem dados de oportunidades.</p> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Pipeline aberto" value={fmtBRL(s.abertas_valor)} sub={`${s.abertas_count} oportunidades`} />
            <Card label="Ganhas" value={fmtBRL(s.ganhas_valor)} sub={`${s.ganhas_count} negócios`} />
            <Card label="Perdidas" value={String(s.perdidas_count)} />
            <Card label="Sem próxima ação" value={String(s.sem_proxima_acao)} danger={s.sem_proxima_acao > 0} sub="oportunidades abertas" />
          </div>

          {/* Item 1 — saúde do acompanhamento */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Acompanhamento (abertas)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="Próxima ação vencida" value={String(s.proxima_acao_vencida)} danger={s.proxima_acao_vencida > 0} />
              <Card label="Sem interação 7d+" value={String(s.sem_interacao_7)} danger={s.sem_interacao_7 > 0} />
              <Card label="Sem interação 15d+" value={String(s.sem_interacao_15)} danger={s.sem_interacao_15 > 0} />
              <Card label="Sem interação 30d+" value={String(s.sem_interacao_30)} danger={s.sem_interacao_30 > 0} />
            </div>
          </div>

          {/* Item 2 — análise de perdas */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Perdas</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <MiniTable title="Por motivo" rows={(s.perdas_por_motivo ?? []).map(r => ({ label: r.motivo, value: String(r.qtd), extra: fmtBRL(r.valor) }))} />
              <MiniTable title="Por executivo" rows={(s.perdas_por_executivo ?? []).map(r => ({ label: r.executivo, value: String(r.qtd) }))} />
              <MiniTable title="Por produto" rows={(s.perdas_por_produto ?? []).map(r => ({ label: r.produto, value: String(r.qtd) }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card label="Tempo médio até fechamento" value={`${s.tempo_medio_fechamento_dias} dias`} />
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {s.sem_proxima_acao > 0 && <AlertTriangle size={20} style={{ color: 'var(--warning-border)' }} />}
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.sem_proxima_acao > 0 ? `${s.sem_proxima_acao} oportunidade(s) sem próxima ação — defina o próximo passo.` : 'Todas as oportunidades têm próxima ação. 👍'}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniTable title="Pipeline por executivo" rows={s.por_responsavel.map(r => ({ label: r.responsavel, value: fmtBRL(r.valor_aberto), extra: `${r.abertas} ab.` }))} />
            <MiniTable title="Forecast por etapa (aberto)" rows={s.forecast_por_etapa.map(r => ({ label: r.etapa, value: fmtBRL(r.valor), extra: `${r.qtd}` }))} />
            <MiniTable title="Receita ganha por segmento" rows={s.por_segmento.map(r => ({ label: r.segment, value: fmtBRL(r.valor) }))} />
            <MiniTable title="Receita ganha por produto" rows={s.por_produto.map(r => ({ label: r.produto, value: fmtBRL(r.valor) }))} />
            <MiniTable title="Receita ganha por categoria" rows={(s.por_categoria ?? []).map(r => ({ label: r.categoria, value: fmtBRL(r.valor) }))} />
            <MiniTable title="Receita ganha por vendedor" rows={s.por_responsavel.filter(r => r.valor_ganho > 0).map(r => ({ label: r.responsavel, value: fmtBRL(r.valor_ganho) }))} />
          </div>
        </div>
      )}
    </AppLayout>
  )
}
