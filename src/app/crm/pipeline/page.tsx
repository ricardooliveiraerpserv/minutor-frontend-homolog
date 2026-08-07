'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { OportunidadeDetalhe } from '@/components/crm/oportunidade-detalhe'
import { CustomFieldsSection } from '@/components/crm/custom-fields-section'
import { LeadsBoard } from '@/components/crm/leads-board'
import { toast } from 'sonner'
import { Plus, X, Clock, AlertTriangle, Check, UserPlus, FileDown, Trash2, Pencil, ChevronDown, Star } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

interface Stage { id: number; name: string; is_won: boolean; is_lost: boolean; cor?: string | null; is_inicial?: boolean; requer_qualificacao?: boolean }
interface Pipeline { id: number; name: string; code: string; tipo?: string; tipos_empresa?: string[] | null; stages: Stage[] }
interface Opp {
  id: number; title: string; valor: number; status: string; stage_id: number
  customer?: { id: number; name: string } | null
  responsavel?: { id: number; name: string } | null
  sem_proxima_acao?: boolean; proxima_acao_at?: string | null; proxima_acao?: string | null; proxima_acao_vencida?: boolean
  proxima_tarefa?: { tipo: string; titulo?: string | null; data?: string | null } | null
  qualificacao?: string | null
  proposta?: { codigo?: string | null; versao?: number; tipo?: string | null; status: string; total: number } | null
  saude?: { status: string; diagnostico?: string } | null
  valor_ponderado?: number; probabilidade?: number
  contract_id?: number | null
}
interface Column { stage: Stage; opportunities: Opp[]; total_valor: number; count: number
  forecast?: number; tempo_medio_dias?: number; vencidos?: number; sem_proxima_acao?: number; parados?: number }
interface Customer { id: number; name: string; crm_status?: string }
interface Source { id: number; name: string; active?: boolean }
interface CrmUser { id: number; name: string }
interface Contact { id: number; name: string }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Mapeia o tipo da proposta p/ o ID do tipo de contrato cadastrado (match por nome).
function matchCType(ctypes: any[], tipo: string): string {
  const want: Record<string, string> = { bh_fixo: 'fixo', bh_mensal: 'mensal', on_demand: 'demand', projeto_fechado: 'fechad', cloud: 'cloud' }
  const w = want[tipo]; if (!w) return ''
  const m = (ctypes || []).find(c => (c?.name || '').toLowerCase().includes(w))
  return m ? String(m.id) : ''
}
function scopeText(conteudo: any, defaults?: any): string {
  const esc = conteudo?.escopo ?? {}
  const def = defaults?.escopo ?? {}
  const parts: string[] = []
  const objetivo = String(esc.objetivo ?? '').trim()
  if (objetivo) parts.push('OBJETIVO: ' + objetivo)
  const blocks = esc.blocks
  if (Array.isArray(blocks) && blocks.length) {
    const body = blocks.filter((b: any) => b.tipo === 'texto' || b.tipo === 'titulo').map((b: any) => b.conteudo).filter(Boolean).join('\n')
    if (body.trim()) parts.push(body)
  } else {
    // sem blocos próprios → usa o override OU o texto-padrão do deck (defaults), igual ao render da proposta.
    const funcional = String(esc.escopo_funcional ?? def.escopo_funcional ?? '').trim()
    if (funcional) parts.push(funcional)
  }
  return parts.join('\n\n')
}
// Extrai o valor numérico (R$) de um texto de despesa da proposta (ex.: "Será cobrado R$170,00 por visita").
function parseBRL(text: string): number {
  const m = String(text || '').match(/R\$\s?([\d.]*,?\d+)/)
  return m ? (Number(m[1].replace(/\./g, '').replace(',', '.')) || 0) : 0
}
// Monta o pré-preenchimento do Novo Contrato a partir da oportunidade GANHA + sua proposta mais recente.
// Faturamento de uma memória de cálculo (espelha CrmProposalCalcService::compute, modo por_hora) — p/ derivar
// o valor de cada linha de investimento do Cloud ao gerar os contratos.
function memFat(m: any): number {
  if (!m) return 0
  const pr = m.params || {}
  const num = (v: any, def: number) => (v !== undefined && v !== '' ? Number(v) || 0 : def)
  const pc = num(pr.pct_coordenacao, 0.20)
  const pm = num(pr.pct_margem, 0)
  const h = Number(m.horas_consultoria) || 0
  const vh = Number(m.venda_h ?? m.valor_hora_cliente) || 0
  const coord = Math.ceil(h * pc)
  const fatBase = h * vh + coord * vh
  return fatBase + fatBase * pm
}

// Tipo de Serviço cujo nome indica sustentação (Cloud/Bizify/Sustentação) → categoria 'sustentacao'.
function categoriaDoServiceType(stypes: any[], serviceTypeId: any): 'projeto' | 'sustentacao' {
  const nm = (stypes.find(s => String(s?.id) === String(serviceTypeId))?.name || '').toLowerCase()
  return /cloud|bizify|sustenta/.test(nm) ? 'sustentacao' : 'projeto'
}
// tipo_faturamento do contrato a partir do nome do Tipo de Contrato (cadastro contract_types).
function tipoFatDoContractType(ctypes: any[], contractTypeId: any): string | undefined {
  const nm = (ctypes.find(c => String(c?.id) === String(contractTypeId))?.name || '').toLowerCase()
  if (/on.?demand/.test(nm)) return 'on_demand'
  if (/mensal/.test(nm)) return 'banco_horas_mensal'
  if (/fixo/.test(nm)) return 'banco_horas_fixo'
  if (/saas|cloud/.test(nm)) return 'saas'
  if (/fechad|projeto|servi/.test(nm)) return 'por_servico'
  return undefined
}

// Reusado pelo board (ao marcar GANHO) e pelo drawer (botão "Gerar contrato").
export async function buildWonPrefill(opp: { id: number; title?: string; valor?: number | null; customer?: { id: number } | null; responsavel?: { id: number } | null; responsavel_id?: number | null }): Promise<{ prefill: any; prefillContacts: any[] }> {
  const cid = opp.customer?.id
  const respId = opp.responsavel?.id ?? opp.responsavel_id ?? null
  const prefill: any = {
    customer_id: cid ? String(cid) : '',
    project_name: opp.title ?? '',
    categoria: 'projeto',
    valor_projeto: opp.valor != null ? String(opp.valor) : '',
    vendedor_id: respId ? String(respId) : '',
  }
  let prefillContacts: any[] = []
  try {
    const [propsList, ctypes, stypes, contacts] = await Promise.all([
      api.get<{ data: any[] }>(`/crm/proposals?opportunity_id=${opp.id}`).then(r => r?.data ?? []).catch(() => []),
      api.get<any>('/contract-types?pageSize=100').then(r => r?.items ?? r?.data ?? r ?? []).catch(() => []),
      api.get<any>('/service-types?pageSize=100').then(r => r?.items ?? r?.data ?? r ?? []).catch(() => []),
      cid ? api.get<any>(`/customer-contacts?customer_id=${cid}`).then(r => (Array.isArray(r) ? r : r?.data ?? [])).catch(() => []) : Promise.resolve([]),
    ])
    prefillContacts = (contacts as any[]).map(c => ({ name: c.name, cargo: c.cargo ?? '', email: c.email ?? '', phone: c.phone ?? '' }))
    const latest = (propsList as any[])[0]
    if (latest?.id) {
      const det = await api.get<{ data: any }>(`/crm/proposals/${latest.id}`).then(r => r?.data).catch(() => null)
      if (det) {
        const tipo = det.tipo
        const inputs = det.inputs ?? {}
        const conteudo = det.conteudo ?? {}
        let horas = Number(inputs.horas_consultoria ?? 0)
        let vh = Number(inputs.valor_hora_cliente ?? inputs.venda_h ?? 0)
        const total = Number(det.total ?? det.valor ?? horas * vh) || 0
        // Projeto fechado às vezes é salvo só com o VALOR (sem horas/valor-hora explícitos). Para que o
        // contrato nasça com "Horas Contratadas" (= horas vendidas) preenchidas, derivamos o que faltar:
        // horas = total ÷ valor/hora; ou valor/hora = total ÷ horas. (on_demand não tem horas vendidas.)
        if (tipo === 'projeto_fechado') {
          if (!horas && vh > 0 && total > 0) horas = Math.round(total / vh)
          if (!vh && horas > 0 && total > 0) vh = total / horas
        }
        const inv = conteudo.investimento ?? {}
        const meta = conteudo.contrato ?? {}
        // Tipo de Contrato / Serviço: usa o DEFINIDO na proposta (garante 100%); fallback por nome.
        // Tipo de Contrato vem do TIPO DA PROPOSTA (Identificação). No Cloud, cada linha sobrescreve por card.
        prefill.contract_type_id = matchCType(ctypes as any[], tipo)
        const stProjeto = (stypes as any[]).find(s => (s?.name || '').toLowerCase().includes('projeto'))
        prefill.service_type_id = meta.service_type_id ? String(meta.service_type_id) : (stProjeto ? String(stProjeto.id) : '')
        // on_demand não tem horas vendidas (é por demanda); demais (incl. projeto_fechado, que agora usa
        // memória por hora) trazem as horas vendidas da proposta → vira "Horas Contratadas" no contrato.
        prefill.horas_contratadas = tipo === 'on_demand' ? '0' : String(horas || '')
        prefill.valor_hora = vh ? String(vh) : ''
        prefill.valor_projeto = tipo === 'projeto_fechado'
          ? String(Number(inputs.valor_projeto ?? inputs.valor_fixo ?? total) || '')
          : tipo === 'on_demand' ? String(total || '') : (total ? String(total) : prefill.valor_projeto)
        // Despesa do contrato: seletor da proposta (sp/fora/nenhum). Fallback p/ chave antiga (despesas_sp_contrato).
        const despSel = meta.despesa ?? (inv.despesas_sp_on !== false && inv.despesas_sp_contrato !== false ? 'sp' : 'nenhum')
        if (despSel === 'nenhum') {
          prefill.cobra_despesa_cliente = false
        } else {
          prefill.cobra_despesa_cliente = true
          const dtxt = despSel === 'fora' ? (inv.despesas_fora ?? det.defaults?.investimento?.despesas_fora) : (inv.despesas_sp ?? det.defaults?.investimento?.despesas_sp)
          const dval = parseBRL(String(dtxt ?? ''))
          if (dval) prefill.limite_despesa = String(dval)
        }
        const esc = scopeText(conteudo, det.defaults)
        if (esc) prefill.observacoes = esc
        // Condição de Pagamento = junção da tabela de Prazo (Parcelas + Valor % + Vencimento).
        // Só p/ tipos que têm a tabela de parcelas (BH Fixo / Projeto Fechado). Usa override OU default.
        if (tipo === 'bh_fixo' || tipo === 'projeto_fechado') {
          const prazo = { ...(det.defaults?.prazo ?? {}), ...(conteudo.prazo ?? {}) }
          const head = [prazo.parcelas, prazo.valor_pct].map((s: any) => (s ? String(s).trim() : '')).filter(Boolean).join(' — ')
          const venc = prazo.vencimento ? `Vencimento: ${String(prazo.vencimento).trim()}` : ''
          const cond = [head, venc].filter(Boolean).join('. ')
          if (cond) prefill.condicao_pagamento = cond.endsWith('.') ? cond : cond + '.'
        }
        // CLOUD multi-tipo: cada linha do Investimento Mensal vira UM card (serviceType + valor próprio);
        // o Investimento Único, se > 0, gera mais um card. Todos idênticos no resto (cliente/contatos/escopo).
        if (tipo === 'cloud') {
          const cloud = conteudo.cloud ?? {}
          // Cloud é SUSTENTAÇÃO (não Projeto) — senão o Tipo de Contrato "Cloud/SaaS" fica bloqueado e cai em
          // "Banco de Horas Fixo". Usa o service_type da proposta se houver; senão, o de Sustentação.
          const stSust = (stypes as any[]).find(s => /sustenta/.test((s?.name || '').toLowerCase()))
          if (!meta.service_type_id && stSust) prefill.service_type_id = String(stSust.id)
          // categoria/serviceType ficam do compartilhado (proposta); cada card varia o TIPO DE CONTRATO + valor.
          prefill.categoria = categoriaDoServiceType(stypes as any[], prefill.service_type_id)
          // NUMERAÇÃO: 1 proposta Cloud → N contratos compartilhando o CÓDIGO PRINCIPAL da proposta + letra
          // (-a, -b, -c…). Letra (≠ -NN numérico de subprojeto) mantém o vínculo sem virar subprojeto.
          if (det.codigo) { prefill._cloudBaseCode = det.codigo; prefill.project_code_preview = det.codigo }
          // Faturamento da linha: por hora (memFat) OU, p/ Cloud/SaaS (valor fixo), o campo "valor".
          const lineFat = (d: any) => { const f = memFat(d?.memoria); return f > 0 ? f : (Number(d?.valor) || 0) }
          const mkCard = (d: any, label: string) => {
            const ctId = d.contract_type_id ? String(d.contract_type_id) : prefill.contract_type_id
            const tf = tipoFatDoContractType(ctypes as any[], ctId)
            return {
              label, contract_type_id: ctId, ...(tf ? { tipo_faturamento: tf } : {}),
              valor_projeto: String((lineFat(d) - (Number(d.desconto?.valor) || 0)).toFixed(2)),
              valor_hora: d.memoria?.venda_h ? String(Number(d.memoria.venda_h)) : '',
              horas_contratadas: String(Math.round(Number(d.memoria?.horas_consultoria) || 0)),
            }
          }
          const cards: any[] = []
          const linhas = Array.isArray(cloud.investimento?.linhas) ? cloud.investimento.linhas : []
          for (const ln of linhas) {
            const val = lineFat(ln) - (Number(ln.desconto?.valor) || 0)
            if (val <= 0 && !ln.contract_type_id) continue
            cards.push(mkCard(ln, ln.label || 'CLOUD'))
          }
          const un = cloud.investimento_unico ?? {}
          if (lineFat(un) - (Number(un.desconto?.valor) || 0) > 0) {
            cards.push(mkCard(un, (un.label || 'Investimento único') + ' (one-time)'))
          }
          if (cards.length) prefill._cards = cards
        }
        // SUBPROJETO: vincula ao projeto pai → contrato nasce em Início Autorizado + card de aporte no pai
        // (obrigatório quando o filho nasce via CRM). O código já vem com -NN em det.codigo.
        if (meta.is_subproject && meta.parent_project_id) {
          prefill.is_subproject = true
          prefill.parent_project_id = String(meta.parent_project_id)
          prefill.sera_faturado = true
          if (det.codigo) prefill.project_code_preview = det.codigo
        }
      }
    }
  } catch { /* o prefill mínimo (cliente/nome/valor) já basta */ }
  return { prefill, prefillContacts }
}

// CLOUD multi-tipo: gera UM contrato por card (Mensal por linha + Único se > 0), idênticos no resto, variando
// só Tipo de Serviço e valor. A oportunidade é vinculada só no 1º (idempotente, igual ao fluxo normal).
// Retorna true se TRATOU o caso (≥2 cards) — aí o chamador NÃO abre o modal de 1 contrato.
export async function criarCardsCloud(oppId: number, prefill: any, prefillContacts: any[], onDone?: () => void): Promise<boolean> {
  const cards: any[] = prefill?._cards
  if (!Array.isArray(cards) || cards.length < 2) return false
  const fmt = (v: any) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Código principal da proposta (ex.: SPL001-26) → cada contrato recebe sufixo de letra (-a, -b, -c…).
  const baseCode: string = prefill?._cloudBaseCode || ''
  const codeFor = (i: number) => baseCode ? `${baseCode}-${String.fromCharCode(97 + i)}` : undefined
  const resumo = cards.map((c, i) => `• ${codeFor(i) ? codeFor(i) + '  ' : ''}${c.label}: R$ ${fmt(c.valor_projeto)}`).join('\n')
  if (!window.confirm(`Serão gerados ${cards.length} contratos no Kanban (mesmo código principal${baseCode ? ` ${baseCode}` : ''}, variando a letra/tipo/valor):\n\n${resumo}`)) return true
  const base = { ...prefill }; delete base._cards; delete base._cloudBaseCode; delete base.project_code_preview
  let ok = 0
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const payload: any = { ...base, ...c, project_name: `${(base.project_name || '').trim()} — ${c.label}`.trim(), contacts: prefillContacts }
    const code = codeFor(i); if (code) payload.project_code_preview = code
    delete payload._cards; delete payload.label; delete payload._cloudBaseCode
    if (i === 0) payload.opportunity_id = oppId
    try { await api.post('/contracts', payload); ok++ } catch (e: any) { toast.error(`Falha no card "${c.label}": ${e?.message ?? 'erro'}`) }
  }
  if (ok) toast.success(`${ok} contrato(s) gerado(s) no Kanban de Contratos.`)
  onDone?.()
  return true
}

// SUBPROJETO: gera direto (sem o modal) p/ garantir o fluxo do filho — nasce em "Início Autorizado" e, se
// "será faturado", cria o card de aporte no projeto pai. O modal padrão não envia sera_faturado, por isso direto.
export async function criarSubprojeto(oppId: number, prefill: any, prefillContacts: any[], onDone?: () => void): Promise<boolean> {
  if (!prefill?.is_subproject || !prefill?.parent_project_id) return false
  const fat = Number(prefill.valor_projeto || 0)
  const cod = prefill.project_code_preview || ''
  if (!window.confirm(`Gerar SUBPROJETO ${cod ? `"${cod}" ` : ''}vinculado ao projeto pai?\n\n• Nasce em "Início Autorizado"${prefill.sera_faturado ? '\n• Card de APORTE no projeto pai (R$ ' + fat.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ')' : ''}`)) return true
  const payload: any = { ...prefill, contacts: prefillContacts, opportunity_id: oppId }
  delete payload._cards
  try {
    await api.post('/contracts', payload)
    toast.success('Subprojeto gerado em Início Autorizado' + (prefill.sera_faturado ? ' + aporte no pai.' : '.'))
  } catch (e: any) { toast.error(e?.message ?? 'Erro ao gerar subprojeto') }
  onDone?.()
  return true
}

// Move otimista de um card entre colunas do kanban (ajusta count e total do valor da coluna).
function optimisticMoveCard(cols: Column[], oppId: number, fromStageId: number, toStageId: number): Column[] {
  if (fromStageId === toStageId) return cols
  const moved = cols.find(c => c.stage.id === fromStageId)?.opportunities.find(o => o.id === oppId)
  if (!moved) return cols
  return cols.map(col => {
    if (col.stage.id === fromStageId) return { ...col, opportunities: col.opportunities.filter(o => o.id !== oppId), count: Math.max(0, col.count - 1), total_valor: col.total_valor - (moved.valor || 0) }
    if (col.stage.id === toStageId) return { ...col, opportunities: [...col.opportunities, { ...moved, stage_id: toStageId }], count: col.count + 1, total_valor: col.total_valor + (moved.valor || 0) }
    return col
  })
}

const INFLU_OPTS = [{ v: '', l: 'Influência…' }, { v: 'alta', l: 'Alta' }, { v: 'media', l: 'Média' }, { v: 'baixa', l: 'Baixa' }]
const CANAL_OPTS = [{ v: '', l: 'Canal preferido…' }, { v: 'email', l: 'E-mail' }, { v: 'whatsapp', l: 'WhatsApp' }, { v: 'telefone', l: 'Telefone' }, { v: 'linkedin', l: 'LinkedIn' }]

// Lista de escolhas (multi-seleção com busca) — para Produtos/Serviços na oportunidade.
function ProdutoMultiSelect({ options, value, onChange }: { options: { id: number; name: string }[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const list = options.filter(o => o.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  const selected = options.filter(o => value.includes(o.id))
  const inp = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm outline-none text-left" style={inp}>
        <span style={{ color: value.length ? 'var(--text)' : 'var(--text-muted)' }}>{value.length ? `${value.length} selecionado(s)` : 'Selecione os produtos/serviços…'}</span>
        <ChevronDown size={15} style={{ color: 'var(--text-light)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg overflow-hidden shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar…" className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none" style={inp} />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {list.map(o => {
              const on = value.includes(o.id)
              return (
                <button key={o.id} type="button" onClick={() => toggle(o.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--surface-hover)]">
                  <span className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary)' : 'transparent' }}>{on && <Check size={12} style={{ color: 'var(--primary-fg)' }} />}</span>
                  <span style={{ color: 'var(--text)' }}>{o.name}</span>
                </button>
              )
            })}
            {list.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-light)' }}>Nada encontrado.</p>}
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(o => (
            <span key={o.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              {o.name}
              <button type="button" onClick={() => toggle(o.id)} style={{ color: 'var(--primary)' }}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Lista de escolhas com busca para ADICIONAR um produto na edição (adiciona ao clicar).
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
        <span style={{ color: 'var(--primary)' }}>{busy ? 'Adicionando…' : '+ Adicionar produto…'}</span>
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

export default function CrmPipelinePage() {
  const { user } = useAuth()
  const [big, setBig] = useState<{ id: number; tab: 'atividades' | 'historico' | 'propostas' | 'anexos' } | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipeId, setPipeId] = useState<number | null>(null)
  const [cols, setCols] = useState<Column[]>([])
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])

  const [newOpen, setNewOpen] = useState(false)
  const NF0 = { title: '', descricao: '', pipeline_id: '', customer_id: '', customer_contact_id: '', lead_source_id: '', responsavel_id: '', valor: '', previsao_fechamento: '', campaign_id: '', proxima_acao: '', proxima_acao_at: '' }
  const [nf, setNf] = useState(NF0)
  const [sources, setSources] = useState<Source[]>([])
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const NL0 = { open: false, empresa: '', cnpj: '', contato: '', email: '', telefone: '', lead_source_id: '' }
  const [novoLead, setNovoLead] = useState(NL0)
  // Novo contato inline (criar contato da empresa sem sair da tela).
  const NC0 = { open: false, name: '', email: '', phone: '', cargo: '', departamento: '', whatsapp: '', linkedin: '', influencia_decisao: '', canal_preferido: '' }
  const [novoContato, setNovoContato] = useState(NC0)
  const [lossReasons, setLossReasons] = useState<{ id: number; name: string }[]>([])
  const [campaigns, setCampaigns] = useState<{ id: number; name: string }[]>([])
  const [lossModal, setLossModal] = useState<{ oppId: number; stageId: number } | null>(null)
  const [qualModal, setQualModal] = useState<{ oppId: number; stageName: string } | null>(null)
  const [wonModal, setWonModal] = useState<{ oppId: number; prefill: any; prefillContacts: any[] } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<'resumo' | 'timeline' | 'followups' | 'propostas' | 'anexos'>('resumo')
  const abrirDetalhe = (oppId: number, tab: 'resumo' | 'timeline' | 'followups' | 'propostas' | 'anexos' = 'resumo') => { setDetailTab(tab); setDetailId(oppId) }
  // Ao voltar do editor de proposta (/crm/pipeline?opp=ID), reabre o drawer da oportunidade.
  useEffect(() => {
    const opp = new URLSearchParams(window.location.search).get('opp')
    if (opp) { setDetailId(Number(opp)); window.history.replaceState(null, '', '/crm/pipeline') }
  }, [])
  const [produtos, setProdutos] = useState<{ id: number; name: string }[]>([]) // catálogo de Produtos/Serviços
  const [nfProdutos, setNfProdutos] = useState<number[]>([]) // produtos selecionados ao criar a oportunidade

  useEffect(() => {
    api.get<{ data: Pipeline[] }>('/crm/pipelines').then(r => { setPipelines(r?.data ?? []); if (r?.data?.[0]) setPipeId(r.data[0].id) }).catch(() => toast.error('Erro ao carregar funis'))
    api.get<any>('/customers?pageSize=500').then(r => setCustomers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name, crm_status: c.crm_status })).sort((a: Customer, b: Customer) => a.name.localeCompare(b.name)))).catch(() => {})
    api.get<{ data: Source[] }>('/crm/lead-sources').then(r => setSources((r?.data ?? []).filter(s => s.active !== false))).catch(() => {})
    api.get<{ data: CrmUser[] }>('/crm/users').then(r => setCrmUsers(r?.data ?? [])).catch(() => {})
    api.get<{ data: { id: number; name: string; ativo?: boolean }[] }>('/crm/products').then(r => setProdutos((r?.data ?? []).filter(p => p.ativo !== false).map(p => ({ id: p.id, name: p.name })))).catch(() => {})
    api.get<{ data: { id: number; name: string; active?: boolean }[] }>('/crm/loss-reasons').then(r => setLossReasons((r?.data ?? []).filter(x => x.active !== false))).catch(() => {})
    api.get<{ data: { id: number; name: string }[] }>('/crm/campaigns?active=1').then(r => setCampaigns(r?.data ?? [])).catch(() => {})
    // "Converter em Oportunidade" vindo da ficha do Lead (já qualificado a prospect).
    const opp_for = new URLSearchParams(window.location.search).get('opp_for')
    if (opp_for) { setNf(f => ({ ...f, customer_id: opp_for })); loadContacts(opp_for); setNewOpen(true) }
  }, [])

  const loadContacts = (customerId: string) => {
    if (!customerId) { setContacts([]); return }
    api.get<any>(`/customer-contacts?customer_id=${customerId}`).then(r => setContacts((Array.isArray(r) ? r : r?.data ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => setContacts([]))
  }
  const pickCustomer = (id: string) => { setNf(f => ({ ...f, customer_id: id, customer_contact_id: '' })); loadContacts(id) }

  // Cliente novo: cadastra o lead sem sair da tela e já o seleciona.
  const createLeadAction = useAsyncAction(async () => {
    if (!novoLead.empresa.trim()) { toast.error('Informe o nome da empresa'); return }
    if (!novoLead.cnpj.trim()) { toast.error('Informe o CNPJ'); return }
    const r = await api.post<{ data: { customer_id: number } }>('/crm/leads', {
      empresa: novoLead.empresa, cnpj: novoLead.cnpj, contato: novoLead.contato || null, email: novoLead.email || null,
      telefone: novoLead.telefone || null, lead_source_id: novoLead.lead_source_id ? Number(novoLead.lead_source_id) : null,
    })
    const id = r.data.customer_id
    setCustomers(cs => [...cs, { id, name: novoLead.empresa, crm_status: 'lead' }].sort((a, b) => a.name.localeCompare(b.name)))
    pickCustomer(String(id))
    setNf(f => ({ ...f, lead_source_id: novoLead.lead_source_id || f.lead_source_id }))
    setNovoLead(NL0)
    toast.success('Lead cadastrado e selecionado')
  }, { onError: () => toast.error('Erro ao cadastrar lead') })
  const createLeadInline = () => createLeadAction.run()

  // Novo contato da empresa selecionada, sem sair da tela; já seleciona como principal.
  const createContatoAction = useAsyncAction(async () => {
    if (!nf.customer_id) { toast.error('Selecione a empresa primeiro'); return }
    if (!novoContato.name.trim()) { toast.error('Informe o nome do contato'); return }
    if (!novoContato.email.trim()) { toast.error('Informe o e-mail do contato'); return }
    const r = await api.post<{ data?: { id: number }; id?: number }>('/customer-contacts', {
      customer_id: Number(nf.customer_id), name: novoContato.name,
      email: novoContato.email || null, phone: novoContato.phone || null, cargo: novoContato.cargo || null,
      departamento: novoContato.departamento || null, whatsapp: novoContato.whatsapp || null, linkedin: novoContato.linkedin || null,
      influencia_decisao: novoContato.influencia_decisao || null, canal_preferido: novoContato.canal_preferido || null,
    })
    const novo = (r as any)?.data ?? r
    if (novo?.id) {
      setContacts(cs => [...cs, { id: novo.id, name: novoContato.name }])
      setNf(f => ({ ...f, customer_contact_id: String(novo.id) }))
    } else { loadContacts(nf.customer_id) }
    setNovoContato(NC0)
    toast.success('Contato criado e selecionado')
  }, { onError: () => toast.error('Erro ao criar contato') })
  const createContatoInline = () => createContatoAction.run()

  // Filtros do funil: por empresa (cliente) e por responsável.
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroResp, setFiltroResp] = useState('')
  // silent=true → sync em background (sem spinner): usado após o update otimista de card,
  // pra reconciliar campos calculados pelo servidor SEM piscar a tela. Servidor = fonte da verdade.
  const loadBoard = useCallback((silent = false) => {
    if (!pipeId) return
    // Leads é um pipeline de qualificação (board próprio) — não busca o kanban de oportunidades.
    if (pipelines.find(p => p.id === pipeId)?.tipo === 'qualificacao') { setCols([]); if (!silent) setLoading(false); return }
    if (!silent) setLoading(true)
    const qs = new URLSearchParams({ pipeline_id: String(pipeId) })
    if (filtroCliente) qs.set('customer_id', filtroCliente)
    if (filtroResp) qs.set('responsavel_id', filtroResp)
    api.get<{ data: { stages: Column[] } }>(`/crm/opportunities/kanban?${qs.toString()}`)
      .then(r => setCols(r?.data?.stages ?? []))
      .catch(() => { if (!silent) toast.error('Erro ao carregar o funil') })
      .finally(() => { if (!silent) setLoading(false) })
  }, [pipeId, filtroCliente, filtroResp, pipelines])
  useEffect(() => { loadBoard() }, [loadBoard])

  // Categoria B — criar oportunidade. useAsyncAction trava o duplo-clique (evita opp duplicada).
  const createOppAction = useAsyncAction(async () => {
    if (!nf.title.trim() || !nf.customer_id || !nf.pipeline_id || !nf.customer_contact_id || !nf.lead_source_id || !nf.responsavel_id || !nf.proxima_acao.trim() || !nf.proxima_acao_at) {
      toast.error('Preencha título, pipeline, empresa, contato, origem, responsável e a próxima ação'); return
    }
    const r = await api.post<{ data: { id: number } }>('/crm/opportunities', {
      title: nf.title, pipeline_id: Number(nf.pipeline_id), customer_id: Number(nf.customer_id),
      customer_contact_id: Number(nf.customer_contact_id), lead_source_id: Number(nf.lead_source_id),
      responsavel_id: Number(nf.responsavel_id), valor: nf.valor ? Number(nf.valor) : 0,
      descricao: nf.descricao || null,
      previsao_fechamento: nf.previsao_fechamento || null,
      campaign_id: nf.campaign_id ? Number(nf.campaign_id) : null,
      proxima_acao: nf.proxima_acao, proxima_acao_at: nf.proxima_acao_at,
    })
    const novoId = r?.data?.id
    if (novoId && nfProdutos.length) {
      await Promise.all(nfProdutos.map(pid => api.post(`/crm/opportunities/${novoId}/products`, { crm_product_id: pid }).catch(() => {})))
    }
    toast.success('Oportunidade criada')
    try { if (nf.lead_source_id) localStorage.setItem('crm:last_origem', nf.lead_source_id) } catch {}
    const destino = pipelines.find(p => p.id === Number(nf.pipeline_id))
    setNewOpen(false); setNf(NF0); setContacts([])
    if (destino && destino.id !== pipeId) setPipeId(destino.id); else loadBoard()
  }, { onError: (e: any) => toast.error(e?.message ?? 'Erro ao criar') })
  const createOpp = () => createOppAction.run()

  // Abre o modal com defaults inteligentes (reduz atrito — Fase A/UX).
  const openNewOpp = () => {
    let origem = ''
    try { origem = localStorage.getItem('crm:last_origem') || '' } catch {}
    const euResponsavel = crmUsers.some(u => u.id === user?.id) ? String(user?.id) : ''
    const em2dias = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    // Já nasce no funil que estou usando (aba ativa do Kanban).
    setNf({ ...NF0, pipeline_id: pipeId ? String(pipeId) : '', responsavel_id: euResponsavel, lead_source_id: origem, proxima_acao: 'Primeiro contato', proxima_acao_at: em2dias })
    setContacts([]); setNovoLead(NL0); setNfProdutos([]); setNewOpen(true)
  }

  // Categoria A — move OTIMISTA: o card muda de coluna na hora; PATCH; sync silencioso p/
  // reconciliar; rollback se falhar. useAsyncAction trava concorrência (sem duplo-move).
  const moveAction = useAsyncAction(async (opp: Opp, stageId: number, isWon: boolean) => {
    let snapshot: Column[] = []
    setCols(prev => { snapshot = prev; return optimisticMoveCard(prev, opp.id, opp.stage_id, stageId) })
    try {
      await api.patch(`/crm/opportunities/${opp.id}/stage`, { stage_id: stageId })
      loadBoard(true)  // sync silencioso (background) — NÃO remove o refetch; servidor = verdade
      if (isWon && !opp.contract_id) openWonContract(opp)  // GANHO → Novo Contrato (fluxo à parte)
    } catch (e) {
      setCols(snapshot)  // rollback
      throw e
    }
  }, { onError: (e: any) => toast.error(e?.message ?? 'Erro ao mover') })

  const moveStage = (opp: Opp, stageId: number) => {
    const stage = pipelines.flatMap(p => p.stages).find(s => s.id === stageId)
    if (stage?.is_lost) { setLossModal({ oppId: opp.id, stageId }); return } // motivo obrigatório antes
    moveAction.run(opp, stageId, !!stage?.is_won)
    // Etapa que exige qualificação → abre o relatório (qualidade + aceite exec. + estrelas) após entrar.
    if (stage?.requer_qualificacao && !stage?.is_won && !stage?.is_lost) setQualModal({ oppId: opp.id, stageName: stage.name })
  }
  // GANHO → monta o pré-preenchimento (proposta mais recente + contatos + tipo) e abre o Novo Contrato.
  const openWonContract = async (opp: Opp) => {
    const { prefill, prefillContacts } = await buildWonPrefill(opp)
    if (await criarCardsCloud(opp.id, prefill, prefillContacts, loadBoard)) return
    if (await criarSubprojeto(opp.id, prefill, prefillContacts, loadBoard)) return
    setWonModal({ oppId: opp.id, prefill, prefillContacts })
  }
  // Categoria A — mover p/ Perdido (com motivo): também otimista + rollback + sync silencioso.
  const confirmLossAction = useAsyncAction(async (loss_reason_id: number) => {
    if (!lossModal) return
    const { oppId, stageId } = lossModal
    let snapshot: Column[] = []
    setCols(prev => {
      snapshot = prev
      const fromStageId = prev.find(c => c.opportunities.some(o => o.id === oppId))?.stage.id ?? 0
      return optimisticMoveCard(prev, oppId, fromStageId, stageId)
    })
    setLossModal(null)
    try {
      await api.patch(`/crm/opportunities/${oppId}/stage`, { stage_id: stageId, loss_reason_id })
      loadBoard(true)  // sync silencioso
    } catch (e) { setCols(snapshot); throw e }
  }, { onError: (e: any) => toast.error(e?.message ?? 'Erro ao registrar perda') })
  const confirmLoss = (loss_reason_id: number) => { confirmLossAction.run(loss_reason_id) }

  const pickPipeline = (pid: string) => { setNf(f => ({ ...f, pipeline_id: pid })) }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const pipe = pipelines.find(p => p.id === pipeId)
  const totalForecast = cols.filter(c => !c.stage.is_won && !c.stage.is_lost).reduce((s, c) => s + c.total_valor, 0)

  // Motor configurável: a empresa pode ser qualquer (lead/prospect/cliente); pipeline define o funil.
  const empresaOptions = customers
  // Ao criar oportunidade, restringe as empresas ao(s) tipo(s) configurado(s) no pipeline escolhido.
  // Pipeline sem tipos definidos (vazio/null) = aceita todas. Empresa sem crm_status nunca é barrada.
  const tiposDoPipelineNovo = pipelines.find(p => p.id === Number(nf.pipeline_id))?.tipos_empresa ?? []
  const empresaOptionsNova = (tiposDoPipelineNovo.length === 0)
    ? customers
    : customers.filter(c => !c.crm_status || tiposDoPipelineNovo.includes(c.crm_status))

  const activePipe = pipelines.find(p => p.id === pipeId) ?? null
  const isLeads = activePipe?.tipo === 'qualificacao'

  // Arrastar card entre etapas → reusa moveStage (que já trata Perdido[modal]/Ganho[contrato]/normal[otimista]).
  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return
    const toStageId = Number(r.destination.droppableId)
    const fromStageId = Number(r.source.droppableId)
    if (!toStageId || toStageId === fromStageId) return
    const opp = cols.flatMap(c => c.opportunities).find(o => o.id === Number(r.draggableId.replace('opp-', '')))
    if (opp) moveStage(opp, toStageId)
  }
  // Cor de destaque da coluna: cor da etapa (config) ou verde/vermelho p/ Ganho/Perdido, senão o primário.
  const colAccent = (s: Stage) => s.cor || (s.is_won ? 'var(--success-border)' : s.is_lost ? 'var(--danger-border)' : 'var(--primary)')

  return (
    <AppLayout title="Pipeline (CRM)">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => setPipeId(p.id)} className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={pipeId === p.id ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{p.name}</button>
          ))}
        </div>
        {!isLeads && pipelines.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Forecast aberto: <b style={{ color: 'var(--text)' }}>{fmtBRL(totalForecast)}</b></span>
            <button onClick={openNewOpp} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova oportunidade</button>
          </div>
        )}
      </div>

      {/* Filtros do funil de oportunidades (não se aplicam ao board de Leads). */}
      {!isLeads && pipelines.length > 0 && (
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-60">
          <SearchSelect value={filtroCliente} onChange={setFiltroCliente} fullWidth placeholder="Filtrar por cliente…"
            options={empresaOptions.map(c => ({ id: c.id, name: c.name }))} />
        </div>
        <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)} className="text-sm rounded-lg px-2.5 py-2 outline-none" style={{ background: 'var(--surface)', border: `1px solid ${filtroResp ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text)' }}>
          <option value="">Todos os responsáveis</option>
          {crmUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(filtroCliente || filtroResp) && (
          <button onClick={() => { setFiltroCliente(''); setFiltroResp('') }} className="text-xs px-2.5 py-2 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Limpar filtros</button>
        )}
      </div>
      )}

      {pipelines.length === 0 ? (
        <p className="text-sm rounded-lg px-4 py-6 text-center" style={{ color: 'var(--text-light)', background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>Nenhum pipeline liberado para você. Fale com um administrador para receber acesso.</p>
      ) : isLeads ? (
        <LeadsBoard />
      ) : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
        <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {cols.map(col => { const accent = colAccent(col.stage); return (
            <div key={col.stage.id} className="shrink-0 w-72 rounded-2xl flex flex-col" style={{ background: 'var(--panel)', border: `1px solid ${accent}`, boxShadow: 'var(--brand-card-shadow)' }}>
              <div className="px-3.5 py-3 border-b rounded-t-2xl flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
                  <span className="text-sm font-bold truncate" style={{ color: accent }}>{col.stage.name}</span>
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{col.count}</span>
              </div>
              {/* Indicadores da etapa (Fase 4) */}
              <div className="px-3 py-1 text-[10px] space-y-0.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex justify-between tabular-nums" style={{ color: 'var(--text-light)' }}><span title="Soma do valor de todos os cards desta etapa">Total {fmtBRL(col.total_valor)}</span><span title="Previsão = soma de (valor × probabilidade da etapa)">Prev. {fmtBRL(col.forecast ?? 0)}</span></div>
                <div className="flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-light)' }}>
                  {!!col.tempo_medio_dias && <span title="tempo médio na etapa">⏱ {col.tempo_medio_dias}d</span>}
                  {!!col.vencidos && <span style={{ color: 'var(--danger-border)' }} title="vencidos (SLA)">⚠ {col.vencidos} venc.</span>}
                  {!!col.sem_proxima_acao && <span style={{ color: 'var(--warning-border)' }} title="sem próxima ação">◷ {col.sem_proxima_acao}</span>}
                  {!!col.parados && <span style={{ color: 'var(--warning-border)' }} title="parados (sem interação 7d+)">⏸ {col.parados}</span>}
                </div>
              </div>
              <Droppable droppableId={String(col.stage.id)}>
                {(prov, snap) => (
                <div ref={prov.innerRef} {...prov.droppableProps} className="p-2 space-y-2 overflow-y-auto flex-1 transition-colors rounded-b-2xl" style={{ minHeight: 80, background: snap.isDraggingOver ? 'var(--primary-soft)' : 'transparent' }}>
                {col.opportunities.map((o, idx) => (
                  <Draggable key={o.id} draggableId={`opp-${o.id}`} index={idx}>
                    {(dp, ds) => (
                  <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} onClick={() => setBig({ id: o.id, tab: 'atividades' })} className="rounded-lg p-2.5 cursor-pointer hover:opacity-90" style={{ background: 'var(--surface)', border: '1px solid var(--border)', ...dp.draggableProps.style, boxShadow: ds.isDragging ? '0 8px 20px rgba(0,0,0,0.18)' : undefined }}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>{o.title}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {o.saude && o.saude.status !== 'saudavel' && <span className="text-[11px]" title={o.saude.diagnostico ?? SAUDE_OPP[o.saude.status]?.label}>{SAUDE_OPP[o.saude.status]?.emoji}</span>}
                        {o.sem_proxima_acao && <AlertTriangle size={13} style={{ color: 'var(--warning-border)' }} aria-label="Sem próxima ação" />}
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{o.customer?.name ?? '—'}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs font-bold tabular-nums flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>{fmtBRL(o.valor)}{o.probabilidade != null && <span className="text-[10px] font-semibold" style={{ color: 'var(--text-light)' }}>· {o.probabilidade}%</span>}</span>
                      {o.responsavel && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>👤 {o.responsavel.name.split(' ')[0]}</span>}
                    </div>
                    {/* Nº da proposta + situação. Badge "Convertida" quando a proposta virou contrato. */}
                    {(o.proposta?.codigo || o.contract_id || o.proposta?.status === 'convertida') && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {o.proposta?.codigo && <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>📄 {o.proposta.codigo}{o.proposta.versao ? `.${o.proposta.versao}` : ''}</span>}
                        {(o.contract_id || o.proposta?.status === 'convertida') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--success-bg)', color: 'var(--success-border)' }}>✓ Convertida</span>
                        )}
                      </div>
                    )}
                    {/* Próxima atividade (próxima tarefa em aberto): tipo + data + Atrasada/Em dia */}
                    {o.proxima_tarefa && (() => {
                      const t = o.proxima_tarefa!
                      const atrasada = tarefaAtrasada(t.data)
                      return (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] rounded px-1.5 py-1" style={{ background: 'var(--surface-sunken)', color: atrasada ? 'var(--danger-border)' : 'var(--text-muted)' }} title={atrasada ? 'Atividade atrasada' : 'Em dia'}>
                        <Clock size={11} className="shrink-0" />
                        <span className="truncate flex-1">{t.titulo || t.tipo}</span>
                        {t.data && <span className="px-1 rounded font-bold whitespace-nowrap" style={{ background: atrasada ? 'var(--danger-bg)' : 'var(--success-bg)', color: atrasada ? 'var(--danger-border)' : 'var(--success-border)' }}>{atrasada ? 'Atrasada' : 'Em dia'}</span>}
                        {t.data && <span className="tabular-nums whitespace-nowrap">{new Date(t.data).toLocaleDateString('pt-BR')}</span>}
                      </div>
                      )
                    })()}
                    {/* Botão de adicionar tarefa — sempre disponível */}
                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setBig({ id: o.id, tab: 'atividades' }) }} className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] rounded px-1.5 py-1 font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--primary)' }}>
                      <Plus size={11} /> Adicionar tarefa
                    </button>
                    {!col.stage.is_won && !col.stage.is_lost && (
                      <select value="" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} disabled={moveAction.pending} onChange={e => { if (e.target.value) moveStage(o, Number(e.target.value)) }}
                        className="w-full mt-2 text-[10px] rounded px-1.5 py-1 outline-none disabled:opacity-50" style={inputStyle}>
                        <option value="">Mover para…</option>
                        {pipe?.stages.filter(s => s.id !== o.stage_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </div>
                    )}
                  </Draggable>
                ))}
                {prov.placeholder}
                {col.opportunities.length === 0 && !snap.isDraggingOver && <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>—</p>}
                </div>
                )}
              </Droppable>
            </div>
          )})}
        </div>
        </DragDropContext>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setNewOpen(false)}>
          <div className="w-full max-w-md rounded-2xl flex flex-col max-h-[90vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0"><h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Nova oportunidade</h2><button onClick={() => setNewOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button></div>
            <div className="space-y-3 overflow-y-auto px-5 flex-1">
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pipeline *</label>
                <select value={nf.pipeline_id} onChange={e => pickPipeline(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">Selecione o pipeline…</option>
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>A oportunidade nasce na etapa inicial do pipeline.</p></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Título *</label><input value={nf.title} onChange={e => setNf(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Descrição da oportunidade</label><textarea rows={2} value={nf.descricao} onChange={e => setNf(f => ({ ...f, descricao: e.target.value }))} placeholder="O que o cliente pretende adquirir (opcional na criação, obrigatória antes da proposta)" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Empresa (Lead / Prospect / Cliente) *</label>
                <SearchSelect value={nf.customer_id} onChange={pickCustomer} fullWidth placeholder="Buscar empresa…"
                  options={empresaOptionsNova.map(c => ({ id: c.id, name: c.crm_status ? `${c.name} · ${c.crm_status}` : c.name }))} />
                <>
                  <button type="button" onClick={() => setNovoLead(n => ({ ...NL0, open: !n.open }))} className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                    <UserPlus size={12} /> Empresa nova? Cadastrar sem sair
                  </button>
                  {novoLead.open && <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Vira <b>Prospect</b> automaticamente ao criar a oportunidade.</p>}
                </>
                {novoLead.open && (
                  <div className="mt-2 p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <input value={novoLead.empresa} onChange={e => setNovoLead(n => ({ ...n, empresa: e.target.value }))} placeholder="Empresa *" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    <input value={novoLead.cnpj} onChange={e => setNovoLead(n => ({ ...n, cnpj: e.target.value }))} placeholder="CNPJ *" className="w-full px-3 py-2 rounded-lg text-sm outline-none mt-2" style={inputStyle} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={novoLead.contato} onChange={e => setNovoLead(n => ({ ...n, contato: e.target.value }))} placeholder="Contato" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoLead.telefone} onChange={e => setNovoLead(n => ({ ...n, telefone: e.target.value }))} placeholder="Telefone" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoLead.email} onChange={e => setNovoLead(n => ({ ...n, email: e.target.value }))} placeholder="E-mail" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                      <select value={novoLead.lead_source_id} onChange={e => setNovoLead(n => ({ ...n, lead_source_id: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                        <option value="">Origem…</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setNovoLead(NL0)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                      <button type="button" onClick={createLeadInline} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Incluir lead</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs" style={{ color: 'var(--text-muted)' }}>Contato principal *</label>
                  {nf.customer_id && <button type="button" onClick={() => setNovoContato(n => ({ ...NC0, open: !n.open }))} className="text-[11px] flex items-center gap-1" style={{ color: 'var(--primary)' }}><UserPlus size={12} /> Novo contato</button>}
                </div>
                <select value={nf.customer_contact_id} onChange={e => setNf(f => ({ ...f, customer_contact_id: e.target.value }))} disabled={!nf.customer_id} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">{!nf.customer_id ? 'Selecione a empresa primeiro' : contacts.length ? 'Selecione…' : 'Empresa sem contatos — cadastre um ao lado'}</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {novoContato.open && (
                  <div className="mt-2 p-2 rounded-lg space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                    <input value={novoContato.name} onChange={e => setNovoContato(n => ({ ...n, name: e.target.value }))} placeholder="Nome do contato *" className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={novoContato.cargo} onChange={e => setNovoContato(n => ({ ...n, cargo: e.target.value }))} placeholder="Cargo" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoContato.email} onChange={e => setNovoContato(n => ({ ...n, email: e.target.value }))} placeholder="E-mail *" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoContato.phone} onChange={e => setNovoContato(n => ({ ...n, phone: e.target.value }))} placeholder="Telefone" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input value={novoContato.departamento} onChange={e => setNovoContato(n => ({ ...n, departamento: e.target.value }))} placeholder="Departamento" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoContato.whatsapp} onChange={e => setNovoContato(n => ({ ...n, whatsapp: e.target.value }))} placeholder="WhatsApp" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoContato.linkedin} onChange={e => setNovoContato(n => ({ ...n, linkedin: e.target.value }))} placeholder="LinkedIn (URL)" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={novoContato.influencia_decisao} onChange={e => setNovoContato(n => ({ ...n, influencia_decisao: e.target.value }))} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>{INFLU_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                      <select value={novoContato.canal_preferido} onChange={e => setNovoContato(n => ({ ...n, canal_preferido: e.target.value }))} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>{CANAL_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setNovoContato(NC0)} className="px-3 py-1 rounded-lg text-xs" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                      <button type="button" onClick={createContatoInline} className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Incluir contato</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Origem *</label>
                  <select value={nf.lead_source_id} onChange={e => setNf(f => ({ ...f, lead_source_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    <option value="">Selecione…</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Responsável comercial *</label>
                  <select value={nf.responsavel_id} onChange={e => setNf(f => ({ ...f, responsavel_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    <option value="">Selecione…</option>{crmUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Valor (R$)</label><input type="number" value={nf.valor} onChange={e => setNf(f => ({ ...f, valor: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Previsão fechamento</label><input type="date" value={nf.previsao_fechamento} onChange={e => setNf(f => ({ ...f, previsao_fechamento: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              </div>
              {campaigns.length > 0 && (
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Campanha</label>
                  <select value={nf.campaign_id} onChange={e => setNf(f => ({ ...f, campaign_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    <option value="">— sem campanha</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              )}
              {produtos.length > 0 && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Produtos / Serviços</label>
                  <ProdutoMultiSelect options={produtos} value={nfProdutos} onChange={setNfProdutos} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Próxima ação *</label><input value={nf.proxima_acao} onChange={e => setNf(f => ({ ...f, proxima_acao: e.target.value }))} placeholder="Ex.: Ligar para alinhar escopo" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Data da próxima ação *</label><input type="date" value={nf.proxima_acao_at} onChange={e => setNf(f => ({ ...f, proxima_acao_at: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}><button onClick={() => setNewOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button><button onClick={createOpp} disabled={createOppAction.pending} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{createOppAction.running ? 'Criando…' : 'Criar'}</button></div>
          </div>
        </div>
      )}

      {big && (
        <div className="fixed inset-0 z-[65] flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => { setBig(null); loadBoard() }}>
          <div className="w-full max-w-6xl my-2 rounded-2xl p-5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <OportunidadeDetalhe id={big.id} initialTab={big.tab} onClose={() => { setBig(null); loadBoard() }} />
          </div>
        </div>
      )}
      {lossModal && (
        <LossModal reasons={lossReasons} onCancel={() => setLossModal(null)} onConfirm={confirmLoss} />
      )}
      {qualModal && (
        <QualificacaoModal oppId={qualModal.oppId} stageName={qualModal.stageName}
          onCancel={() => setQualModal(null)} onSaved={() => { setQualModal(null); loadBoard() }} />
      )}

      {wonModal && (
        <ContractFormModal open opportunityId={wonModal.oppId} prefill={wonModal.prefill} prefillContacts={wonModal.prefillContacts}
          onClose={() => setWonModal(null)} onSaved={() => { setWonModal(null); loadBoard() }} />
      )}

      {detailId && <OppDetail id={detailId} initialTab={detailTab} onClose={() => { setDetailId(null); loadBoard() }} />}
    </AppLayout>
  )
}

// ── Modal de motivo da perda (Item 2 — obrigatório) ──
function LossModal({ reasons, onCancel, onConfirm }: { reasons: { id: number; name: string }[]; onCancel: () => void; onConfirm: (id: number) => void }) {
  const [reasonId, setReasonId] = useState('')
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Marcar como perdida</h2><button onClick={onCancel} style={{ color: 'var(--text-muted)' }}><X size={18} /></button></div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Motivo da perda *</label>
        <select value={reasonId} onChange={e => setReasonId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Selecione…</option>{reasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={() => reasonId ? onConfirm(Number(reasonId)) : toast.error('Selecione o motivo')} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--danger)', color: '#fff' }}>Confirmar perda</button>
        </div>
      </div>
    </div>
  )
}

/** Relatório de qualificação ao entrar numa etapa que exige: qualidade + aceite executivos + estrelas de fechamento. */
function QualificacaoModal({ oppId, stageName, onCancel, onSaved }: { oppId: number; stageName: string; onCancel: () => void; onSaved: () => void }) {
  const [estrelas, setEstrelas] = useState(3)
  const [aceite, setAceite] = useState(false)
  const [aceitePor, setAceitePor] = useState('')
  const [sinais, setSinais] = useState({ necessidade: false, decisor: false, champion: false, budget_confirmado: false })
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const toggle = (k: keyof typeof sinais) => setSinais(s => ({ ...s, [k]: !s[k] }))
  const CRIT: [keyof typeof sinais, string][] = [['necessidade', 'Necessidade clara'], ['decisor', 'Decisor identificado'], ['champion', 'Champion interno'], ['budget_confirmado', 'Budget confirmado']]
  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/crm/opportunities/${oppId}/qualificacao`, { estrelas, aceite_executivos: aceite, aceite_por: aceitePor.trim() || null, observacao: obs.trim() || null, ...sinais })
      toast.success('Qualificação registrada'); onSaved()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar qualificação') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Qualificação do lead</h2>
          <button onClick={onCancel} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p className="text-[11px] mb-4" style={{ color: 'var(--text-light)' }}>Etapa <b>{stageName}</b> — valide a qualidade e defina a possibilidade de fechamento.</p>

        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Possibilidade de fechamento</label>
        <div className="flex items-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setEstrelas(n)} title={`${n} estrela(s) · ${n * 20}%`}>
              <Star size={26} style={{ color: estrelas >= n ? '#f59e0b' : 'var(--border)' }} fill={estrelas >= n ? '#f59e0b' : 'none'} />
            </button>
          ))}
          <span className="text-xs ml-2 font-semibold" style={{ color: 'var(--text-muted)' }}>{estrelas * 20}%</span>
        </div>

        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Qualidade do lead</label>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {CRIT.map(([k, l]) => (
            <button key={k} type="button" onClick={() => toggle(k)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left"
              style={sinais[k] ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {sinais[k] ? <Check size={13} /> : <span className="w-3.5 h-3.5 rounded shrink-0" style={{ border: '1px solid var(--border)' }} />} {l}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} /> Aceito pelo time de executivos
        </label>
        {aceite && <input value={aceitePor} onChange={e => setAceitePor(e.target.value)} placeholder="Aceito por (nome)" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={inputStyle} />}

        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Observações da qualificação (opcional)" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Depois</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar qualificação'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Drawer de detalhe da oportunidade: info + Próxima Ação (tarefas) + timeline ──
interface OppFull extends Opp { pipeline?: { name: string }; stage?: Stage; notas?: string | null; descricao?: string | null; proxima_acao?: string | null; previsao_fechamento?: string | null; ultima_interacao_at?: string | null
  contract_id?: number | null
  products?: { id: number; name: string; origem?: string | null; pivot: { quantidade: number | string; valor: number | string; custo?: number | string | null; categoria?: string | null; tipo_precificacao?: string | null } }[]
  tasks?: { id: number; tipo: string; titulo: string | null; data: string | null; prioridade: string; concluida_at: string | null; responsavel?: { name: string } | null }[]
  events?: { id: number; event_type: string; from_value: string | null; to_value: string | null; created_at: string; triggered_by?: { name: string } | null }[]
  qualificacao?: string | null; detalhes?: Record<string, any> | null
  probabilidade?: number; probabilidade_manual?: number | null; probabilidade_etapa?: number; valor_ponderado?: number; motivo_parada?: string | null
  forecast_categoria?: string | null
  forecast_vencido?: boolean
  sem_interacao_7?: boolean; dias_sem_interacao?: number | null; dias_na_etapa?: number
  saude?: { status: string; motivos: string[]; diagnostico: string; qualidade?: string; sinais?: { proposta_enviada: boolean; decisor: boolean; champion: boolean; budget: boolean } }
  derivado?: Record<string, any>
  contato?: { id: number; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null } | null
  responsavel?: { id: number; name: string } | null
  lead_source?: { id: number; name: string } | null
  campaign?: { id: number; name: string } | null
  customer?: { id: number; name: string; cgc?: string | null } | null }

interface CatalogProduct { id: number; name: string; categoria: string | null; valor: number | string }

interface Proposal { id: number; numero: number; versao: number; valor: number; descontos: number; total: number; status: string; tipo?: string | null; codigo?: string | null; data_validade: string | null; vendedor?: { name: string } | null }

const PROPOSTA_TIPOS = [
  { v: 'bh_fixo', label: 'Banco de Horas Fixo', short: 'BH Fixo' },
  { v: 'bh_mensal', label: 'Banco de Horas Mensal', short: 'BH Mensal' },
  { v: 'on_demand', label: 'Consultoria Sob Demanda', short: 'Sob Demanda' },
  { v: 'projeto_fechado', label: 'Projeto Fechado', short: 'Projeto Fechado' },
  { v: 'cloud', label: 'Cloud Protheus', short: 'Cloud' },
] as const
const STATUS_LABELS: Record<string, string> = {
  em_elaboracao: 'em elaboração', enviada: 'enviada', em_analise: 'em análise', em_negociacao: 'em negociação',
  em_revisao: 'em revisão', aprovada: 'aprovada', aguardando_assinatura: 'aguardando assinatura', assinada: 'assinada',
  liberada: 'liberada', convertida: 'convertida', reprovada: 'reprovada', cancelada: 'cancelada', expirada: 'expirada', reativada: 'reativada',
}
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s.replace(/_/g, ' ')
// Legenda visual (cor + ícone) dos status TRAVADOS (definidos pelo fluxo). Assinada tem destaque próprio.
const STATUS_BADGE: Record<string, { bg: string; fg: string; icon: string; label: string }> = {
  aguardando_assinatura: { bg: 'var(--warning-bg)', fg: 'var(--warning-border)', icon: '✍', label: 'Aguard. assinatura' },
  assinada:   { bg: 'var(--primary-soft)', fg: 'var(--primary)',         icon: '✔', label: 'Assinada' },
  liberada:   { bg: 'var(--success-bg)',   fg: 'var(--success-border)',  icon: '🔓', label: 'Liberada' },
  convertida: { bg: 'var(--success-bg)',   fg: 'var(--success-border)',  icon: '✓', label: 'Convertida' },
}
// Cor da bolinha de qualificação no card (frio/morno/quente) — espelha o RD.
// Tarefa atrasada = data já passou (independe de a oportunidade estar aberta/fechada).
const tarefaAtrasada = (s?: string | null) => !!s && new Date(s) < new Date()
// Saúde da oportunidade (🟢🟡🔴) e motivos de parada do pipeline.
const SAUDE_OPP: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  saudavel: { emoji: '🟢', label: 'Saudável', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  atencao: { emoji: '🟡', label: 'Atenção', color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  em_risco: { emoji: '🔴', label: 'Em risco', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const MOTIVOS_PARADA = ['Cliente avaliando', 'Sem budget', 'Falta acesso ao decisor', 'Aguardando jurídico/compras', 'Concorrência', 'Preço/condição comercial', 'Mudança de prioridade', 'Sem retorno', 'Outro']
const FORECAST_CAT: [string, string][] = [['', '— categoria'], ['commit', 'Comprometido'], ['best_case', 'Melhor cenário'], ['pipeline', 'Pipeline'], ['omitido', 'Omitido']]
// Tom do badge de situação da proposta por status.
// Status governados pelo fluxo (assinatura/liberação/conversão) — read-only no card, não dá pra rebaixar à mão.
const STATUS_LOCKED = ['aguardando_assinatura', 'assinada', 'liberada', 'convertida']
// Status que o usuário pode setar manualmente no card.
const STATUS_OPCOES = ['em_elaboracao', 'enviada', 'em_analise', 'em_negociacao', 'em_revisao', 'aprovada', 'reprovada', 'cancelada', 'expirada', 'reativada']
const tipoShort = (t?: string | null) => PROPOSTA_TIPOS.find(x => x.v === t)?.short ?? t ?? '—'

// Enriquecimento do card (espelha o que o RD Station mostra ao abrir o deal).
const DET_FIELDS: { k: string; label: string; type?: 'date' | 'textarea' }[] = [
  { k: 'indicacao', label: 'Indicação / quem indicou' },
  { k: 'arquiteto', label: 'Arquiteto de soluções' },
  { k: 'categoria', label: 'Categoria' },
  { k: 'tipo_alocacao', label: 'Tipo de alocação' },
  { k: 'expectativa_inicio', label: 'Expectativa de início', type: 'date' },
  { k: 'condicao_pagamento', label: 'Condição de pagamento' },
  { k: 'contrato_status', label: 'Status do contrato' },
  { k: 'contrato_assinatura', label: 'Data da assinatura', type: 'date' },
  { k: 'observacoes', label: 'Observações do projeto', type: 'textarea' },
  { k: 'proximos_passos', label: 'Próximos passos', type: 'textarea' },
]
// Bloco read-only derivado da proposta/contrato vinculado (vem pronto do backend em `derivado`).
const DERIV_LABELS: [string, string][] = [
  ['codigo_projeto', 'Código do projeto'], ['tipo_contrato', 'Tipo de contrato'], ['modo_faturamento', 'Modo de faturamento'],
  ['valor_proposta', 'Valor da proposta'], ['horas_consultoria', 'Horas de consultoria'], ['horas_coordenacao', 'Horas de coordenação'],
  ['margem_liquida', 'Margem líquida'], ['custo_fixo', 'Custo fixo'], ['condicao_pagamento', 'Condição de pagamento'],
  ['escopo', 'Escopo'], ['proposta_status', 'Status da proposta'], ['data_assinatura', 'Assinatura'],
]

// Categoria e Precificação agora vivem na OPORTUNIDADE (por produto vinculado).
const OPP_CATEGORIAS = ['Licenciamento', 'Implantação', 'Sustentação', 'Banco de Horas', 'Pacote de Horas', 'Projeto Fechado', 'Treinamento', 'Customização']
const OPP_PRECIFICACOES: { v: string; l: string }[] = [
  { v: 'hora', l: 'Por hora' }, { v: 'projeto', l: 'Por projeto' }, { v: 'mensal', l: 'Mensal' }, { v: 'licenca', l: 'Licença' },
]

type OppProduct = NonNullable<OppFull['products']>[number]

/** Produtos/Serviços vinculados à oportunidade — Categoria e Precificação por linha. */
function ProdutosVinculados({ oppId, products, onChanged }: { oppId: number; products: OppProduct[]; onChanged: () => void }) {
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
    <div className="mt-4">
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
          <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>Nenhum produto vinculado.</p>
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
            {/* Memória de cálculo por produto (dentro da linha) */}
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
    </div>
  )
}

function OppDetail({ id, onClose, initialTab = 'resumo' }: { id: number; onClose: () => void; initialTab?: 'resumo' | 'timeline' | 'followups' | 'propostas' | 'anexos' }) {
  const router = useRouter()
  const [o, setO] = useState<OppFull | null>(null)
  const [nt, setNt] = useState({ tipo: '', titulo: '', data: '', prox_tipo: '', prox_data: '' })
  const [contactTypes, setContactTypes] = useState<{ id: number; nome: string; slug: string }[]>([])
  useEffect(() => { api.get<{ data: { id: number; nome: string; slug: string }[] }>('/crm/contact-types').then(r => { const ct = r?.data ?? []; setContactTypes(ct); setNt(f => f.tipo ? f : { ...f, tipo: ct[0]?.slug ?? '' }) }).catch(() => {}) }, [])
  const tipoNome = (slug: string) => contactTypes.find(x => x.slug === slug)?.nome ?? slug
  const [proposals, setProposals] = useState<Proposal[]>([])
  const load = useCallback(() => { api.get<{ data: OppFull }>(`/crm/opportunities/${id}`).then(r => setO(r?.data ?? null)).catch(() => {}) }, [id])
  const loadProps = useCallback(() => { api.get<{ data: Proposal[] }>(`/crm/proposals?opportunity_id=${id}`).then(r => setProposals(r?.data ?? [])).catch(() => {}) }, [id])
  useEffect(() => { load(); loadProps() }, [load, loadProps])
  const setPropStatus = async (p: Proposal, status: string) => { try { await api.put(`/crm/proposals/${p.id}`, { status }); loadProps() } catch { toast.error('Erro') } }
  const [delId, setDelId] = useState<number | null>(null)
  const excluirProposta = async (p: Proposal) => {
    if (!confirm(`Excluir a proposta ${p.codigo || '#' + p.numero}.${p.versao}? Ela sai da oportunidade (pode ser recuperada no banco).`)) return
    setDelId(p.id)
    try { await api.delete(`/crm/proposals/${p.id}`); toast.success('Proposta excluída'); loadProps(); load() }
    catch { toast.error('Erro ao excluir proposta') } finally { setDelId(null) }
  }
  // Criação da proposta JÁ com horas/valor (modal completo) → o valor da oportunidade adere à proposta na hora.
  const [criandoProp, setCriandoProp] = useState(false)
  // "+ Nova proposta" → cria um rascunho mínimo e abre o EDITOR completo (tela certa), sem o modal intermediário.
  // O tipo/horas/valor/escopo são definidos no próprio editor (seção Identificação tem o seletor de tipo).
  const criarPropostaENavegar = async () => {
    if (criandoProp) return
    setCriandoProp(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/crm/proposals', { opportunity_id: id, tipo: 'bh_fixo', modo_faturamento: 'por_hora', inputs: {} })
      const newId = r?.data?.id
      if (newId) router.push(`/crm/propostas/${newId}`)
      else { toast.error('Não foi possível criar a proposta'); setCriandoProp(false) }
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar proposta'); setCriandoProp(false) }
  }
  const [genId, setGenId] = useState<number | null>(null)
  const gerarPdf = async (p: Proposal) => {
    if (!p.codigo) { toast.error('Recrie a proposta pelo fluxo novo (com tipo) para gerar o PDF'); return }
    setGenId(p.id)
    try {
      const r = await api.post<{ data: { document_id: number } }>(`/crm/proposals/${p.id}/gerar`, {})
      const docId = r?.data?.document_id
      if (docId) window.open(`/api/v1/documents/${docId}/download`, '_blank')
      toast.success('PDF gerado'); loadProps()
    } catch { toast.error('Erro ao gerar PDF') } finally { setGenId(null) }
  }

  // Rótulos amigáveis dos eventos da timeline.
  const EVT_LABEL: Record<string, string> = {
    created: 'Criada', stage_changed: 'Mudou de etapa', valor_alterado: 'Valor alterado',
    probabilidade_alterada: 'Probabilidade alterada', previsao_alterada: 'Previsão alterada', parada_alterada: 'Motivo da parada',
    task_done: 'Tarefa concluída', task_reopened: 'Tarefa reaberta', task_updated: 'Tarefa editada',
    automacao: 'Automação', automacao_erro: 'Falha em automação',
    won: 'Ganha', lost: 'Perdida',
  }

  // Abas do card
  const [tab, setTab] = useState<'resumo' | 'timeline' | 'followups' | 'propostas' | 'anexos'>(initialTab)

  // Previsibilidade: probabilidade manual (%) + motivo da parada
  const [prob, setProb] = useState('')
  useEffect(() => { setProb(o?.probabilidade_manual != null ? String(o.probabilidade_manual) : '') }, [o?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveProbAction = useAsyncAction(async () => {
    const novo = prob === '' ? null : Number(prob)
    // Governança: alterar a probabilidade exige justificativa (vira auditoria na timeline).
    let motivo: string | null = null
    if (novo !== null) {
      motivo = window.prompt('Justifique a alteração da probabilidade (ex.: cliente confirmou budget):')
      if (motivo === null) return
      if (!motivo.trim()) { toast.error('Justificativa obrigatória'); return }
    }
    await api.put(`/crm/opportunities/${id}`, { probabilidade: novo, motivo_alteracao: motivo }); toast.success('Probabilidade salva'); load()
  }, { onError: (e: any) => toast.error(e?.message || 'Erro ao salvar') })
  const saveProb = () => saveProbAction.run()
  const setMotivoParadaAction = useAsyncAction(async (m: string) => {
    let obs: string | null = null
    if (m === 'Outro') { obs = window.prompt('Descreva o motivo (obrigatório):'); if (obs === null) return; if (!obs.trim()) { toast.error('Descreva o motivo'); return } }
    await api.put(`/crm/opportunities/${id}`, { motivo_parada: m || null, detalhes: { motivo_parada_obs: obs } }); toast.success('Motivo registrado'); load()
  }, { onError: () => toast.error('Erro ao salvar') })
  const setMotivoParada = (m: string) => setMotivoParadaAction.run(m)
  // Qualificação do deal (MEDDIC/BANT) — flags em `detalhes`.
  const toggleSinalAction = useAsyncAction(async (k: string, v: boolean) => {
    await api.put(`/crm/opportunities/${id}`, { detalhes: { [k]: v } }); load()
  }, { onError: () => toast.error('Erro ao salvar') })
  const toggleSinal = (k: string, v: boolean) => toggleSinalAction.run(k, v)
  const setCategoriaAction = useAsyncAction(async (c: string) => {
    await api.put(`/crm/opportunities/${id}`, { forecast_categoria: c || null }); toast.success('Categoria de forecast salva'); load()
  }, { onError: () => toast.error('Erro ao salvar') })
  const setCategoria = (c: string) => setCategoriaAction.run(c)

  // Descrição da oportunidade (o que o cliente pretende adquirir) — obrigatória antes da proposta
  const [descr, setDescr] = useState('')
  useEffect(() => { setDescr(o?.descricao ?? '') }, [o?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveDescrAction = useAsyncAction(async () => {
    await api.put(`/crm/opportunities/${id}`, { descricao: descr }); toast.success('Descrição salva'); load()
  }, { onError: () => toast.error('Erro ao salvar descrição') })
  const saveDescr = () => saveDescrAction.run()

  // Valor da oportunidade — editável (a alteração é registrada na Timeline pelo backend).
  const [valorEdit, setValorEdit] = useState('')
  useEffect(() => { setValorEdit(o?.valor != null ? String(o.valor) : '') }, [o?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveValorAction = useAsyncAction(async () => {
    await api.put(`/crm/opportunities/${id}`, { valor: valorEdit === '' ? 0 : Number(valorEdit) }); toast.success('Valor atualizado'); load()
  }, { onError: () => toast.error('Erro ao salvar valor') })
  const saveValor = () => saveValorAction.run()

  // Dados da negociação (enriquecimento do card) — mapa `detalhes` editável manualmente.
  const [det, setDet] = useState<Record<string, string>>({})
  useEffect(() => { setDet({ ...((o?.detalhes as Record<string, string>) ?? {}) }) }, [o?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const setD = (k: string, v: string) => setDet(p => ({ ...p, [k]: v }))
  const negDirty = DET_FIELDS.some(f => (det[f.k] ?? '') !== ((o?.detalhes?.[f.k] as string) ?? ''))
  const saveNegAction = useAsyncAction(async () => {
    await api.put(`/crm/opportunities/${id}`, { detalhes: det }); toast.success('Dados da negociação salvos'); load()
  }, { onError: () => toast.error('Erro ao salvar') })
  const saveNeg = () => saveNegAction.run()
  // Seções colapsáveis (Nível 2) — reduzem a carga visual do Resumo.
  const [showDet, setShowDet] = useState(false)
  const [showDeriv, setShowDeriv] = useState(false)

  // Anexos da oportunidade
  const [atts, setAtts] = useState<{ id: number; original_name?: string; file_name?: string; mime_type?: string }[]>([])
  const attFileRef = useRef<HTMLInputElement>(null)
  const loadAtts = useCallback(() => { api.get<{ data: any[] }>(`/crm/opportunities/${id}/attachments`).then(r => setAtts(r?.data ?? [])).catch(() => {}) }, [id])
  useEffect(() => { loadAtts() }, [loadAtts])
  const uploadAtt = async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    try { await api.post(`/crm/opportunities/${id}/attachments`, fd); toast.success('Anexo enviado'); loadAtts() }
    catch { toast.error('Erro ao enviar anexo') }
  }
  const delAtt = async (attId: number) => { try { await api.delete(`/crm/opportunities/${id}/attachments/${attId}`); loadAtts() } catch { toast.error('Erro') } }

  // Conversão comercial → Novo Contrato completo (pré-preenchido com a proposta)
  const [wonDrawer, setWonDrawer] = useState<{ prefill: any; prefillContacts: any[] } | null>(null)
  const gerarContratoDrawer = async () => {
    const { prefill, prefillContacts } = await buildWonPrefill({ id, title: o?.title, valor: o?.valor, customer: o?.customer, responsavel: (o as any)?.responsavel, responsavel_id: (o as any)?.responsavel_id })
    if (await criarCardsCloud(id, prefill, prefillContacts, () => { load(); loadProps() })) return
    if (await criarSubprojeto(id, prefill, prefillContacts, () => { load(); loadProps() })) return
    setWonDrawer({ prefill, prefillContacts })
  }

  const addTaskAction = useAsyncAction(async () => {
    if (!nt.tipo) { toast.error('Selecione o tipo de contato'); return }
    // follow-up registrado = contato JÁ FEITO → entra como concluído
    const r = await api.post<{ data: { id: number } }>('/crm/tasks', { opportunity_id: id, tipo: nt.tipo, titulo: nt.titulo || null, data: nt.data || new Date().toISOString() })
    if (r?.data?.id) await api.patch(`/crm/tasks/${r.data.id}/complete`, { done: true })
    // agenda o próximo contato (tarefa aberta → vira a próxima ação; fica "atrasado" se vencer)
    if (nt.prox_tipo && nt.prox_data) await api.post('/crm/tasks', { opportunity_id: id, tipo: nt.prox_tipo, data: nt.prox_data })
    setNt({ tipo: contactTypes[0]?.slug ?? '', titulo: '', data: '', prox_tipo: '', prox_data: '' }); load()
  }, { onError: () => toast.error('Erro ao registrar follow-up') })
  const addTask = () => addTaskAction.run()
  const completeAction = useAsyncAction(async (taskId: number, done = true) => {
    await api.patch(`/crm/tasks/${taskId}/complete`, { done }); load()
  }, { onError: () => toast.error('Erro') })
  const complete = (taskId: number, done = true) => completeAction.run(taskId, done)

  // Edição inline de follow-up (gera log na Timeline). Converte ISO → input datetime-local.
  const toLocalInput = (s?: string | null) => { if (!s) return ''; const d = new Date(s); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
  const [editTask, setEditTask] = useState<{ id: number; tipo: string; data: string; titulo: string } | null>(null)
  const saveTaskAction = useAsyncAction(async () => {
    if (!editTask) return
    await api.put(`/crm/tasks/${editTask.id}`, { tipo: editTask.tipo, data: editTask.data || null, titulo: editTask.titulo || null }); toast.success('Follow-up atualizado'); setEditTask(null); load()
  }, { onError: () => toast.error('Erro ao salvar follow-up') })
  const saveTask = () => saveTaskAction.run()

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const fmtDt = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto p-5" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        {!o ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p> : (<>
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{o.title}</h2>
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{o.customer?.name}</p>
          <div className="flex items-center gap-2 mt-2 mb-4 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{o.stage?.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{o.status}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(o.valor)}</span>
            {o.saude && o.status === 'aberto' && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" title={o.saude.diagnostico} style={{ background: SAUDE_OPP[o.saude.status]?.bg, color: SAUDE_OPP[o.saude.status]?.color }}>{SAUDE_OPP[o.saude.status]?.emoji} {SAUDE_OPP[o.saude.status]?.label}</span>}
          </div>

          {/* Abas do card */}
          <div className="flex gap-1 mb-4 text-xs font-semibold flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
            {([['resumo', 'Resumo'], ['propostas', 'Propostas'], ['followups', 'Follow-ups'], ['anexos', 'Anexos'], ['timeline', 'Timeline']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="px-2.5 py-1.5 -mb-px" style={{ color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent' }}>{l}</button>
            ))}
          </div>

          {/* RESUMO */}
          {tab === 'resumo' && (<>
            <div className="mb-4"><CustomFieldsSection urlContext="opportunities" entityId={o.id} title="Campos personalizados da oportunidade" /></div>
            {o.contract_id ? (
              <div className="mb-4 text-xs rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'var(--success-bg)', color: 'var(--success-border)', border: '1px solid var(--success-border)' }}>
                <Check size={14} /> Convertida em contrato <b>#{o.contract_id}</b> — gere o projeto no Kanban de Contratos.
              </div>
            ) : o.status === 'ganho' ? (
              <button onClick={gerarContratoDrawer} className="mb-4 w-full py-2 rounded-lg text-sm font-bold" style={{ background: 'var(--success)', color: '#fff' }}>Gerar contrato →</button>
            ) : null}
            {wonDrawer && <ContractFormModal open opportunityId={id} prefill={wonDrawer.prefill} prefillContacts={wonDrawer.prefillContacts} onClose={() => setWonDrawer(null)} onSaved={() => { setWonDrawer(null); load() }} />}

            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Descrição da oportunidade</h3>
              <textarea rows={3} value={descr} onChange={e => setDescr(e.target.value)} placeholder="O que o cliente pretende adquirir (ex.: Implantação SmartView, Banco de Horas adicional, Upgrade de Release)…" className="w-full text-xs rounded-lg px-2.5 py-2 outline-none" style={inputStyle} />
              <button onClick={saveDescr} disabled={saveDescrAction.pending} className="mt-1.5 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{saveDescrAction.running ? 'Salvando…' : 'Salvar descrição'}</button>
              {!descr.trim() && <p className="text-[10px] mt-1" style={{ color: 'var(--warning-border)' }}>Obrigatória antes de criar a proposta.</p>}
            </div>

            <div className="text-xs space-y-1 rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <div className="flex items-center justify-between gap-2">
                <span>Valor</span>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--text-light)' }}>R$</span>
                  <input type="number" step="0.01" value={valorEdit} onChange={e => setValorEdit(e.target.value)} className="w-28 px-2 py-1 rounded-lg text-sm outline-none text-right tabular-nums" style={inputStyle} />
                  {String(o.valor ?? '') !== valorEdit && <button onClick={saveValor} disabled={saveValorAction.pending} className="px-2 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saveValorAction.running ? '…' : 'Salvar'}</button>}
                </div>
              </div>
              <div className="flex justify-between"><span>Previsão de fechamento</span><span style={{ color: 'var(--text)' }}>{o.previsao_fechamento ? new Date(o.previsao_fechamento).toLocaleDateString('pt-BR') : '—'}</span></div>
              <div className="flex justify-between"><span>Próxima ação</span><span style={{ color: 'var(--text)' }}>{o.proxima_acao || '—'}{o.proxima_acao_at ? ` · ${fmtDt(o.proxima_acao_at)}` : ''}</span></div>
            </div>

            {/* Produtos/Serviços vinculados — Categoria e Precificação por linha (migradas do produto). */}
            <ProdutosVinculados oppId={id} products={o.products ?? []} onChanged={load} />

            {/* Previsibilidade — probabilidade, valor ponderado, saúde, motivo da parada */}
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Previsibilidade</h3>
              <div className="text-xs space-y-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span>Probabilidade {o.probabilidade_manual == null && <span style={{ color: 'var(--text-light)' }}>(da etapa)</span>}</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} max={100} value={prob} placeholder={String(o.probabilidade ?? 0)} onChange={e => setProb(e.target.value)} className="w-16 px-2 py-1 rounded-lg text-sm outline-none text-right tabular-nums" style={inputStyle} />
                    <span style={{ color: 'var(--text-light)' }}>%</span>
                    {String(o.probabilidade_manual ?? '') !== prob && <button onClick={saveProb} disabled={saveProbAction.pending} className="px-2 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saveProbAction.running ? '…' : 'Salvar'}</button>}
                  </div>
                </div>
                <div className="flex justify-between"><span>Valor ponderado</span><span className="font-semibold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(o.valor_ponderado ?? 0)}</span></div>
                <div className="flex items-center justify-between gap-2"><span>Categoria de forecast</span>
                  <select value={o.forecast_categoria ?? ''} onChange={e => setCategoria(e.target.value)} className="text-[11px] rounded px-1.5 py-0.5 outline-none" style={inputStyle}>
                    {FORECAST_CAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {typeof o.dias_na_etapa === 'number' && <div className="flex justify-between"><span>Tempo na etapa</span><span style={{ color: 'var(--text)' }}>{o.dias_na_etapa} dias</span></div>}
                {o.saude && o.status === 'aberto' && <div className="flex justify-between gap-2"><span>Saúde</span><span className="text-right" style={{ color: SAUDE_OPP[o.saude.status]?.color }}>{SAUDE_OPP[o.saude.status]?.emoji} {o.saude.diagnostico}</span></div>}
                {o.forecast_vencido && <div className="flex items-center gap-1.5 rounded px-2 py-1 mt-1" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}><AlertTriangle size={11} /> Forecast vencido — a data prevista de fechamento já passou</div>}
              </div>
              {/* Motivo da parada — aparece quando a oportunidade está parada (sem interação 7d+) */}
              {o.status === 'aberto' && (o.sem_interacao_7 || o.motivo_parada) && (
                <div className="mt-2 rounded-lg px-3 py-2" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--warning-border)' }}>O que está impedindo o avanço?</p>
                  <select value={o.motivo_parada ?? ''} onChange={e => setMotivoParada(e.target.value)} className="w-full text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                    <option value="">Selecione o motivo…</option>
                    {MOTIVOS_PARADA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Qualificação do deal (MEDDIC/BANT) — mede chance real de fechamento */}
            {o.status === 'aberto' && o.saude?.sinais && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Qualificação do deal</h3>
                  {o.saude.qualidade && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: o.saude.qualidade === 'alta' ? 'var(--success-bg)' : o.saude.qualidade === 'media' ? 'var(--warning-bg)' : 'var(--danger-bg)', color: o.saude.qualidade === 'alta' ? 'var(--success-border)' : o.saude.qualidade === 'media' ? 'var(--warning-border)' : 'var(--danger-border)' }}>qualidade {o.saude.qualidade}</span>}
                </div>
                <div className="space-y-1 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between"><span style={{ color: 'var(--text-muted)' }}>Proposta enviada</span><span style={{ color: o.saude.sinais.proposta_enviada ? 'var(--success-border)' : 'var(--text-light)' }}>{o.saude.sinais.proposta_enviada ? '✓ Sim' : '— derivado da proposta'}</span></div>
                  {([['decisor_identificado', 'Decisor identificado', o.saude.sinais.decisor], ['champion_identificado', 'Champion identificado', o.saude.sinais.champion], ['budget_confirmado', 'Budget confirmado', o.saude.sinais.budget]] as const).map(([k, label, val]) => (
                    <label key={k} className="flex items-center justify-between cursor-pointer">
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <input type="checkbox" checked={!!val} onChange={e => toggleSinal(k, e.target.checked)} />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Contato / empresa / responsável / origem — quem está na negociação */}
            {(o.contato || o.customer || o.responsavel || o.lead_source || o.campaign) && (
              <div className="mt-4 text-xs space-y-1 rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                {o.customer && <div className="flex justify-between gap-3"><span>Empresa</span><span className="text-right" style={{ color: 'var(--text)' }}>{o.customer.name}{o.customer.cgc ? ` · ${o.customer.cgc}` : ''}</span></div>}
                {o.contato && <div className="flex justify-between gap-3"><span>Contato</span><span className="text-right" style={{ color: 'var(--text)' }}>{o.contato.name}{o.contato.email ? ` · ${o.contato.email}` : ''}{o.contato.phone || o.contato.whatsapp ? ` · ${o.contato.phone || o.contato.whatsapp}` : ''}</span></div>}
                {o.responsavel && <div className="flex justify-between gap-3"><span>Responsável</span><span style={{ color: 'var(--text)' }}>{o.responsavel.name}</span></div>}
                {o.lead_source && <div className="flex justify-between gap-3"><span>Origem</span><span style={{ color: 'var(--text)' }}>{o.lead_source.name}</span></div>}
                {o.campaign && <div className="flex justify-between gap-3"><span>Campanha</span><span style={{ color: 'var(--text)' }}>{o.campaign.name}</span></div>}
              </div>
            )}

            {/* Dados da negociação — Nível 2, colapsado por padrão */}
            <div className="mt-4">
              <button onClick={() => setShowDet(s => !s)} className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
                <span>Dados da negociação</span><span>{showDet ? '▾' : '▸'}</span>
              </button>
              {showDet && (<>
                {negDirty && <div className="flex justify-end mt-1.5"><button onClick={saveNeg} disabled={saveNegAction.pending} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saveNegAction.running ? 'Salvando…' : 'Salvar'}</button></div>}
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {DET_FIELDS.map(f => (
                    <label key={f.k} className={`text-[11px] ${f.type === 'textarea' ? 'col-span-2' : ''}`} style={{ color: 'var(--text-muted)' }}>{f.label}
                      {f.type === 'textarea'
                        ? <textarea rows={2} value={det[f.k] ?? ''} onChange={e => setD(f.k, e.target.value)} className="w-full mt-0.5 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
                        : <input type={f.type === 'date' ? 'date' : 'text'} value={det[f.k] ?? ''} onChange={e => setD(f.k, e.target.value)} className="w-full mt-0.5 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />}
                    </label>
                  ))}
                </div>
              </>)}
            </div>

            {/* Da proposta vinculada — Nível 2, colapsado por padrão */}
            {o.derivado && Object.keys(o.derivado).length > 0 && (
              <div className="mt-4">
                <button onClick={() => setShowDeriv(s => !s)} className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
                  <span>Da proposta vinculada</span><span>{showDeriv ? '▾' : '▸'}</span>
                </button>
                {showDeriv && (
                  <div className="text-xs space-y-1 rounded-lg px-3 py-2 mt-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {DERIV_LABELS.filter(([k]) => o.derivado?.[k] != null && o.derivado?.[k] !== '').map(([k, label]) => (
                      <div key={k} className={k === 'escopo' ? '' : 'flex justify-between gap-3'}>
                        <span>{label}</span>
                        <span className={k === 'escopo' ? 'block mt-0.5 whitespace-pre-wrap' : 'text-right'} style={{ color: 'var(--text)' }}>{String(o.derivado![k])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>)}

          {/* PROPOSTAS */}
          {tab === 'propostas' && (<div>
            <div className="space-y-1.5 mb-2">
              {proposals.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer ds-row-hover" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={() => router.push(`/crm/propostas/${p.id}`)} title="Abrir editor">
                  <span className="font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{p.codigo ? p.codigo : `#${p.numero}`}<span style={{ color: 'var(--text-light)' }}>.{p.versao}</span></span>
                  {p.tipo && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{tipoShort(p.tipo)}</span>}
                  <span className="flex-1 tabular-nums text-right" style={{ color: 'var(--text-muted)' }}>{fmtBRL(p.total)}{Number(p.descontos) > 0 && <span style={{ color: 'var(--text-light)' }}> (desc. {fmtBRL(p.descontos)})</span>}</span>
                  {STATUS_LOCKED.includes(p.status)
                    ? (() => { const b = STATUS_BADGE[p.status] ?? { bg: 'var(--success-bg)', fg: 'var(--success-border)', icon: '', label: statusLabel(p.status) }
                        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: b.bg, color: b.fg }} title="Status definido pelo fluxo (assinatura/liberação)">{b.icon} {b.label}</span> })()
                    : <select value={p.status} onClick={e => e.stopPropagation()} onChange={e => setPropStatus(p, e.target.value)} className="text-[10px] rounded px-1 py-0.5 outline-none" style={inputStyle}>
                        {(STATUS_OPCOES.includes(p.status) ? STATUS_OPCOES : [p.status, ...STATUS_OPCOES]).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>}
                  <button onClick={e => { e.stopPropagation(); gerarPdf(p) }} disabled={genId === p.id || !p.codigo} title="Gerar / baixar PDF" className="disabled:opacity-40" style={{ color: 'var(--primary)' }}>
                    {genId === p.id ? <Clock size={13} className="animate-spin" /> : <FileDown size={13} />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); excluirProposta(p) }} disabled={delId === p.id} title="Excluir proposta" className="disabled:opacity-40" style={{ color: 'var(--danger)' }}>
                    {delId === p.id ? <Clock size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))}
              {proposals.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem propostas ainda.</p>}
            </div>
            {(() => {
              // Proposta ASSINADA/liberada/convertida fecha a negociação: não cria nova proposta.
              const travada = proposals.some(p => ['assinada', 'liberada', 'convertida'].includes(p.status))
              return travada ? (
                <p className="text-[11px] mt-1 px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>🔒 Proposta assinada — a negociação está fechada. Não é possível incluir uma nova proposta.</p>
              ) : (<>
                <button onClick={criarPropostaENavegar} disabled={criandoProp} className="w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                  {criandoProp && <Clock size={13} className="animate-spin" />}{criandoProp ? 'Abrindo editor…' : '+ Nova proposta'}
                </button>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Abre o editor completo da proposta (tipo, horas, valor, escopo e prévia). Exige Descrição da oportunidade preenchida.</p>
              </>)
            })()}
          </div>)}

          {/* FOLLOW-UPS */}
          {tab === 'followups' && (<div>
            <div className="space-y-1.5 mb-3">
              {(o.tasks ?? []).map(t => {
                const atrasado = !t.concluida_at && !!t.data && new Date(t.data) < new Date()
                if (editTask?.id === t.id) return (
                  <div key={t.id} className="space-y-1.5 text-xs rounded-lg px-2 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--primary)' }}>
                    <div className="flex gap-1.5">
                      <select value={editTask.tipo} onChange={e => setEditTask(p => p && { ...p, tipo: e.target.value })} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                        {contactTypes.map(ct => <option key={ct.slug} value={ct.slug}>{ct.nome}</option>)}
                      </select>
                      <input type="datetime-local" value={editTask.data} onChange={e => setEditTask(p => p && { ...p, data: e.target.value })} className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
                    </div>
                    <textarea rows={2} value={editTask.titulo} onChange={e => setEditTask(p => p && { ...p, titulo: e.target.value })} placeholder="O que foi tratado / combinado…" className="w-full text-xs rounded-lg px-2.5 py-2 outline-none" style={inputStyle} />
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => setEditTask(null)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>Cancelar</button>
                      <button onClick={saveTask} disabled={saveTaskAction.pending} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saveTaskAction.running ? 'Salvando…' : 'Salvar'}</button>
                    </div>
                  </div>
                )
                return (
                <div key={t.id} className="flex items-start gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <button onClick={() => complete(t.id, !t.concluida_at)} className="shrink-0 mt-0.5" title={t.concluida_at ? 'Reabrir' : 'Concluir'} style={{ color: t.concluida_at ? 'var(--success-border)' : 'var(--text-light)' }}><Check size={14} /></button>
                  <span className="flex-1" style={{ color: 'var(--text)', textDecoration: t.concluida_at ? 'line-through' : 'none' }}>
                    <b>{tipoNome(t.tipo)}</b>
                    {t.concluida_at
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-1.5" style={{ background: 'var(--success-bg)', color: 'var(--success-border)' }}>concluído</span>
                      : atrasado
                        ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-1.5" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>atrasado</span>
                        : <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-1.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>agendado</span>}
                    {t.titulo ? <><br /><span style={{ color: 'var(--text-muted)' }}>{t.titulo}</span></> : ''}
                  </span>
                  <span className="shrink-0" style={{ color: atrasado ? 'var(--danger)' : 'var(--text-light)' }}>{fmtDt(t.data)}</span>
                  <button onClick={() => setEditTask({ id: t.id, tipo: t.tipo, data: toLocalInput(t.data), titulo: t.titulo ?? '' })} className="shrink-0 mt-0.5" title="Editar follow-up" style={{ color: 'var(--text-light)' }}><Pencil size={13} /></button>
                </div>
              ) })}
              {(o.tasks ?? []).length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem follow-ups. Registre abaixo.</p>}
            </div>

            <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ border: '1px solid var(--border)' }}>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Registrar follow-up</span>
              <div className="flex gap-1.5">
                <select value={nt.tipo} onChange={e => setNt(f => ({ ...f, tipo: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                  {contactTypes.map(t => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
                </select>
                <input type="datetime-local" value={nt.data} onChange={e => setNt(f => ({ ...f, data: e.target.value }))} title="Data do contato" className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
              </div>
              <textarea rows={3} value={nt.titulo} onChange={e => setNt(f => ({ ...f, titulo: e.target.value }))} placeholder="O que foi tratado / combinado…" className="w-full text-xs rounded-lg px-2.5 py-2 outline-none" style={inputStyle} />

              <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)' }}>
                <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Clock size={11} /> Agendar próximo contato (opcional)</span>
                <div className="flex gap-1.5 mt-1.5">
                  <select value={nt.prox_tipo} onChange={e => setNt(f => ({ ...f, prox_tipo: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                    <option value="">Tipo…</option>
                    {contactTypes.map(t => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
                  </select>
                  <input type="datetime-local" value={nt.prox_data} onChange={e => setNt(f => ({ ...f, prox_data: e.target.value }))} className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
                </div>
              </div>

              <button onClick={addTask} className="w-full py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Registrar follow-up</button>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-light)' }}>Follow-up = relacionamento comercial (alimenta Timeline, Saúde da Conta e Carteira). O próximo contato vira a próxima ação.</p>
          </div>)}

          {/* ANEXOS */}
          {tab === 'anexos' && (<div>
            <input ref={attFileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAtt(f); e.target.value = '' }} />
            <button onClick={() => attFileRef.current?.click()} className="w-full py-1.5 rounded-lg text-xs font-semibold mb-2" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>+ Enviar anexo</button>
            <div className="space-y-1.5">
              {atts.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <a href={`/api/v1/crm/opportunities/${id}/attachments/${a.id}/download`} target="_blank" rel="noreferrer" className="flex-1 truncate" style={{ color: 'var(--text)' }}>{a.original_name ?? a.file_name ?? 'arquivo'}</a>
                  <button onClick={() => delAtt(a.id)} style={{ color: 'var(--text-light)' }} title="Remover"><X size={12} /></button>
                </div>
              ))}
              {atts.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem anexos.</p>}
            </div>
          </div>)}

          {/* TIMELINE */}
          {tab === 'timeline' && (<div>
            <div className="space-y-1.5">
              {(o.events ?? []).slice().reverse().map(e => (
                <div key={e.id} className="text-[11px] flex gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-light)' }}>{fmtDt(e.created_at)}</span>
                  <span><b>{EVT_LABEL[e.event_type] ?? e.event_type}</b>{e.event_type === 'valor_alterado' ? `: R$ ${e.from_value ?? '0'} → R$ ${e.to_value ?? '0'}` : (e.to_value ? `: ${e.to_value}` : '')}{e.triggered_by ? ` (${e.triggered_by.name.split(' ')[0]})` : ''}</span>
                </div>
              ))}
              {(o.events ?? []).length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem histórico.</p>}
            </div>
          </div>)}
        </>)}
      </div>
    </div>
  )
}
