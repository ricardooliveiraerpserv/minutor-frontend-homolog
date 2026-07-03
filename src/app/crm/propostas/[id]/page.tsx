'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ArrowLeft, ArrowRight, FileDown, Save, Image as ImageIcon, ChevronDown, ChevronRight, Plus, Minus, Trash2, ArrowUp, ArrowDown, Type, Mail, Send, X, Activity, Link2, Copy, FileSignature, CheckCircle2, Lock } from 'lucide-react'

type EscopoBlock =
  | { tipo: 'texto'; conteudo: string; font_size?: number; marker?: 'none' | 'bullet' | 'check' }
  | { tipo: 'titulo'; conteudo: string; alinhamento?: 'left' | 'center' | 'right' }
  | { tipo: 'imagem'; attachment_id: number; largura?: number; alinhamento?: 'left' | 'center' | 'right'; legenda?: string }

const TIPOS = [
  { v: 'bh_fixo', label: 'Banco de Horas Fixo' },
  { v: 'bh_mensal', label: 'Banco de Horas Mensal' },
  { v: 'on_demand', label: 'Consultoria Sob Demanda' },
  { v: 'projeto_fechado', label: 'Projeto Fechado' },
  { v: 'cloud', label: 'Cloud Protheus' },
]
// Texto-padrão do card lateral por tipo (igual à arte do deck) — campo único p/ Investimento e Prazo.
const CARD_DEFAULTS: Record<string, string> = {
  bh_fixo: 'Banco de horas fixo para utilização em até 01 ano',
  bh_mensal: 'Banco de horas mensal recorrente ou pacote de horas fixo.',
  on_demand: 'Conforme a quantidade de horas trabalhadas no mês e taxa/hora predefinida.',
  projeto_fechado: 'Escopo fechado, prazo definido e valor fixo.',
}
// Rótulos das páginas por tipo (índice = posição do slide) — usados no liga/desliga de páginas.
const PAGE_LABELS: Record<string, string[]> = {
  bh_fixo:   ['Capa', 'O que resolvemos', 'Como resolvemos', 'Escopo', 'Processos de Projeto', 'Processos de Suporte', 'Investimento', 'Prazo e Pagamento', 'Aceite', 'Encerramento'],
  bh_mensal: ['Capa', 'O que resolvemos', 'Como resolvemos', 'Escopo', 'Processos de Projeto', 'Processos de Suporte', 'Investimento', 'Prazo e Pagamento', 'Aceite', 'Encerramento'],
  on_demand: ['Capa', 'O que resolvemos', 'Como resolvemos', 'Escopo', 'Processos de Projeto', 'Processos de Suporte', 'Investimento', 'Prazo e Pagamento', 'Aceite', 'Encerramento'],
  projeto_fechado: ['Capa', 'O que resolvemos', 'Como resolvemos', 'Escopo', 'Processos de Projeto', 'Investimento', 'Prazo e Pagamento', 'Aceite', 'Encerramento'],
}
const fmtBRL = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Detail {
  id: number; codigo: string | null; tipo: string; versao: number; status: string; opportunity_id: number | null
  data_emissao: string | null; data_validade: string | null; valor: number; total: number; document_id: number | null
  modo_faturamento: string; assinatura_modo?: string
  inputs: Record<string, unknown>; calc: Record<string, number>; conteudo: Record<string, any>
  defaults: Record<string, any>; contratada: Record<string, string>
  customer: { id: number; name: string; cgc: string | null } | null; vendedor: { name: string } | null
}
interface Preview { codigo: string | null; calc: Record<string, number>; slides: string[]; overlays: (string | null)[]; html?: string }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'w-full text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lblCls = 'text-[11px] font-semibold block mb-0.5'

// MODO FOCO: cada módulo (chave do `open`) → campos editáveis, cada um com sua COR. Ao abrir o módulo, o
// preview mostra só a página dele e desenha um retângulo na MESMA cor sobre onde cada campo aparece.
const FOCUS_FIELDS: Record<string, { key: string; color: string; label: string }[]> = {
  ident: [{ key: 'dados', color: '#3498db', label: 'Código · Cliente · CNPJ · Executivo · Data' }, { key: 'capa_nome', color: '#9b59b6', label: 'Nome na capa (Cloud)' }],
  capa: [{ key: 'logo', color: '#e67e22', label: 'Logo do cliente' }],
  escopo: [{ key: 'escopo', color: '#2ecc71', label: 'Escopo (objetivo + funcional)' }],
  cloudsla: [{ key: 'escopo', color: '#2ecc71', label: 'Escopo (objetivo + texto)' }, { key: 'horario', color: '#e67e22', label: 'Horário de Atendimento' }, { key: 'sla', color: '#3498db', label: 'Nível de Serviço (SLA)' }, { key: 'estrutura', color: '#9b59b6', label: 'Estrutura / Severidade' }],
  calc: [{ key: 'tabela', color: '#9b59b6', label: 'Tabela de investimento' }],
  invest: [{ key: 'tabela', color: '#9b59b6', label: 'Tabela de investimento' }, { key: 'sob_demanda', color: '#e74c3c', label: 'Horas sob demanda' }, { key: 'despesas_sp', color: '#3498db', label: 'Despesas SP' }, { key: 'despesas_fora', color: '#1abc9c', label: 'Despesas fora de SP' }],
  cloudinv: [{ key: 'tabela', color: '#9b59b6', label: 'Tabela de investimento (único)' }],
  cloudinvmensal: [{ key: 'tabela', color: '#9b59b6', label: 'Tabela de investimento (mensal)' }],
  prazo: [{ key: 'inicio', color: '#e67e22', label: 'Início do atendimento' }, { key: 'duracao', color: '#8e44ad', label: 'Duração do serviço' }, { key: 'parcelas', color: '#1abc9c', label: 'Parcelas' }, { key: 'pagamento', color: '#f1c40f', label: 'Pagamento das despesas' }],
  aceite: [{ key: 'aceite', color: '#2ecc71', label: 'Aceite' }],
}
const FOCUS_ORDER = ['invest', 'cloudinv', 'cloudinvmensal', 'prazo', 'escopo', 'cloudsla', 'aceite', 'capa', 'calc', 'ident']

// Tags {chave} que o render substitui pelos valores reais — úteis em templates (texto fixo + valor dinâmico).
const TEXT_TAGS = ['{cliente}', '{cnpj}', '{executivo}', '{data}', '{codigo}', '{versao}', '{tipo}', '{horas}', '{horas_coordenacao}', '{valor_hora}', '{valor}', '{valor_projeto}', '{duracao}']
function TagsHint() {
  return (
    <details className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
      <summary className="cursor-pointer font-semibold" style={{ color: 'var(--primary)' }}>Tags &amp; formatação (clique)</summary>
      <p className="mt-1">No texto, use estas <b>tags</b> — o sistema troca pelo valor real da proposta:</p>
      <div className="flex flex-wrap gap-1 mt-1">
        {TEXT_TAGS.map(t => <code key={t} className="px-1 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{t}</code>)}
      </div>
      <p className="mt-1">Ex.: <i>&quot;Pacote de {'{horas}'} horas para {'{cliente}'}, valor {'{valor}'}.&quot;</i> · negrito: <code>**palavra**</code></p>
    </details>
  )
}

function Section({ title, children, open, onToggle, accent, id }: { title: string; children: React.ReactNode; open: boolean; onToggle: () => void; accent?: string; id?: string }) {
  return (
    <div id={id} className="rounded-lg mb-2" style={{ border: '1px solid var(--border)', ...(accent ? { borderLeft: `4px solid ${accent}` } : {}) }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold" style={{ color: 'var(--text)' }}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{title}
        {accent && <span className="ml-auto inline-block rounded" style={{ width: 12, height: 12, background: accent }} />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}
// P-E.2.2 — formulário de adição de participante (validador / assinante por parte).
// alsoKind: 'assina' (validador que também assina → escolhe parte) | 'valida' (assinante que também valida).
function PartForm({ onAdd, busy, alsoKind }: { onAdd: (d: { name: string; email: string; cargo: string; tambem?: boolean; tambemParte?: 'contratante' | 'contratada' }) => void | Promise<void>; busy: boolean; alsoKind?: 'assina' | 'valida' }) {
  const [f, setF] = useState<{ name: string; email: string; cargo: string; tambem: boolean; tambemParte: 'contratante' | 'contratada' }>({ name: '', email: '', cargo: '', tambem: false, tambemParte: 'contratante' })
  const submit = async () => { await onAdd(f); setF({ name: '', email: '', cargo: '', tambem: false, tambemParte: f.tambemParte }) }
  const mini = 'px-2 py-1.5 rounded-md text-xs w-full outline-none'
  return (
    <div className="grid gap-1.5 mt-1.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nome" className={mini} style={inputStyle} />
      <input value={f.cargo} onChange={e => setF({ ...f, cargo: e.target.value })} placeholder="Cargo" className={mini} style={inputStyle} />
      <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="E-mail" type="email" className={mini} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
      {alsoKind && (
        <label className="flex items-center gap-1.5 cursor-pointer text-[11px]" style={{ gridColumn: '1 / -1', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={f.tambem} onChange={e => setF({ ...f, tambem: e.target.checked })} style={{ accentColor: 'var(--primary)' }} />
          {alsoKind === 'valida' ? 'Também valida a proposta' : 'Também assina a proposta'}
          {alsoKind === 'assina' && f.tambem && (
            <select value={f.tambemParte} onChange={e => setF({ ...f, tambemParte: e.target.value as any })} className="px-1 py-0.5 rounded text-[11px]" style={inputStyle}>
              <option value="contratante">como Contratante</option>
              <option value="contratada">como Contratada</option>
            </select>
          )}
        </label>
      )}
      <button onClick={submit} disabled={busy || !f.name.trim() || !f.email.trim()} className="ds-btn-secondary text-xs py-1.5 disabled:opacity-50" style={{ gridColumn: '1 / -1' }}>+ Adicionar</button>
    </div>
  )
}
// P-E.2.4 — Assinar pela Contratada (editor). Se há perfil salvo do e-mail, assina em 1 clique (sem redigitar).
function ContratadaSignModal({ part, perfil, busy, onClose, onSubmit }: { part: any; perfil: any; busy: boolean; onClose: () => void; onSubmit: (d?: { nome?: string; cpf?: string; cargo?: string }) => void }) {
  const temPerfil = !!perfil
  const [editar, setEditar] = useState(!temPerfil)
  const [f, setF] = useState({ nome: perfil?.name ?? part.name ?? '', cpf: perfil?.cpf ?? '', cargo: perfil?.cargo ?? part.cargo ?? '' })
  const mini = 'w-full px-2.5 py-1.5 rounded-lg text-sm outline-none'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !busy && onClose()}>
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(440px,96vw)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>✍ Assinar pela Contratada</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{part.name} · {part.email}</p>
        {temPerfil && !editar ? (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--surface-sunken)' }}>
            <p className="text-sm" style={{ color: 'var(--text)' }}>Assinatura salva encontrada para este e-mail{perfil?.times_used ? ` (usada ${perfil.times_used}×)` : ''}.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{perfil.name}{perfil.cargo ? ` · ${perfil.cargo}` : ''}{perfil.cpf ? ` · ${perfil.cpf}` : ''}</p>
            <button onClick={() => setEditar(true)} className="text-[11px] mt-2" style={{ color: 'var(--primary)' }}>usar outros dados</button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Nome" className={mini} style={inputStyle} />
            <div className="flex gap-2">
              <input value={f.cpf} onChange={e => setF({ ...f, cpf: e.target.value })} placeholder="CPF" className={mini} style={inputStyle} />
              <input value={f.cargo} onChange={e => setF({ ...f, cargo: e.target.value })} placeholder="Cargo" className={mini} style={inputStyle} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={() => onSubmit(temPerfil && !editar ? {} : f)} disabled={busy || ((editar || !temPerfil) && !f.nome.trim())} className="px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: '#16A34A', color: '#fff' }}>{busy ? 'Assinando…' : '✍ Assinar'}</button>
        </div>
      </div>
    </div>
  )
}
function NumRow({ label, value, onChange, step = '1' }: { label: React.ReactNode; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <label className="block">
      <span className={lblCls} style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input type="number" step={step} value={value} onChange={e => onChange(e.target.value)} className={fieldCls} style={inputStyle} />
    </label>
  )
}
// Memória de cálculo (espelha CrmProposalCalcService::compute, modo por_hora) — p/ exibição ao vivo no editor.
// O backend recomputa de forma autoritativa para o PDF.
function computeMemoria(m: any) {
  const dp = { pct_coordenacao: 0.20, pct_imposto: 0.10, pct_custo_fixo: 0.40, pct_margem: 0, premio_executivo_pct: 0, premio_arquiteto_pct: 0, sdr_fixo: 0, desconto_pct: 0 }
  const pr: any = m?.params || {}
  const p: any = { ...dp }
  for (const k of Object.keys(dp)) { const v = pr[k]; if (v !== undefined && v !== '') p[k] = Number(v) || 0 }
  const horasC = Number(m?.horas_consultoria) || 0
  const custoHC = Number(m?.custo_h_consultoria) || 0
  const custoHCo = Number(m?.custo_h_coordenacao) || 0
  const vendaH = Number(m?.venda_h ?? m?.valor_hora_cliente) || 0
  const comHoras = Number(m?.comercial_horas) || 0
  const comCusto = Number(m?.custo_h_comercial) || 0
  const coordHoras = Math.ceil(horasC * p.pct_coordenacao)
  const custoConsultoria = horasC * custoHC, custoCoordenacao = coordHoras * custoHCo, custoComercial = comHoras * comCusto
  const fatConsultoria = horasC * vendaH, fatCoordenacao = coordHoras * vendaH
  const margemMarkup = (fatConsultoria + fatCoordenacao) * p.pct_margem
  const faturamento = fatConsultoria + fatCoordenacao + margemMarkup
  const imposto = faturamento * p.pct_imposto
  const custoFixo = (faturamento - imposto) * p.pct_custo_fixo
  const custoTotal = custoConsultoria + custoCoordenacao + custoComercial + imposto + custoFixo
  const premios = (faturamento - imposto) * (p.premio_executivo_pct + p.premio_arquiteto_pct) + Number(p.sdr_fixo || 0)
  const descontoValor = faturamento * p.desconto_pct
  const fatLiq = faturamento - descontoValor
  const margemPct = fatLiq > 0 ? (fatLiq - (custoTotal + premios)) / fatLiq : 0
  return { faturamento, margem_pct: margemPct, lucro_liquido: fatLiq - (custoTotal + premios), coordenacao_horas: coordHoras }
}

// Bloco de uma "linha de investimento" do Cloud: Tipo de Serviço/Contrato (cadastro) + memória de cálculo
// própria (→ faturamento) + desconto. Usado no Investimento Único (single) e em CADA linha do Mensal.
// Cada linha do Mensal vira um card no Kanban de Contratos (serviceType + valor próprio) ao gerar o contrato.
function InvestLinha({ data, onChange, tipos, mensal, onRemove }: { data: any; onChange: (d: any) => void; tipos: { id: any; name: string }[]; mensal: boolean; onRemove?: () => void }) {
  const mem: any = data.memoria ?? {}
  const setMem = (patch: any) => onChange({ ...data, memoria: { ...mem, ...patch } })
  const setParam = (k: string, v: any) => onChange({ ...data, memoria: { ...mem, params: { ...(mem.params || {}), [k]: v } } })
  const dLabel = data.desconto?.label ?? 'Desconto'
  const dVal = Number(data.desconto?.valor) || 0
  const setDesc = (k: string, v: any) => onChange({ ...data, desconto: { ...(data.desconto || { label: 'Desconto', valor: 0 }), [k]: v } })
  // Cloud/SaaS no Investimento MENSAL é VALOR FIXO — sem horas nem valor/hora. O faturamento da linha
  // vem direto do campo "Valor" (data.valor); o backend usa esse fallback quando a memória não tem horas.
  // O Investimento ÚNICO segue por hora (memória de cálculo normal), mesmo sendo Cloud.
  const tipoNome = (tipos.find(s => String(s.id) === String(data.contract_type_id))?.name || '').toLowerCase()
  const isCloudLine = mensal && /cloud|saas/.test(tipoNome)
  const fixoVal = Number(data.valor) || 0
  const out = computeMemoria(mem)
  const lineFat = isCloudLine ? fixoVal : (out.faturamento || 0)
  const total = lineFat - dVal
  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="space-y-2 pb-3 mb-1 rounded-lg" style={{ borderBottom: '1px solid var(--border)' }}>
      {onRemove && <div className="flex justify-end"><button type="button" onClick={onRemove} className="text-[11px]" style={{ color: 'var(--danger)' }}>✕ remover tipo</button></div>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo de Contrato</span>
          <select value={data.contract_type_id ?? ''} onChange={e => { const id = e.target.value; const nm = tipos.find(s => String(s.id) === id)?.name; onChange({ ...data, contract_type_id: id, label: (data.label && data.label !== '') ? data.label : (nm ?? data.label ?? '') }) }} className={fieldCls} style={inputStyle}>
            <option value="">— selecionar —</option>
            {tipos.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="block"><span className={lblCls} style={{ color: 'var(--text-muted)' }}>Rótulo na tabela</span>
          <input value={data.label ?? ''} onChange={e => onChange({ ...data, label: e.target.value })} placeholder="CLOUD" className={fieldCls} style={inputStyle} /></label>
      </div>
      {isCloudLine ? (
        // Cloud/SaaS: valor fixo direto (sem horas/valor-hora). Limpa horas/venda_h da memória p/ o
        // backend usar o fallback de "valor" (não recalcular por hora).
        <div className="grid grid-cols-2 gap-2">
          <NumRow label={mensal ? 'Valor mensal (R$)' : 'Valor (R$)'} step="0.01" value={String(data.valor ?? '')} onChange={v => onChange({ ...data, valor: v === '' ? '' : Number(v), memoria: { ...mem, horas_consultoria: '', venda_h: '' } })} />
        </div>
      ) : (<>
        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Memória de cálculo</span>
        <div className="grid grid-cols-2 gap-2">
          <NumRow label={mensal ? 'Horas mensais' : 'Horas'} value={String(mem.horas_consultoria ?? '')} onChange={v => setMem({ horas_consultoria: v === '' ? '' : Number(v) })} />
          <NumRow label="Valor/hora cliente (R$)" step="0.01" value={String(mem.venda_h ?? '')} onChange={v => setMem({ venda_h: v === '' ? '' : Number(v) })} />
          <NumRow label="Custo/h consultoria" step="0.01" value={String(mem.custo_h_consultoria ?? '')} onChange={v => setMem({ custo_h_consultoria: v === '' ? '' : Number(v) })} />
          <NumRow label="Custo/h coordenação" step="0.01" value={String(mem.custo_h_coordenacao ?? '')} onChange={v => setMem({ custo_h_coordenacao: v === '' ? '' : Number(v) })} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([['pct_coordenacao', '% Coord.', '0.20'], ['pct_imposto', '% Imposto', '0.10'], ['pct_custo_fixo', '% Custo fixo', '0.40'], ['pct_margem', '% Margem', '0'], ['premio_executivo_pct', '% Prêmio exec.', '0'], ['premio_arquiteto_pct', '% Prêmio arq.', '0']] as const).map(([k, lbl, def]) => (
            <label key={k} className="block"><span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{lbl}</span>
              <input type="number" step="0.01" value={(mem.params as any)?.[k] ?? ''} onChange={e => setParam(k, e.target.value === '' ? '' : Number(e.target.value))} placeholder={def} className={fieldCls} style={inputStyle} /></label>
          ))}
        </div>
      </>)}
      <div className="rounded-lg p-2 text-xs space-y-0.5" style={{ background: 'var(--surface-sunken)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Faturamento (valor da linha)</span><b style={{ color: 'var(--text)' }}>R$ {fmt(lineFat)}</b></div>
        {!isCloudLine && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Margem</span><b style={{ color: (out.margem_pct || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>{((out.margem_pct || 0) * 100).toFixed(2)}%</b></div>}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <label className="block"><span className={lblCls} style={{ color: 'var(--text-muted)' }}>Desconto (rótulo)</span>
          <input value={dLabel} onChange={e => setDesc('label', e.target.value)} placeholder="Desconto / Cortesia" className={fieldCls} style={inputStyle} /></label>
        <label className="block"><span className={lblCls} style={{ color: 'var(--text-muted)' }}>Valor (R$)</span>
          <input type="number" value={data.desconto?.valor ?? ''} onChange={e => setDesc('valor', e.target.value === '' ? '' : Number(e.target.value))} placeholder="0,00" className={fieldCls} style={inputStyle} /></label>
      </div>
      <p className="text-xs" style={{ color: 'var(--text)' }}>Valor da linha: <b>R$ {fmt(total)}</b> <span style={{ color: 'var(--text-muted)' }}>(faturamento {fmt(lineFat)} − {dLabel.toLowerCase()} {fmt(dVal)})</span></p>
    </div>
  )
}

function TextRow({ label, value, onChange, rows = 1, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className={lblCls} style={{ color: 'var(--text-muted)' }}>{label}</span>
      {rows > 1
        ? <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={fieldCls} style={inputStyle} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={fieldCls} style={inputStyle} />}
    </label>
  )
}

type ExtraItem = { tipo: 'titulo' | 'texto'; texto: string; align: 'left' | 'center' | 'right' }
// Lista de títulos/textos posicionáveis (Escopo/Investimento/Prazo). Fluem na ordem e paginam se não couber.
function ExtrasEditor({ items, onChange }: { items: ExtraItem[]; onChange: (next: ExtraItem[]) => void }) {
  const list = Array.isArray(items) ? items : []
  const update = (i: number, patch: Partial<ExtraItem>) => onChange(list.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i))
  const move = (i: number, dir: number) => { const j = i + dir; if (j < 0 || j >= list.length) return; const next = [...list];[next[i], next[j]] = [next[j], next[i]]; onChange(next) }
  const add = (tipo: 'titulo' | 'texto') => onChange([...list, { tipo, texto: '', align: 'left' }])
  const aligns: ExtraItem['align'][] = ['left', 'center', 'right']
  const alignIcon = { left: '⬅', center: '⬛', right: '➡' } as const
  return (
    <div className="space-y-2">
      {list.map((it, i) => (
        <div key={i} className="rounded-lg p-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <select value={it.tipo} onChange={e => update(i, { tipo: e.target.value as ExtraItem['tipo'] })} className="text-[11px] rounded px-1 py-1" style={inputStyle}>
              <option value="titulo">Título</option>
              <option value="texto">Texto</option>
            </select>
            {aligns.map(a => (
              <button key={a} type="button" onClick={() => update(i, { align: a })} title={a} className="text-[11px] px-1.5 py-1 rounded"
                style={{ background: it.align === a ? 'var(--primary)' : 'var(--bg)', color: it.align === a ? 'var(--primary-fg)' : 'var(--text)', border: '1px solid var(--border)' }}>
                {alignIcon[a]}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="text-[11px] px-1" style={{ color: 'var(--text-muted)' }}>↑</button>
              <button type="button" onClick={() => move(i, 1)} className="text-[11px] px-1" style={{ color: 'var(--text-muted)' }}>↓</button>
              <button type="button" onClick={() => remove(i)} className="text-[11px] px-1" style={{ color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
          <textarea rows={it.tipo === 'titulo' ? 1 : 2} value={it.texto} onChange={e => update(i, { texto: e.target.value })} className={fieldCls} style={inputStyle}
            placeholder={it.tipo === 'titulo' ? 'Texto do título (negrito, roxo)' : 'Texto do parágrafo (Enter separa linhas)'} />
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={() => add('titulo')} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Título</button>
        <button type="button" onClick={() => add('texto')} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Texto</button>
      </div>
    </div>
  )
}

// Preview fiel: renderiza o MESMO HTML do PDF num iframe (o paginador do escopo roda aqui,
// então o preview mostra as páginas de continuação exatamente como sairão no PDF).
function PreviewFrame({ html }: { html: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.74)
  const [h, setH] = useState(900)
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const update = () => setScale(el.clientWidth / 1280)
    update()
    const ro = new ResizeObserver(update); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const ifr = e.currentTarget
    const measure = () => { try { const doc = ifr.contentDocument; if (doc?.body) setH(doc.body.scrollHeight) } catch { /* cross-origin n/a */ } }
    measure(); setTimeout(measure, 200); setTimeout(measure, 600)
  }
  return (
    <div ref={wrapRef} style={{ width: '100%', position: 'relative', height: h * scale }}>
      <iframe srcDoc={html} onLoad={onLoad} title="Pré-visualização da proposta"
        style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
    </div>
  )
}

export default function PropostaEditor() {
  const params = useParams()
  const router = useRouter()
  // MODO TEMPLATE: rota /crm/propostas/template-{tipo} edita o TEMPLATE global do tipo (sem proposta/cliente/código).
  const rawId = String(params?.id ?? '')
  const isTemplate = rawId.startsWith('template-')
  const tplTipo = isTemplate ? rawId.slice('template-'.length) : ''
  const id = isTemplate ? 0 : Number(params?.id)
  const [d, setD] = useState<Detail | null>(null)
  const [inputs, setInputs] = useState<Record<string, any>>({})
  const [conteudo, setConteudo] = useState<Record<string, any>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [gerando, setGerando] = useState(false)
  // Participantes da proposta (validação + assinatura por parte)
  const [parts, setParts] = useState<any[]>([])
  const [caderno, setCaderno] = useState<any[]>([])
  const [signPart, setSignPart] = useState<{ part: any; perfil: any } | null>(null) // P-E.2.4 — assinar Contratada (fallback nativo)
  const [clickUrl, setClickUrl] = useState<string | null>(null) // Clicksign embedado no editor (Contratada)
  const [enviadoInfo, setEnviadoInfo] = useState<{ nome: string; email: string } | null>(null) // info: assinatura via e-mail Clicksign
  const [editPart, setEditPart] = useState<{ id: number; name: string; cargo: string; cpf: string } | null>(null) // editar dados do assinante
  const [comprovante, setComprovante] = useState<any>(null) // P-E.2.4 — registro da assinatura
  // ── Envio por e-mail (remetente = usuário logado via Graph; prévia igual ao fechamento) ──
  const [composeOpen, setComposeOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailHtml, setEmailHtml] = useState<string | null>(null)
  const [emailPrevLoading, setEmailPrevLoading] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emails, setEmails] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')
  const emailSeeded = useRef(false)
  // ── Envio para ASSINATURA (compositor de e-mail; remetente = usuário logado) ──
  const [assinOpen, setAssinOpen] = useState(false)
  const [assinHtml, setAssinHtml] = useState<string | null>(null)
  const [assinPrevLoading, setAssinPrevLoading] = useState(false)
  const [assinMsg, setAssinMsg] = useState('')
  const [assinSubject, setAssinSubject] = useState('')
  const [assinSigners, setAssinSigners] = useState<any[]>([])
  const [assinSender, setAssinSender] = useState<{ nome?: string; email?: string }>({})
  const [assinForcar, setAssinForcar] = useState(false) // pular aprovação pendente
  const assinSeeded = useRef(false)
  // ── Solicitar APROVAÇÃO (compositor de e-mail; remetente = usuário logado) ──
  const [aprovOpen, setAprovOpen] = useState(false)
  const [aprovHtml, setAprovHtml] = useState<string | null>(null)
  const [aprovPrevLoading, setAprovPrevLoading] = useState(false)
  const [aprovMsg, setAprovMsg] = useState('')
  const [aprovSubject, setAprovSubject] = useState('')
  const [aprovAprovadores, setAprovAprovadores] = useState<any[]>([])
  const [aprovSender, setAprovSender] = useState<{ nome?: string; email?: string }>({})
  const aprovSeeded = useRef(false)
  // ── Engajamento / Portal de Propostas (tracking comercial) ──
  const [engOpen, setEngOpen] = useState(false)
  const [eng, setEng] = useState<any>(null)
  const [ana, setAna] = useState<any>(null)
  const [engLoading, setEngLoading] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  // ── Liberação Operacional (Proposal-Centric) ──
  const [libOpen, setLibOpen] = useState(false)
  const [lib, setLib] = useState<any>(null)
  const [libLoading, setLibLoading] = useState(false)
  const [libBusy, setLibBusy] = useState(false)
  // ── Revisões do cliente (P-C.2) — constam na própria tela de edição ──
  const [revs, setRevs] = useState<any[]>([])
  const [revOpen, setRevOpen] = useState(true)
  const [revReply, setRevReply] = useState<Record<number, string>>({})
  const [revBusy, setRevBusy] = useState(false)
  // Módulos FECHADOS por padrão; ACORDEÃO — só um aberto por vez (abrir um fecha os demais). Abrir ativa o foco.
  const [open, setOpen] = useState<Record<string, boolean>>({ ident: false, assinatura: false, calc: false, escopo: false, invest: false, prazo: false, aceite: false, paginas: false, contrato: false, cloudinv: false, cloudsla: false, capa: false })
  const toggleSection = (key: string) => setOpen(o => (o[key] ? {} : { [key]: true }))
  // Tipos p/ os seletores de geração do contrato (metadados — não aparecem no PDF).
  const [ctOptions, setCtOptions] = useState<{ id: number; name: string }[]>([])
  const [stOptions, setStOptions] = useState<{ id: number; name: string }[]>([])
  // Código segmentado (PREFIXO·SEQ·ANO·[SUB]) — estado local editável; o código padded é composto p/ armazenar.
  const [codePrefix, setCodePrefix] = useState('')
  const [codeSeq, setCodeSeq] = useState('')
  const [codeYear, setCodeYear] = useState('')
  const [codeSub, setCodeSub] = useState('') // 2 dígitos do subprojeto (filho)
  const [parentProjects, setParentProjects] = useState<{ id: number; name: string; code: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const escopoFileRef = useRef<HTMLInputElement>(null)

  // carrega a proposta (ou o TEMPLATE, em modo template)
  useEffect(() => {
    if (!isTemplate && !id) return
    const fetchDet: Promise<Detail | undefined> = isTemplate
      ? api.get<{ data: any }>(`/crm/proposal-templates/${tplTipo}`).then(r => {
          const t = r?.data || {}
          return {
            id: 0, codigo: null, tipo: tplTipo, opportunity_id: null, versao: 1, status: 'template',
            data_emissao: new Date().toISOString().slice(0, 10), data_validade: null, valor: 0, total: 0, document_id: null,
            modo_faturamento: t.modo_faturamento ?? (tplTipo === 'projeto_fechado' ? 'valor_fixo' : 'por_hora'),
            inputs: t.inputs ?? {}, calc: {}, conteudo: t.conteudo ?? {}, defaults: t.defaults ?? {},
            contratada: {}, customer: null, vendedor: null,
          } as Detail
        })
      : api.get<{ data: Detail }>(`/crm/proposals/${id}`).then(r => r?.data)
    fetchDet.then(det => {
      if (!det) return
      setD(det)
      const cm = (det.codigo ?? '').match(/^([A-Za-z]+)(\d+)-(\d{2})(?:-(\d{2}))?$/)
      setCodePrefix((cm?.[1] ?? '').toUpperCase())
      setCodeSeq(cm?.[2] ? String(parseInt(cm[2], 10) || '') : '')
      setCodeYear(cm?.[3] ?? String(new Date().getFullYear()).slice(-2))
      setCodeSub(cm?.[4] ? String(parseInt(cm[4], 10) || '') : '')
      setInputs({ ...(det.inputs || {}) })
      // pré-preenche conteúdo com defaults do deck (intocado = igual default → sem overlay)
      const base = JSON.parse(JSON.stringify(det.defaults || {}))
      // DEEP-merge de 1 nível: o conteudo salvo prevalece, mas herda os DEFAULTS por subchave (ex.: objetivo
      // pré-preenchido) quando a seção salva não tem aquela chave.
      const cont = det.conteudo || {}
      const merged: Record<string, any> = { ...base }
      for (const k of Object.keys(cont)) {
        const cv = (cont as any)[k]
        const bv = (base as any)[k]
        merged[k] = (cv && typeof cv === 'object' && !Array.isArray(cv) && bv && typeof bv === 'object' && !Array.isArray(bv)) ? { ...bv, ...cv } : cv
      }
      for (const sec of ['escopo', 'investimento', 'prazo', 'aceite', 'contrato']) merged[sec] = { ...(base[sec] || {}), ...((det.conteudo || {})[sec] || {}) }
      if ((det.conteudo || {}).logo_attachment_id) merged.logo_attachment_id = det.conteudo.logo_attachment_id
      setConteudo(merged)
    }).catch(() => toast.error('Erro ao carregar'))
  }, [id, isTemplate, tplTipo])

  // Opções de Tipo de Contrato / Tipo de Serviço (mesmas do modal de contrato).
  useEffect(() => {
    api.get<any>('/contract-types?pageSize=100').then(r => setCtOptions((r?.items ?? r?.data ?? r ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {})
    api.get<any>('/service-types?pageSize=100').then(r => setStOptions((r?.items ?? r?.data ?? r ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {})
  }, [])

  // preview debounced
  const tipo = d?.tipo || 'bh_fixo'
  const isProjeto = tipo === 'projeto_fechado'
  const isHoras = tipo === 'bh_fixo' || tipo === 'bh_mensal'
  // Memória de cálculo SEMPRE por hora (incl. Projeto Fechado): faturamento = horas × valor/hora.
  // O deck do Projeto Fechado segue mostrando só o total (valor fixo), sem horas ao cliente.
  const modoFat = 'por_hora'
  // Módulo aberto que ativa o FOCO (o 1º em FOCUS_ORDER que está aberto e tem destaques).
  const focusKey = FOCUS_ORDER.find(k => open[k] && FOCUS_FIELDS[k]) ?? ''
  const focusFields = (focusKey ? (FOCUS_FIELDS[focusKey] ?? []) : []).filter(f => !(f.key === 'sob_demanda' && tipo !== 'bh_fixo') && !(f.key === 'duracao' && !['bh_fixo', 'bh_mensal'].includes(tipo)))
  // Acento colorido no CAMPO do editor (mesma cor do retângulo na proposta) quando o módulo está em foco.
  const fColor = (fieldKey: string): string | undefined => focusFields.find(f => f.key === fieldKey)?.color
  const fAccent = (fieldKey: string): React.CSSProperties => {
    const c = fColor(fieldKey)
    return c ? { borderLeft: `4px solid ${c}`, paddingLeft: 8, borderRadius: 4 } : {}
  }
  const refreshPreview = useCallback(() => {
    if (!d) return
    const highlights = Object.fromEntries(focusFields.map(f => [f.key, f.color]))
    api.post<{ data: Preview }>('/crm/proposals/preview', {
      tipo, inputs, conteudo, codigo: d.codigo, versao: d.versao,
      modo_faturamento: modoFat, customer_id: d.customer?.id, data_emissao: d.data_emissao,
      focus: focusKey, highlights, proposal_id: isTemplate ? undefined : Number(id),
    }).then(r => { if (r?.data) setPreview(r.data) }).catch(() => {})
  }, [d, tipo, inputs, conteudo, focusKey])
  useEffect(() => { const t = setTimeout(refreshPreview, 400); return () => clearTimeout(t) }, [refreshPreview])
  // Validação de duplicação do CÓDIGO AO VIVO (enquanto digita, debounced).
  const [codigoDup, setCodigoDup] = useState(false)
  useEffect(() => {
    const c = (d?.codigo ?? '').trim()
    if (!c) { setCodigoDup(false); return }
    const t = setTimeout(() => {
      api.get<{ disponivel: boolean }>(`/crm/proposals/${id}/codigo-check?codigo=${encodeURIComponent(c)}`)
        .then(r => setCodigoDup(!(r?.disponivel ?? true))).catch(() => setCodigoDup(false))
    }, 400)
    return () => clearTimeout(t)
  }, [d?.codigo, id])
  // Recompõe o código (padded) a partir dos segmentos PREFIXO·SEQ·ANO·[SUB].
  const subOn = conteudo.contrato?.is_subproject === true
  useEffect(() => {
    if (!codePrefix && !codeSeq && !codeYear) return
    let composed = `${codePrefix}${(codeSeq || '0').padStart(3, '0')}-${codeYear}`
    if (subOn && codeSub) composed += `-${codeSub.padStart(2, '0')}`
    setD(dd => (dd && dd.codigo !== composed) ? { ...dd, codigo: composed } : dd)
  }, [codePrefix, codeSeq, codeYear, codeSub, subOn])
  // Projetos PAI elegíveis (mesmo cliente, ativos) p/ vincular o subprojeto.
  useEffect(() => {
    const cid = d?.customer?.id
    if (!subOn || !cid) { setParentProjects([]); return }
    api.get<any>(`/projects?customer_id=${cid}&parent_projects_only=true&pageSize=100`)
      .then(r => setParentProjects(((r?.items ?? r?.data ?? []) as any[])
        .filter(p => !['paused', 'finished', 'cancelled'].includes(p.status))
        .map(p => ({ id: p.id, name: `${p.code} — ${p.name}`, code: String(p.code ?? '') }))))
      .catch(() => setParentProjects([]))
  }, [subOn, d?.customer?.id])
  // Subprojeto: o código HERDA do projeto pai (prefixo·seq·ano travados); só o -NN (filho) é editável.
  const parentLocked = subOn && !!conteudo.contrato?.parent_project_id
  useEffect(() => {
    if (!parentLocked) return
    const parent = parentProjects.find(p => String(p.id) === String(conteudo.contrato?.parent_project_id))
    const cm = String(parent?.code ?? '').match(/^([A-Za-z]+)(\d+)-(\d{2})/)
    if (!cm) return
    setCodePrefix(cm[1].toUpperCase())
    setCodeSeq(String(parseInt(cm[2], 10) || ''))
    setCodeYear(cm[3])
  }, [parentLocked, conteudo.contrato?.parent_project_id, parentProjects])
  // Próximo número do subprojeto (maior -NN dos filhos do pai + 1); só preenche se ainda vazio (não sobrescreve edição/load).
  useEffect(() => {
    const pid = conteudo.contrato?.parent_project_id
    const cid = d?.customer?.id
    if (!subOn || !pid || !cid) return
    api.get<any>(`/projects?customer_id=${cid}&pageSize=200`)
      .then(r => {
        const kids = ((r?.items ?? r?.data ?? []) as any[]).filter(p => String(p.parent_project_id) === String(pid))
        let max = 0
        for (const k of kids) { const m = String(k.code ?? '').match(/-(\d{1,2})$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
        setCodeSub(prev => prev || String(max + 1))
      }).catch(() => {})
  }, [subOn, conteudo.contrato?.parent_project_id, d?.customer?.id])

  // Prévia do e-mail (hooks ANTES de qualquer return condicional — Rules of Hooks).
  const fetchEmailPreview = useCallback(async (msg: string) => {
    if (!id) return
    setEmailPrevLoading(true)
    try {
      const r = await api.post<{ data: { html: string; mensagem_padrao: string; assunto_padrao: string; sugeridos: string[] } }>(
        `/crm/proposals/${id}/email-preview`, { mensagem: msg })
      const dt = r?.data
      setEmailHtml(dt?.html ?? '<p style="padding:16px">Sem prévia.</p>')
      if (!emailSeeded.current) {
        emailSeeded.current = true
        if (dt?.mensagem_padrao) setEmailMsg(dt.mensagem_padrao)
        if (dt?.assunto_padrao) setEmailSubject(dt.assunto_padrao)
        if (Array.isArray(dt?.sugeridos) && dt.sugeridos.length) setEmails(prev => prev.length ? prev : dt.sugeridos)
      }
    } catch { setEmailHtml('<p style="padding:16px">Erro ao gerar a prévia.</p>') }
    finally { setEmailPrevLoading(false) }
  }, [id])
  // ── Prévia do e-mail de ASSINATURA (template editável) ──
  const fetchAssinPreview = useCallback(async (msg: string) => {
    if (!id) return
    setAssinPrevLoading(true)
    try {
      const r = await api.post<{ data: { html: string; mensagem_padrao: string; assunto_padrao: string; signatarios: any[]; remetente: any } }>(
        `/crm/proposals/${id}/assinatura-email-preview`, { mensagem: msg })
      const dt = r?.data
      setAssinHtml(dt?.html ?? '<p style="padding:16px">Sem prévia.</p>')
      setAssinSigners(dt?.signatarios ?? [])
      setAssinSender(dt?.remetente ?? {})
      if (!assinSeeded.current) {
        assinSeeded.current = true
        if (dt?.mensagem_padrao) setAssinMsg(dt.mensagem_padrao)
        if (dt?.assunto_padrao) setAssinSubject(dt.assunto_padrao)
      }
    } catch { setAssinHtml('<p style="padding:16px">Erro ao gerar a prévia.</p>') }
    finally { setAssinPrevLoading(false) }
  }, [id])
  useEffect(() => {
    if (!assinOpen || !assinSeeded.current) return
    const t = setTimeout(() => { void fetchAssinPreview(assinMsg) }, 450)
    return () => clearTimeout(t)
  }, [assinMsg, assinOpen, fetchAssinPreview])
  // ── Prévia do e-mail de APROVAÇÃO (template editável) ──
  const fetchAprovPreview = useCallback(async (msg: string) => {
    if (!id) return
    setAprovPrevLoading(true)
    try {
      const r = await api.post<{ data: { html: string; mensagem_padrao: string; assunto_padrao: string; aprovadores: any[]; remetente: any } }>(
        `/crm/proposals/${id}/aprovacao-email-preview`, { mensagem: msg })
      const dt = r?.data
      setAprovHtml(dt?.html ?? '<p style="padding:16px">Sem prévia.</p>')
      setAprovAprovadores(dt?.aprovadores ?? [])
      setAprovSender(dt?.remetente ?? {})
      if (!aprovSeeded.current) {
        aprovSeeded.current = true
        if (dt?.mensagem_padrao) setAprovMsg(dt.mensagem_padrao)
        if (dt?.assunto_padrao) setAprovSubject(dt.assunto_padrao)
      }
    } catch { setAprovHtml('<p style="padding:16px">Erro ao gerar a prévia.</p>') }
    finally { setAprovPrevLoading(false) }
  }, [id])
  useEffect(() => {
    if (!aprovOpen || !aprovSeeded.current) return
    const t = setTimeout(() => { void fetchAprovPreview(aprovMsg) }, 450)
    return () => clearTimeout(t)
  }, [aprovMsg, aprovOpen, fetchAprovPreview])
  // Atualiza a prévia ao vivo conforme edita a mensagem (debounce 450ms).
  useEffect(() => {
    if (!composeOpen || !emailSeeded.current) return
    const t = setTimeout(() => { void fetchEmailPreview(emailMsg) }, 450)
    return () => clearTimeout(t)
  }, [emailMsg, composeOpen, fetchEmailPreview])

  // Revisões do cliente — carregadas p/ exibir na tela de edição. (Hooks ANTES do early-return.)
  const carregarRevs = useCallback(async () => {
    try { const r = await api.get<{ data: any[] }>(`/crm/proposals/${id}/threads`); setRevs(r?.data ?? []) } catch { /* noop */ }
  }, [id])
  useEffect(() => { if (!isTemplate && id) void carregarRevs() }, [id, isTemplate, carregarRevs])
  const carregarParts = useCallback(async () => {
    try {
      const [rp, rc] = await Promise.all([
        api.get<{ data: any[] }>(`/crm/proposals/${id}/participantes`),
        api.get<{ data: any[] }>(`/crm/proposals/${id}/caderno-cliente`).catch(() => ({ data: [] })),
      ])
      setParts((rp?.data ?? []).filter((x: any) => x.is_active !== false)); setCaderno(rc?.data ?? [])
    } catch { /* noop */ }
  }, [id])
  useEffect(() => { if (!isTemplate && id) void carregarParts() }, [id, isTemplate, carregarParts])

  if (!d) return <AppLayout><div className="p-6" style={{ color: 'var(--text-muted)' }}>Carregando…</div></AppLayout>

  const setInput = (k: string, v: any) => setInputs(p => ({ ...p, [k]: v }))
  const setCont = (sec: string, k: string, v: any) => setConteudo(p => ({ ...p, [sec]: { ...(p[sec] || {}), [k]: v } }))
  const calc = preview?.calc || d.calc || {}

  // Gate 2.1 — Cat B (espera servidor): useAsyncAction (pending/running + apiMessage), sem loading manual.
  const salvarAction = useAsyncAction(async () => {
    if (isTemplate) {
      await api.put(`/crm/proposal-templates/${tplTipo}`, { conteudo, inputs, modo_faturamento: modoFat }); toast.success('Template salvo'); refreshPreview(); return
    }
    if (codigoDup) { toast.error('Código já usado em outra proposta. Altere antes de salvar.'); return }
    await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, codigo: d.codigo, data_emissao: d.data_emissao, data_validade: d.data_validade, tipo: d.tipo, modo_faturamento: modoFat })
    toast.success('Proposta salva'); refreshPreview()
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao salvar')) })
  const salvar = () => salvarAction.run()
  // TEMPLATES (1 por tipo, globais). Salva conteudo+inputs do tipo atual; aplicar ao escolher o tipo.
  const salvarTemplateAction = useAsyncAction(async () => {
    const lbl = TIPOS.find(t => t.v === tipo)?.label ?? tipo
    if (!window.confirm(`Salvar a configuração atual como TEMPLATE de "${lbl}"? Substitui o template anterior desse tipo (global).`)) return
    await api.put(`/crm/proposal-templates/${tipo}`, { conteudo, inputs, modo_faturamento: modoFat })
    toast.success(`Template de "${lbl}" salvo.`)
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao salvar template')) })
  const salvarTemplate = () => salvarTemplateAction.run()
  const aplicarTemplate = async (nt: string) => {
    const lbl = TIPOS.find(t => t.v === nt)?.label ?? nt
    const tpl = await api.get<{ data: any }>(`/crm/proposal-templates/${nt}`).then(r => r?.data).catch(() => null)
    if (!tpl?.salvo) return
    if (!window.confirm(`Existe um template salvo de "${lbl}". Aplicar? Isso substitui escopo/investimento/prazo/memória atuais (mantém cliente, código e logo).`)) return
    if (tpl.inputs) setInputs({ ...tpl.inputs })
    if (tpl.modo_faturamento) setD(dd => dd ? { ...dd, modo_faturamento: tpl.modo_faturamento } : dd)
    if (tpl.conteudo) setConteudo(p => ({ ...tpl.conteudo, logo_attachment_id: p.logo_attachment_id, contrato: { ...(tpl.conteudo.contrato || {}), is_subproject: p.contrato?.is_subproject, parent_project_id: p.contrato?.parent_project_id, sera_faturado: p.contrato?.sera_faturado } }))
    toast.success(`Template de "${lbl}" aplicado.`)
  }
  const gerarPdf = async () => {
    if (codigoDup) { toast.error('Código já usado em outra proposta. Altere antes de gerar.'); return }
    setGerando(true)
    try {
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, codigo: d.codigo, data_emissao: d.data_emissao, data_validade: d.data_validade, tipo: d.tipo, modo_faturamento: modoFat })
      const r = await api.post<{ data: { document_id: number } }>(`/crm/proposals/${id}/gerar`, {})
      if (r?.data?.document_id) window.open(`/api/v1/documents/${r.data.document_id}/download`, '_blank')
      toast.success('PDF gerado')
    } catch { toast.error('Erro ao gerar PDF') } finally { setGerando(false) }
  }

  // P-E.2.x — abre o compositor de e-mail de assinatura (template editável + prévia; remetente = você).
  const enviarAssinatura = async () => {
    const apvs = parts.filter((p: any) => (p.roles ?? []).includes('approver'))
    const aprovacaoPendente = apvs.length > 0 && !apvs.every((p: any) => p.approved)
    setAssinForcar(aprovacaoPendente)
    assinSeeded.current = false
    setAssinHtml(null); setAssinOpen(true)
    try { await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, codigo: d?.codigo, data_emissao: d?.data_emissao, data_validade: d?.data_validade, tipo: d?.tipo, modo_faturamento: modoFat }) } catch { /* prévia ainda funciona */ }
    void fetchAssinPreview('')
  }
  const confirmarEnviarAssinaturaAction = useAsyncAction(async () => {
    const r = await api.post<{ data: { stub?: boolean; email_falhas?: string[] } }>(`/crm/proposals/${id}/enviar-assinatura`, { mensagem: assinMsg, assunto: assinSubject, forcar: assinForcar })
    const falhas = r?.data?.email_falhas ?? []
    toast.success(r?.data?.stub ? 'Enviado (modo simulação — Clicksign não configurado)' : 'Proposta enviada para assinatura')
    if (falhas.length) toast.error(`Falha ao enviar e-mail para: ${falhas.join(', ')}`)
    setD(dd => dd ? { ...dd, status: 'aguardando_assinatura' } : dd)
    setAssinOpen(false)
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao enviar para assinatura')) })
  const confirmarEnviarAssinatura = () => confirmarEnviarAssinaturaAction.run()
  // P-E.2.3 — abre o compositor de e-mail de aprovação (template editável + prévia; remetente = você).
  const solicitarAprovacao = async () => {
    aprovSeeded.current = false
    setAprovHtml(null); setAprovOpen(true)
    try { await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, codigo: d?.codigo, data_emissao: d?.data_emissao, data_validade: d?.data_validade, tipo: d?.tipo, modo_faturamento: modoFat }) } catch { /* prévia ainda funciona */ }
    void fetchAprovPreview('')
  }
  const confirmarSolicitarAprovacaoAction = useAsyncAction(async () => {
    const r = await api.post<{ data: { status: string; email_falhas?: string[] } }>(`/crm/proposals/${id}/solicitar-aprovacao`, { mensagem: aprovMsg, assunto: aprovSubject })
    const falhas = r?.data?.email_falhas ?? []
    toast.success('Aprovação solicitada')
    if (falhas.length) toast.error(`Falha ao enviar e-mail para: ${falhas.join(', ')}`)
    setD(dd => dd ? { ...dd, status: r?.data?.status ?? dd.status } : dd)
    setAprovOpen(false)
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const confirmarSolicitarAprovacao = () => confirmarSolicitarAprovacaoAction.run()
  const reenviarAssinAction = useAsyncAction(async () => {
    if (!window.confirm('Reenviar a solicitação de assinatura aos pendentes?')) return
    await api.post(`/crm/proposals/${id}/reenviar-assinatura`, {}); toast.success('Solicitação de assinatura reenviada')
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const reenviarAssin = () => reenviarAssinAction.run()
  const copiarLinkAssin = async () => {
    // Fluxo nativo: copia o LINK DO PORTAL do assinante pendente (onde ele assina no Minutor).
    const pend = parts.find((p: any) => (p.roles ?? []).includes('signer') && !p.signed && p.link)
    if (pend?.link) { try { await navigator.clipboard.writeText(pend.link); toast.success(`Link do portal de ${pend.name} copiado`) } catch { toast.error('Não foi possível copiar') } }
    else toast.error('Nenhum link de assinatura pendente disponível')
  }
  const cancelarAssinAction = useAsyncAction(async () => {
    if (!window.confirm('Cancelar a assinatura? A proposta volta para Aprovada e poderá gerar uma nova versão.')) return
    const r = await api.post<{ data: { status: string } }>(`/crm/proposals/${id}/cancelar-assinatura`, {}); toast.success('Assinatura cancelada'); setD(dd => dd ? { ...dd, status: r?.data?.status ?? 'aprovada' } : dd)
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const cancelarAssin = () => cancelarAssinAction.run()
  // Sync MANUAL do envelope Clicksign (1 clique = 1 checagem; não é polling automático — ver §17).
  const sincronizarAssinAction = useAsyncAction(async () => {
    const r = await api.post<{ data: { status_proposta: string; envelope_status: string; finalizou: boolean } }>(`/crm/proposals/${id}/sincronizar-assinatura`, {})
    toast.success(r?.data?.finalizou ? 'Assinatura concluída — documento capturado' : `Status no Clicksign: ${r?.data?.envelope_status ?? '—'}`)
    setD(dd => dd ? { ...dd, status: r?.data?.status_proposta ?? dd.status } : dd)
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao sincronizar')) })
  const sincronizarAssin = () => sincronizarAssinAction.run()
  // funcao = papel principal do grupo; tambem = papel extra (assinante que valida / validador que assina) → papel combinado.
  const addPartAction = useAsyncAction(async (funcao: 'validar' | 'assinar', parte: 'contratante' | 'contratada' | undefined, dados: { name: string; email: string; cargo: string; tambem?: boolean; tambemParte?: 'contratante' | 'contratada' }) => {
    if (!dados.name.trim() || !dados.email.trim()) { toast.error('Informe nome e e-mail.'); return }
    let roles: string[]; let parteFinal: string | null
    if (funcao === 'assinar') { roles = dados.tambem ? ['signer', 'reviewer', 'approver'] : ['signer']; parteFinal = parte ?? null }
    else { roles = dados.tambem ? ['reviewer', 'approver', 'signer'] : ['reviewer', 'approver']; parteFinal = dados.tambem ? (dados.tambemParte ?? 'contratante') : null }
    await api.post(`/crm/proposals/${id}/participantes`, { name: dados.name.trim(), email: dados.email.trim(), cargo: dados.cargo.trim(), roles, parte: parteFinal })
    toast.success('Participante adicionado — convite enviado'); await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const addPart = (funcao: 'validar' | 'assinar', parte: 'contratante' | 'contratada' | undefined, dados: { name: string; email: string; cargo: string; tambem?: boolean; tambemParte?: 'contratante' | 'contratada' }) => addPartAction.run(funcao, parte, dados)
  // Remoção GRANULAR: tira só os papéis do grupo; se sobrar papel, mantém o participante; senão desativa.
  const removeRoleAction = useAsyncAction(async (x: any, grupo: 'validar' | 'assinar') => {
    const tirar = grupo === 'validar' ? ['reviewer', 'approver'] : ['signer']
    const restante = (x.roles ?? []).filter((r: string) => !tirar.includes(r))
    if (restante.length === 0 && !window.confirm(`Remover ${x.name} da proposta?`)) return
    if (restante.length === 0) await api.delete(`/crm/proposals/${id}/participantes/${x.id}`)
    else await api.put(`/crm/proposals/${id}/participantes/${x.id}`, { roles: restante })
    await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const removeRole = (x: any, grupo: 'validar' | 'assinar') => removeRoleAction.run(x, grupo)
  // P-E.2.4 — assinatura da Contratada pelo editor + reuso do perfil salvo por e-mail.
  // Contratada assina via CLICKSIGN EMBEDADO (igual ao cliente) — código digitado dentro do Minutor.
  const abrirAssinarContratadaAction = useAsyncAction(async (x: any) => {
    const r = await api.post<{ data: { sign_url?: string; stub?: boolean; ja_assinou?: boolean; por_email?: boolean; email?: string } }>(`/crm/proposals/${id}/participantes/${x.id}/clicksign`, {})
    if (r?.data?.ja_assinou) { await carregarParts(); return }
    if (r?.data?.por_email) { setEnviadoInfo({ nome: x.name ?? '', email: r.data.email ?? x.email ?? '' }); await carregarParts(); return }
    if (r?.data?.stub || !r?.data?.sign_url) {
      // Clicksign em simulação → assinatura nativa (fallback)
      let perfil: any = null
      try { const pr = await api.get<{ data: any }>(`/crm/signature-profile?email=${encodeURIComponent(x.email)}`); perfil = pr?.data ?? null } catch { /* noop */ }
      setSignPart({ part: x, perfil })
    } else {
      setClickUrl(r.data.sign_url) // abre o widget embedado no editor
    }
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao iniciar a assinatura')) })
  const abrirAssinarContratada = (x: any) => abrirAssinarContratadaAction.run(x)
  const assinarContratadaAction = useAsyncAction(async (dados?: { nome?: string; cpf?: string; cargo?: string; imagem?: string }) => {
    const x = signPart?.part; if (!x) return
    await api.post(`/crm/proposals/${id}/participantes/${x.id}/assinar`, dados ?? {})
    toast.success('Assinatura registrada'); setSignPart(null); await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao assinar')) })
  const assinarContratada = (dados?: { nome?: string; cpf?: string; cargo?: string; imagem?: string }) => assinarContratadaAction.run(dados)
  const salvarEdicaoPartAction = useAsyncAction(async () => {
    if (!editPart) return
    if (!editPart.name.trim()) { toast.error('Informe o nome.'); return }
    await api.put(`/crm/proposals/${id}/participantes/${editPart.id}`, { name: editPart.name.trim(), cargo: editPart.cargo.trim(), cpf: editPart.cpf.trim() })
    toast.success('Dados atualizados'); setEditPart(null); await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const salvarEdicaoPart = () => salvarEdicaoPartAction.run()
  const verComprovante = async (x: any) => {
    try { const r = await api.get<{ data: any }>(`/crm/proposals/${id}/participantes/${x.id}/comprovante`); setComprovante(r?.data ?? null) }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao carregar o registro') }
  }
  const incluirDoCadernoAction = useAsyncAction(async (s: any) => {
    await api.post(`/crm/proposals/${id}/participantes`, { name: s.name, email: s.email, cargo: s.cargo, roles: s.roles, parte: s.parte }); toast.success(`${s.name} incluído`); await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const incluirDoCaderno = (s: any) => incluirDoCadernoAction.run(s)
  const excluirDoCadernoAction = useAsyncAction(async (sid: number) => {
    if (!window.confirm('Remover este participante do caderno do cliente? (não afeta esta proposta)')) return
    await api.delete(`/crm/customer-signers/${sid}`); await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const excluirDoCaderno = (sid: number) => excluirDoCadernoAction.run(sid)
  const importarCadernoAction = useAsyncAction(async () => {
    const r = await api.post<{ data: { incluidos: number } }>(`/crm/proposals/${id}/importar-caderno`, {}); toast.success(`${r?.data?.incluidos ?? 0} participante(s) incluído(s)`); await carregarParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const importarCaderno = () => importarCadernoAction.run()
  const setModoAssinaturaAction = useAsyncAction(async (modo: string) => {
    await api.put(`/crm/proposals/${id}/editar`, { assinatura_modo: modo }); setD(dd => dd ? { ...dd, assinatura_modo: modo } : dd); toast.success('Modo de assinatura atualizado')
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const setModoAssinatura = (modo: string) => setModoAssinaturaAction.run(modo)
  // Estados de loading DERIVADOS do .pending das ações (cross-disable preservado; JSX intacto).
  const enviandoAssin = confirmarEnviarAssinaturaAction.pending
  const aprovSending = confirmarSolicitarAprovacaoAction.pending
  const partBusy = addPartAction.pending || abrirAssinarContratadaAction.pending || assinarContratadaAction.pending || salvarEdicaoPartAction.pending || incluirDoCadernoAction.pending || importarCadernoAction.pending
  const validadores = parts.filter(p => (p.roles ?? []).some((r: string) => r === 'reviewer' || r === 'approver'))
  const assinantes = (parte: string) => parts.filter(p => (p.roles ?? []).includes('signer') && p.parte === parte)

  // ── Envio por e-mail ──────────────────────────────────────────────────────
  const abrirEnvio = async () => {
    if (codigoDup) { toast.error('Código já usado em outra proposta. Altere antes de enviar.'); return }
    emailSeeded.current = false
    setEmailHtml(null); setComposeOpen(true)
    try {
      // Salva os ajustes atuais para que a prévia e o PDF anexado batam com a tela.
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, codigo: d?.codigo, data_emissao: d?.data_emissao, data_validade: d?.data_validade, tipo: d?.tipo, modo_faturamento: modoFat })
    } catch { /* prévia ainda funciona com o estado salvo anterior */ }
    void fetchEmailPreview('')
  }

  const addEmail = () => {
    const e = emailInput.trim().replace(/[,;]+$/, '')
    if (!e) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    if (!emails.includes(e)) setEmails([...emails, e])
    setEmailInput('')
  }
  const enviarEmail = async () => {
    if (!emails.length) { toast.error('Informe ao menos um destinatário'); return }
    setSending(true)
    try {
      const r = await api.post<{ success: boolean; message: string }>(`/crm/proposals/${id}/enviar-email`, {
        emails, mensagem: emailMsg, assunto: emailSubject,
      })
      toast.success(r?.message ?? 'Proposta enviada')
      setComposeOpen(false)
    } catch (e: any) { toast.error(e?.message ?? 'Falha ao enviar o e-mail') }
    finally { setSending(false) }
  }

  // ── Engajamento / Portal ──
  const carregarEng = async () => {
    try { const r = await api.get<{ data: any }>(`/crm/proposals/${id}/engajamento`); setEng(r?.data ?? null) } catch { /* noop */ }
  }
  const abrirEngajamento = async () => {
    setEngOpen(true); setEngLoading(true)
    try {
      const [e, a] = await Promise.all([
        api.get<{ data: any }>(`/crm/proposals/${id}/engajamento`),
        api.get<{ data: any }>(`/crm/proposals/${id}/analytics`),
      ])
      setEng(e?.data ?? null); setAna(a?.data ?? null)
    } catch { toast.error('Erro ao carregar engajamento') } finally { setEngLoading(false) }
  }
  const copiar = async (url: string) => { try { await navigator.clipboard.writeText(url); toast.success('Link copiado') } catch { toast.error('Não foi possível copiar') } }
  const gerarLink = async () => {
    if (codigoDup) { toast.error('Código duplicado — ajuste antes de gerar o link.'); return }
    setLinkBusy(true)
    try {
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, codigo: d?.codigo, data_emissao: d?.data_emissao, data_validade: d?.data_validade, tipo: d?.tipo, modo_faturamento: modoFat })
      const r = await api.post<{ data: { url: string } }>(`/crm/proposals/${id}/share`, {})
      if (r?.data?.url) await copiar(r.data.url)
      await carregarEng()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao gerar o link') } finally { setLinkBusy(false) }
  }
  const revogarLink = async (sid: number) => {
    if (!window.confirm('Revogar este link? O cliente não conseguirá mais acessar a proposta por ele.')) return
    try { await api.post(`/crm/proposals/${id}/shares/${sid}/revoke`, {}); toast.success('Link revogado'); await carregarEng() }
    catch { toast.error('Erro ao revogar') }
  }

  // ── Revisões do cliente — responder + resolver (carregarRevs declarado acima do early-return) ──
  const responderRev = async (tid: number) => {
    const txt = (revReply[tid] ?? '').trim(); if (!txt) return
    setRevBusy(true)
    try { await api.post(`/crm/proposals/${id}/threads/${tid}/mensagens`, { message: txt }); setRevReply(s => ({ ...s, [tid]: '' })); toast.success('Resposta enviada'); await carregarRevs() }
    catch (e: any) { toast.error(e?.message ?? 'Erro') } finally { setRevBusy(false) }
  }
  const resolverRev = async (tid: number) => {
    if (!window.confirm('Marcar esta revisão como resolvida?')) return
    setRevBusy(true)
    try { await api.post(`/crm/proposals/${id}/threads/${tid}/resolver`, {}); toast.success('Revisão resolvida'); await carregarRevs() }
    catch (e: any) { toast.error(e?.message ?? 'Erro') } finally { setRevBusy(false) }
  }

  // ── Liberação Operacional (Proposal-Centric): checklist → liberar → gerar projeto ──
  const carregarLib = async () => {
    try { const r = await api.get<{ data: any }>(`/crm/proposals/${id}/liberacao`); setLib(r?.data ?? null) } catch { /* noop */ }
  }
  const abrirLiberacao = async () => {
    setLibOpen(true); setLibLoading(true)
    try { const r = await api.get<{ data: any }>(`/crm/proposals/${id}/liberacao`); setLib(r?.data ?? null) }
    catch { toast.error('Erro ao carregar liberação') } finally { setLibLoading(false) }
  }
  const marcarItemLib = async (item_key: string, checked: boolean) => {
    try { await api.post(`/crm/proposals/${id}/checklist`, { item_key, checked }); await carregarLib() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao marcar item') }
  }
  const liberar = async () => {
    const obs = window.prompt('Observação da liberação (opcional):') ?? ''
    setLibBusy(true)
    try { await api.post(`/crm/proposals/${id}/liberar`, { observacao: obs }); toast.success('Proposta liberada para execução'); setD(dd => dd ? { ...dd, status: 'liberado_execucao' } : dd); await carregarLib() }
    catch (e: any) { toast.error(e?.message ?? 'Falha ao liberar') } finally { setLibBusy(false) }
  }
  const gerarProjeto = async () => {
    if (!window.confirm(`Gerar o Projeto a partir desta proposta liberada?\n\nO projeto herda o MESMO código ${d?.codigo} (sem novo contrato individual), cliente, valor, horas e escopo.`)) return
    setLibBusy(true)
    try {
      const r = await api.post<{ data: { code: string } }>(`/crm/proposals/${id}/gerar-projeto`, {})
      toast.success(`Projeto ${r?.data?.code ?? d?.codigo} gerado.`)
      setD(dd => dd ? { ...dd, status: 'convertida' } : dd); await carregarLib()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao gerar projeto') } finally { setLibBusy(false) }
  }
  const bloquearLib = async () => {
    const motivo = window.prompt('Motivo do bloqueio operacional:')
    if (!motivo?.trim()) return
    try { await api.post(`/crm/proposals/${id}/bloquear`, { motivo: motivo.trim() }); toast.success('Proposta bloqueada'); await carregarLib() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao bloquear') }
  }
  const desbloquearLib = async () => {
    if (!window.confirm('Remover o bloqueio operacional?')) return
    try { await api.post(`/crm/proposals/${id}/desbloquear`, {}); toast.success('Bloqueio removido'); await carregarLib() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao desbloquear') }
  }
  const uploadLogo = async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await api.post<{ data: { logo_attachment_id: number } }>(`/crm/proposals/${id}/logo`, fd)
      if (r?.data?.logo_attachment_id) { setConteudo(p => ({ ...p, logo_attachment_id: r.data.logo_attachment_id })); toast.success('Logo enviado') }
    } catch { toast.error('Erro no upload do logo') }
  }
  // Ajuste de posição/tamanho do logo na capa (conteudo.logo).
  const logoOffX = Number(conteudo.logo?.offset_x ?? 0)
  const logoOffY = Number(conteudo.logo?.offset_y ?? 0)
  const logoEsc = Number(conteudo.logo?.escala ?? 100)
  const setLogoCfg = (patch: Record<string, number>) => setConteudo(p => ({ ...p, logo: { ...(p.logo || {}), ...patch } }))

  // "Horas sob demanda": texto livre + atalhos p/ trocar só o valor e o dia + liga/desliga.
  // Sob demanda: tem 2 valores (R$/hora + dia do pagamento). Reconstrói a frase a partir de template fixo
  // (idêntico ao $def do backend) — robusto: nunca trava ao limpar/editar (era a causa do "não consigo digitar").
  const SOB_TXT = (valor: string, dia: string) => `Caso a contratante queira utilizar demais serviços da contratada ou ultrapassar as horas contratadas, será cobrado R$ ${valor}/hora dentro do horário comercial, com fechamentos mensais e pagamento até dia ${dia} do mês subsequente.`
  const sobText: string = conteudo.investimento?.sob_demanda ?? ''
  const sobOn = conteudo.investimento?.sob_demanda_on !== false
  const setSob = (t: string) => setCont('investimento', 'sob_demanda', t)
  const curValor = sobText.match(/R\$\s*([\d.,]+)/)?.[1] ?? ''
  const curDia = sobText.match(/dia\s*(\d{1,2})/i)?.[1] ?? ''
  const setSobValor = (v: string) => setSob(SOB_TXT(v, curDia || '10'))
  const setSobDia = (dia: string) => setSob(SOB_TXT(curValor || '190,00', dia))

  // Despesas SP / fora e Prazo: o editor edita só o VALOR/NÚMERO. O texto é RECONSTRUÍDO a partir de um
  // template fixo (idêntico ao default do backend) — robusto: nunca "perde a âncora" do regex ao limpar/editar
  // (era a causa de não conseguir digitar e de corromper o texto: "R$,", "250FFV", "em até  dias úteis").
  const SP_TXT = (v: string) => `Será cobrado R$${v} por visita/consultor, para suprir as despesas com alimentação, estacionamento, traslado, combustível, pedágios.`
  const FORA_TXT = (v: string) => `Será cobrado R$${v} por visita/consultor, para suprir as despesas com alimentação, estacionamento, traslado, combustível, pedágios. Despesas como passagem aérea/km e hospedagem deverão ser custeadas pela contratante.`
  const INICIO_TXT = (n: string) => `O atendimento será iniciado em até ${n} dias úteis após a data de assinatura da proposta.`
  const PAGDESP_TXT = (n: string) => `Todas as despesas reembolsáveis serão cobradas via nota de débito no dia ${n} do mês posterior ao mês de prestação dos serviços.`
  const extraiValor = (t: string) => t.match(/R\$\s*([\d.,]+?)\s*por/i)?.[1] ?? t.match(/R\$\s*([\d.,]+)/)?.[1] ?? ''

  const spText: string = conteudo.investimento?.despesas_sp ?? ''
  const spOn = conteudo.investimento?.despesas_sp_on !== false
  const spContrato = conteudo.investimento?.despesas_sp_contrato !== false
  const spValor = extraiValor(spText)
  const setSpValor = (v: string) => setCont('investimento', 'despesas_sp', SP_TXT(v))
  const foraText: string = conteudo.investimento?.despesas_fora ?? ''
  const foraOn = conteudo.investimento?.despesas_fora_on !== false
  const foraValor = extraiValor(foraText)
  const setForaValor = (v: string) => setCont('investimento', 'despesas_fora', FORA_TXT(v))

  // Prazo e Pagamento: textos fixos onde só o NÚMERO edita (início/pagamento/parcelas) + 2 campos livres (valor %/vencimento).
  const inicioText: string = conteudo.prazo?.inicio_atendimento ?? ''
  const inicioDias = inicioText.match(/(\d{1,3})\s*dias/i)?.[1] ?? ''
  const setInicioDias = (n: string) => setCont('prazo', 'inicio_atendimento', INICIO_TXT(n))
  const despDiaText: string = conteudo.prazo?.pagamento_despesas ?? ''
  const despDia = despDiaText.match(/dia\s+(\d{1,2})/i)?.[1] ?? ''
  const setDespDia = (n: string) => setCont('prazo', 'pagamento_despesas', PAGDESP_TXT(n))
  const parcelasText: string = conteudo.prazo?.parcelas ?? ''
  const parcelasNum = parcelasText.match(/(\d+)/)?.[1] ?? ''
  const setParcelasNum = (n: string) => setCont('prazo', 'parcelas', `${n}x`)

  // Páginas: liga/desliga por página (conteudo.paginas_off = índices a NÃO enviar na proposta).
  const pageLabels = PAGE_LABELS[d.tipo] || PAGE_LABELS.bh_fixo
  const pagesOff: number[] = Array.isArray(conteudo.paginas_off) ? conteudo.paginas_off : []
  const setPageOn = (idx: number, on: boolean) => setConteudo(p => {
    const cur = new Set<number>(Array.isArray(p.paginas_off) ? p.paginas_off : [])
    if (on) cur.delete(idx); else cur.add(idx)
    return { ...p, paginas_off: Array.from(cur).sort((a, b) => a - b) }
  })

  // ─── Escopo funcional: blocos ordenados (texto/imagem) que fluem e paginam no PDF ───
  const escopoBlocks: EscopoBlock[] = Array.isArray(conteudo.escopo?.blocks)
    ? conteudo.escopo.blocks
    : (conteudo.escopo?.escopo_funcional ? [{ tipo: 'texto', conteudo: conteudo.escopo.escopo_funcional }] : [])
  const setBlocks = (next: EscopoBlock[]) => setCont('escopo', 'blocks', next)
  const addTextBlock = () => setBlocks([...escopoBlocks, { tipo: 'texto', conteudo: '' }])
  const addTituloBlock = () => setBlocks([...escopoBlocks, { tipo: 'titulo', conteudo: '', alinhamento: 'left' }])
  const updateBlock = (i: number, patch: Partial<EscopoBlock>) => setBlocks(escopoBlocks.map((b, j) => j === i ? { ...b, ...patch } as EscopoBlock : b))
  const removeBlock = (i: number) => setBlocks(escopoBlocks.filter((_, j) => j !== i))
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= escopoBlocks.length) return
    const next = [...escopoBlocks];[next[i], next[j]] = [next[j], next[i]]; setBlocks(next)
  }
  const uploadEscopoImage = async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await api.post<{ data: { attachment_id: number } }>(`/crm/proposals/${id}/escopo-image`, fd)
      if (r?.data?.attachment_id) {
        setBlocks([...escopoBlocks, { tipo: 'imagem', attachment_id: r.data.attachment_id, largura: 80, alinhamento: 'center', legenda: '' }])
        toast.success('Imagem adicionada ao escopo')
      }
    } catch { toast.error('Erro no upload da imagem') }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-0px)]">
        {/* topo */}
        <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => d.opportunity_id ? router.push(`/crm/pipeline?opp=${d.opportunity_id}`) : router.back()} title="Voltar" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={18} /></button>
          <div className="flex-1">
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>
              {isTemplate ? <>Template <span style={{ color: 'var(--primary)' }}>{TIPOS.find(t => t.v === tipo)?.label ?? tipo}</span></> : <>Proposta <span style={{ color: 'var(--primary)' }}>{d.codigo || `#${d.id}`}</span></>}
              {!isTemplate && <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-light)' }}>v{d.versao} · {d.status?.replace(/_/g, ' ')}</span>}
              {isTemplate && <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-light)' }}>global · edição de template</span>}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{isTemplate ? 'Sem cliente/código — só a configuração padrão' : `${d.customer?.name} · ${TIPOS.find(t => t.v === tipo)?.label}`}</p>
          </div>
          {!isTemplate && <button onClick={salvarTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Salvar a configuração atual como template deste tipo (global)">💾 Salvar template</button>}
          {(() => {
            // Proposta em assinatura / assinada / liberada / convertida é READ-ONLY (regra jurídica) — Save travado.
            const travada = !isTemplate && ['aguardando_assinatura', 'assinada', 'liberada', 'convertida'].includes(d.status)
            return <button onClick={salvar} disabled={salvarAction.pending || travada} title={travada ? 'Proposta assinada/em assinatura não pode ser editada. Cancele a assinatura para gerar nova versão.' : ''} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: isTemplate ? 'var(--primary)' : 'var(--surface-sunken)', color: isTemplate ? 'var(--primary-fg)' : 'var(--text)' }}>{travada ? <Lock size={14} /> : <Save size={14} />}{salvarAction.running ? 'Salvando…' : (travada ? 'Bloqueado (assinada)' : (isTemplate ? 'Salvar template' : 'Salvar'))}</button>
          })()}
          {!isTemplate && <button onClick={gerarPdf} disabled={gerando} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}><FileDown size={14} />{gerando ? 'Gerando…' : 'Gerar PDF'}</button>}
          {!isTemplate && <button onClick={abrirEngajamento} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Engajamento do cliente + link do Portal"><Activity size={14} />Engajamento</button>}
          {!isTemplate && ['assinada', 'liberada', 'aprovada', 'aguardando_liberacao'].includes(d.status) && <button onClick={abrirLiberacao} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: 'var(--success)', color: '#fff' }} title="Liberação comercial → handoff para Serviços"><FileSignature size={14} />Liberação</button>}
          {/* P-E.2.3 — fluxo flexível: com aprovador pendente mostra "Solicitar Aprovação"; "Enviar p/ Assinatura" fica SEMPRE visível. */}
          {!isTemplate && (() => {
            const apvs = parts.filter((p: any) => (p.roles ?? []).includes('approver'))
            const temAprovador = apvs.length > 0
            const aprovacaoOk = !temAprovador || apvs.every((p: any) => p.approved)
            const temAssinante = parts.some((p: any) => (p.roles ?? []).includes('signer'))
            const terminais = ['assinada', 'liberada', 'convertida', 'reprovada', 'cancelada', 'expirada', 'aguardando_assinatura']
            if (terminais.includes(d.status)) return null
            const btnAssinatura = temAssinante
              ? <button onClick={enviarAssinatura} disabled={enviandoAssin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: '#16A34A', color: '#fff' }} title={temAprovador && !aprovacaoOk ? 'Enviar para assinatura (pula a aprovação pendente)' : 'Enviar para assinatura via Clicksign'}><FileSignature size={14} />{enviandoAssin ? 'Enviando…' : '✍ Enviar p/ Assinatura'}</button>
              : <button onClick={() => { setOpen({ assinatura: true }); document.getElementById('sec-assinatura')?.scrollIntoView({ behavior: 'smooth' }) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: '#16A34A', color: '#fff' }} title="Defina quem assina para enviar à assinatura"><FileSignature size={14} />✍ Enviar p/ Assinatura</button>
            return <>
              {temAprovador && !aprovacaoOk && <button onClick={solicitarAprovacao} disabled={enviandoAssin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: '#2563EB', color: '#fff' }} title="Solicitar aprovação aos aprovadores"><CheckCircle2 size={14} />{enviandoAssin ? '…' : '📋 Solicitar Aprovação'}</button>}
              {btnAssinatura}
            </>
          })()}
          {!isTemplate && d.status === 'aguardando_assinatura' && <>
            <button onClick={reenviarAssin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Reenviar a solicitação de assinatura"><Mail size={14} />Reenviar</button>
            <button onClick={copiarLinkAssin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Copiar o link de assinatura do pendente"><Copy size={14} />Copiar link</button>
            <button onClick={sincronizarAssin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Buscar status no Clicksign (sem esperar o webhook)">↻ Sincronizar</button>
            <button onClick={cancelarAssin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} title="Cancelar assinatura (libera nova versão)"><X size={14} />Cancelar assinatura</button>
          </>}
          {!isTemplate && d.status === 'convertida' && <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--success-bg)', color: 'var(--success)' }} title="Convertida em contrato (Serviços)"><CheckCircle2 size={14} />Convertida</span>}
        </div>

        {/* ── REVISÕES DO CLIENTE — constam na tela de edição (responder + resolver aqui) ── */}
        {!isTemplate && revs.length > 0 && (() => {
          const pend = revs.filter(t => t.status !== 'resolvida')
          const STAT: Record<string, { l: string; c: string }> = { aberta: { l: 'Aberta', c: 'var(--warning)' }, respondida: { l: 'Respondida', c: 'var(--primary)' }, resolvida: { l: 'Resolvida', c: 'var(--success)' } }
          return (
            <div style={{ borderBottom: '1px solid var(--border)', background: pend.length ? 'var(--warning-bg)' : 'var(--surface-sunken)' }}>
              <button onClick={() => setRevOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2 text-sm font-bold" style={{ color: 'var(--text)' }}>
                <span>💬 Revisões do cliente {pend.length > 0 ? <span style={{ color: 'var(--danger)' }}>· {pend.length} pendente{pend.length > 1 ? 's' : ''}</span> : <span style={{ color: 'var(--success)' }}>· tudo resolvido</span>}</span>
                <span style={{ color: 'var(--text-muted)' }}>{revOpen ? '▾' : '▸'}</span>
              </button>
              {revOpen && (
                <div className="px-4 pb-3 space-y-2 max-h-[34vh] overflow-y-auto">
                  {revs.map(t => (
                    <div key={t.id} className="rounded-lg p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase mr-2" style={{ color: 'var(--text-light)' }}>{t.section_title}</span>
                          <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{t.subject}</span>
                        </div>
                        <span className="text-[10px] font-bold shrink-0" style={{ color: STAT[t.status]?.c ?? 'var(--text-muted)' }}>{STAT[t.status]?.l ?? t.status}</span>
                      </div>
                      {(t.opened_revision || t.resolved_revision) && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>{t.opened_revision ? `Aberta na v${String(t.opened_revision).padStart(2, '0')}` : ''}{t.resolved_revision ? ` · Resolvida na v${String(t.resolved_revision).padStart(2, '0')}` : ''}</div>}
                      <div className="mt-1.5 space-y-1">
                        {t.messages.map((m: any) => (
                          <div key={m.id} className="rounded px-2 py-1" style={{ background: m.is_internal ? 'var(--primary-soft)' : 'var(--surface-sunken)' }}>
                            <span className="text-[10px] font-bold mr-1.5" style={{ color: m.is_internal ? 'var(--primary)' : 'var(--text-muted)' }}>{m.author}:</span>
                            <span className="text-xs" style={{ color: 'var(--text)' }}>{m.message}</span>
                          </div>
                        ))}
                      </div>
                      {t.status !== 'resolvida' && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input value={revReply[t.id] ?? ''} onChange={e => setRevReply(s => ({ ...s, [t.id]: e.target.value }))} placeholder="Responder ao cliente…" className="flex-1 text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                          <button onClick={() => responderRev(t.id)} disabled={revBusy} className="text-xs font-bold px-2.5 py-1.5 rounded disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Enviar</button>
                          <button onClick={() => resolverRev(t.id)} disabled={revBusy} className="text-xs font-bold px-2.5 py-1.5 rounded disabled:opacity-60" style={{ background: 'var(--success)', color: '#fff' }}>✓</button>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Edite a seção correspondente abaixo e salve uma nova versão para atender a revisão.</p>
                </div>
              )}
            </div>
          )
        })()}

        <div className="flex flex-1 min-h-0">
          {/* FORM */}
          <div className="w-[380px] shrink-0 overflow-y-auto p-4" style={{ borderRight: '1px solid var(--border)' }}>
            <Section title="Identificação" open={open.ident} onToggle={() => toggleSection("ident")}>
              {!isTemplate && (<div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', ...fAccent('dados') }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Código do projeto</p>
                {(() => {
                  let preview = codePrefix ? `${codePrefix}${(codeSeq || '0').padStart(3, '0')}-${codeYear}` : (d.codigo ?? '')
                  if (subOn && codeSub && codePrefix) preview += `-${codeSub.padStart(2, '0')}`
                  const segStyle = { ...inputStyle, ...(codigoDup ? { borderColor: 'var(--danger)' } : {}) }
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center select-none" style={{ ...inputStyle, opacity: 0.5, minWidth: '4rem' }}>{codePrefix || '—'}</div>
                      <input type="text" inputMode="numeric" maxLength={3} placeholder="019" value={codeSeq} readOnly={parentLocked} onChange={e => setCodeSeq(e.target.value.replace(/\D/g, '').slice(0, 3))} className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none" style={{ ...segStyle, width: '5rem', ...(parentLocked ? { opacity: 0.5 } : {}) }} title={parentLocked ? 'Herdado do projeto pai' : ''} />
                      <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>-</span>
                      <input type="text" inputMode="numeric" maxLength={2} placeholder="26" value={codeYear} readOnly={parentLocked} onChange={e => setCodeYear(e.target.value.replace(/\D/g, '').slice(0, 2))} className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none" style={{ ...segStyle, width: '4rem', ...(parentLocked ? { opacity: 0.5 } : {}) }} title={parentLocked ? 'Herdado do projeto pai' : ''} />
                      {subOn && <>
                        <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>-</span>
                        <input type="text" inputMode="numeric" maxLength={2} placeholder="01" value={codeSub} onChange={e => setCodeSub(e.target.value.replace(/\D/g, '').slice(0, 2))} className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none" style={{ ...segStyle, width: '4rem' }} title="Subprojeto (filho)" />
                      </>}
                      <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: 'var(--surface)', color: codigoDup ? 'var(--danger)' : 'var(--text-muted)' }}>{preview}</span>
                      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>versão {d.versao}</span>
                    </div>
                  )
                })()}
                {codigoDup
                  ? <span className="block text-[10px] font-semibold mt-1" style={{ color: 'var(--danger)' }}>⚠ Código já usado em outra proposta. Altere para salvar.</span>
                  : parentLocked
                    ? <span className="block text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Código herdado do projeto pai — edite só o número do subprojeto (último campo, <b style={{ color: 'var(--text)' }}>-NN</b>).</span>
                    : <span className="block text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Sequência única do cliente (mesmo código do contrato/projeto ao converter). Duplicação validada ao digitar.</span>}
                {/* Subprojeto: vincula a um projeto pai; código ganha 2 dígitos (-NN); ao gerar o contrato nasce
                    em Início Autorizado + card de aporte no pai (valorado pelas horas × valor-hora). */}
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={subOn} onChange={e => { setCont('contrato', 'is_subproject', e.target.checked); if (!e.target.checked) { setCont('contrato', 'parent_project_id', ''); setCodeSub('') } }} style={{ accentColor: 'var(--primary)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>É subprojeto (filho de um projeto)</span>
                  </label>
                  {subOn && (
                    <div className="mt-2 space-y-2">
                      <label className="block">
                        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Projeto pai</span>
                        {parentProjects.length === 0
                          ? <p className="text-[11px] italic" style={{ color: 'var(--warning)' }}>Nenhum projeto pai disponível para este cliente.</p>
                          : <select value={String(conteudo.contrato?.parent_project_id ?? '')} onChange={e => { setCont('contrato', 'parent_project_id', e.target.value); setCodeSub('') }} className={fieldCls} style={inputStyle}>
                              <option value="">— selecionar projeto pai —</option>
                              {parentProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>}
                      </label>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nascendo via CRM, gera <b style={{ color: 'var(--text)' }}>card de aporte</b> no projeto pai (obrigatório).</p>
                    </div>
                  )}
                </div>
              </div>)}
              <label className="block">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo / template</span>
                <select value={d.tipo} onChange={e => { const nt = e.target.value; setD({ ...d, tipo: nt, modo_faturamento: 'por_hora' }); setConteudo(p => ({ ...p, card_texto: CARD_DEFAULTS[nt] ?? CARD_DEFAULTS.bh_fixo })); aplicarTemplate(nt) }} className={fieldCls} style={inputStyle}>
                  {TIPOS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo de Serviço</span>
                <select value={conteudo.contrato?.service_type_id ?? ''} onChange={e => setCont('contrato', 'service_type_id', e.target.value)} className={fieldCls} style={inputStyle}>
                  <option value="">— selecionar —</option>
                  {stOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {tipo === 'cloud' && (
                <label className="block" style={fAccent('capa_nome')}>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Nome na capa (abaixo de &quot;PROPOSTA COMERCIAL&quot;)</span>
                  <input value={conteudo.cloud?.capa_nome ?? ''} onChange={e => setConteudo(p => ({ ...p, cloud: { ...(p.cloud || {}), capa_nome: e.target.value } }))} placeholder="Vazio = CLOUD PROTHEUS" className={fieldCls} style={inputStyle} /></label>
              )}
              <label className="block" style={fAccent('dados')}>
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Data da proposta (capa)</span>
                <input type="date" value={d.data_emissao || ''} onChange={e => setD({ ...d, data_emissao: e.target.value })} className={fieldCls} style={inputStyle} />
              </label>
            </Section>

            {!isTemplate && (() => {
              const papeisTxt = (r: string[] = []) => [r.includes('signer') ? 'Assina' : null, (r.includes('reviewer') || r.includes('approver')) ? 'Valida' : null].filter(Boolean).join(' + ')
              const mini = 'px-2 py-1 rounded text-xs w-full outline-none'
              const ehAssinante = (x: any) => (x.roles ?? []).includes('signer')
              const linhaPart = (x: any, grupo: 'validar' | 'assinar') => {
                const ep = editPart
                return ep && ep.id === x.id ? (
                  <div key={x.id} className="rounded-md p-2 space-y-1.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--primary)' }}>
                    <input value={ep.name} onChange={e => setEditPart({ ...ep, name: e.target.value })} placeholder="Nome completo (nome e sobrenome)" className={mini} style={inputStyle} />
                    <div className="flex gap-1.5">
                      <input value={ep.cargo} onChange={e => setEditPart({ ...ep, cargo: e.target.value })} placeholder="Cargo" className={mini} style={inputStyle} />
                      {ehAssinante(x) && <input value={ep.cpf} onChange={e => setEditPart({ ...ep, cpf: e.target.value })} placeholder="CPF" className={mini} style={inputStyle} />}
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setEditPart(null)} className="text-[11px] px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                      <button onClick={salvarEdicaoPart} disabled={partBusy} className="text-[11px] font-bold px-3 py-1 rounded disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Salvar</button>
                    </div>
                  </div>
                ) : (
                <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md" style={{ background: 'var(--surface-sunken)' }}>
                  <span className="text-base leading-none">{x.signed ? '✔' : x.approved ? '✔' : '⏳'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{x.name}{x.cargo ? <span className="font-normal" style={{ color: 'var(--text-muted)' }}> · {x.cargo}</span> : null}{x.sign_cpf ? <span className="font-normal" style={{ color: 'var(--text-muted)' }}> · {x.sign_cpf}</span> : null}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{x.email} · {x.signed ? 'Assinou' : x.approved ? 'Aprovou' : x.status} · <span style={{ color: 'var(--primary)' }}>{papeisTxt(x.roles)}</span></p>
                  </div>
                  {!x.signed && <button onClick={() => setEditPart({ id: x.id, name: x.name ?? '', cargo: x.cargo ?? '', cpf: x.sign_cpf ?? '' })} title="Editar nome/cargo/CPF" className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--primary)' }}>✎</button>}
                  {/* P-E.2.4 — Contratada assina pelo editor (usuário logado). */}
                  {grupo === 'assinar' && x.parte === 'contratada' && !x.signed && <button onClick={() => abrirAssinarContratada(x)} title="Assinar pela Contratada" className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: '#16A34A', color: '#fff' }}>✍ Assinar</button>}
                  {x.signed && <button onClick={() => verComprovante(x)} title="Ver registro da assinatura" className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--border)' }}>📄 registro</button>}
                  <button onClick={() => removeRole(x, grupo)} title={grupo === 'validar' ? 'Remover da validação' : 'Remover da assinatura'} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--danger)' }}>✕</button>
                </div>
                )
              }
              const naCaderno = (s: any, grupo: 'validar' | 'assinar', parte?: string) => {
                // mostra no grupo só quem ainda não está na proposta exercendo aquele papel
                const jaNaProposta = parts.some((p: any) => p.email?.toLowerCase() === s.email?.toLowerCase() && (grupo === 'validar' ? (p.roles ?? []).some((r: string) => r === 'reviewer' || r === 'approver') : ((p.roles ?? []).includes('signer') && p.parte === parte)))
                if (jaNaProposta) return false
                return grupo === 'validar' ? (s.roles ?? []).some((r: string) => r === 'reviewer' || r === 'approver') : ((s.roles ?? []).includes('signer') && (s.parte ?? 'contratante') === parte)
              }
              const grupo = (titulo: string, hint: string, lista: any[], gkey: 'validar' | 'assinar', parte: 'contratante' | 'contratada' | undefined, alsoKind: 'assina' | 'valida') => (
                <div className="rounded-lg p-2.5" style={{ border: '1px solid var(--border)' }}>
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text)' }}>{titulo}</p>
                  <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>{hint}</p>
                  <div className="space-y-1">{lista.length ? lista.map(x => linhaPart(x, gkey)) : <p className="text-[11px] italic py-1" style={{ color: 'var(--text-light)' }}>Nenhum definido ainda.</p>}</div>
                  {caderno.filter(s => naCaderno(s, gkey, parte)).map(s => (
                    <button key={s.id} onClick={() => incluirDoCaderno(gkey === 'validar' ? { ...s, roles: ['reviewer', 'approver'], parte: null } : { ...s, roles: ['signer'], parte })} disabled={partBusy} className="w-full text-left text-[11px] px-2 py-1 mt-1 rounded flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }} title="Incluir da memória do cliente">
                      <span style={{ color: 'var(--primary)' }}>+ salvo</span> {s.name}{s.cargo ? ` · ${s.cargo}` : ''}
                    </button>
                  ))}
                  <PartForm busy={partBusy} onAdd={d => addPart(gkey, parte, d)} alsoKind={alsoKind} />
                </div>
              )
              return (
                <Section id="sec-assinatura" title="Assinatura da Proposta" open={open.assinatura} onToggle={() => toggleSection("assinatura")} accent="var(--primary)">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Defina quem <b style={{ color: 'var(--text)' }}>valida</b> e quem <b style={{ color: 'var(--text)' }}>assina</b> por cada parte — fica salvo para as próximas propostas deste cliente. O mesmo participante pode validar <b style={{ color: 'var(--text)' }}>e</b> assinar.</p>
                  {caderno.length > 0 && parts.length === 0 && (
                    <button onClick={importarCaderno} disabled={partBusy} className="w-full ds-btn-secondary text-xs py-1.5 disabled:opacity-50">↻ Importar {caderno.length} participante(s) salvo(s) deste cliente</button>
                  )}
                  <div className="rounded-lg p-2.5 space-y-1" style={{ background: 'var(--surface-sunken)' }}>
                    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text)' }}>Critério de conclusão</p>
                    {[['todos', 'Todos devem assinar', 'A proposta só é assinada quando 100% dos assinantes de ambas as partes assinarem.'], ['um_por_parte', 'Pelo menos um por parte', 'Basta um assinante de cada parte (Contratada e Contratante).']].map(([v, lab, desc]) => (
                      <label key={v} className="flex items-start gap-2 cursor-pointer">
                        <input type="radio" name="assmodo" checked={(d.assinatura_modo ?? 'todos') === v} onChange={() => setModoAssinatura(v)} style={{ accentColor: 'var(--primary)', marginTop: 2 }} />
                        <span><span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{lab}</span><span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>{desc}</span></span>
                      </label>
                    ))}
                  </div>
                  {grupo('Quem valida a proposta', 'Recebem para revisar/aprovar antes da assinatura.', validadores, 'validar', undefined, 'assina')}
                  {grupo('Assinatura — Contratada (ERPSERV)', 'Representantes que assinam pela contratada.', assinantes('contratada'), 'assinar', 'contratada', 'valida')}
                  {grupo('Assinatura — Contratante (cliente)', 'Representantes que assinam pelo cliente.', assinantes('contratante'), 'assinar', 'contratante', 'valida')}
                  {caderno.length > 0 && (
                    <div className="rounded-lg p-2.5" style={{ border: '1px dashed var(--border)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Memória do cliente</p>
                      {caderno.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-[11px] py-0.5" style={{ color: 'var(--text)' }}>
                          <span className="flex-1 truncate">{s.name}{s.cargo ? ` · ${s.cargo}` : ''} <span style={{ color: 'var(--text-muted)' }}>({papeisTxt(s.roles)}{s.parte ? `, ${s.parte}` : ''})</span></span>
                          <button onClick={() => excluirDoCaderno(s.id)} title="Excluir do caderno" className="px-1 rounded" style={{ color: 'var(--danger)' }}>🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )
            })()}

            {tipo !== 'cloud' && (<Section title="Capa / Logo do cliente" open={open.capa} onToggle={() => toggleSection("capa")}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', ...fAccent('logo') }}><ImageIcon size={15} />{conteudo.logo_attachment_id ? 'Trocar logo' : 'Enviar logo do cliente'}</button>
              {conteudo.logo_attachment_id && <>
                <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>Logo enviado. Ajuste posição e tamanho na capa:</p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Vertical</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setLogoCfg({ offset_y: logoOffY - 8 })} className="flex-1 flex items-center justify-center py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ArrowUp size={14} /></button>
                      <button onClick={() => setLogoCfg({ offset_y: logoOffY + 8 })} className="flex-1 flex items-center justify-center py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ArrowDown size={14} /></button>
                    </div>
                  </div>
                  <div>
                    <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Horizontal</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setLogoCfg({ offset_x: logoOffX - 8 })} className="flex-1 flex items-center justify-center py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ArrowLeft size={14} /></button>
                      <button onClick={() => setLogoCfg({ offset_x: logoOffX + 8 })} className="flex-1 flex items-center justify-center py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ArrowRight size={14} /></button>
                    </div>
                  </div>
                  <div>
                    <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tamanho ({logoEsc}%)</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setLogoCfg({ escala: Math.max(40, logoEsc - 10) })} className="flex-1 flex items-center justify-center py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Minus size={14} /></button>
                      <button onClick={() => setLogoCfg({ escala: Math.min(220, logoEsc + 10) })} className="flex-1 flex items-center justify-center py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Plus size={14} /></button>
                    </div>
                  </div>
                </div>
                <button onClick={() => setLogoCfg({ offset_x: 0, offset_y: 0, escala: 100 })} className="text-[11px] mt-1.5" style={{ color: 'var(--primary)' }}>Centralizar / restaurar</button>
              </>}
            </Section>)}

            {tipo === 'cloud' && (
              <Section title="Escopo · Horário · SLA · Estrutura (Cloud)" open={open.cloudsla} onToggle={() => toggleSection("cloudsla")} accent={fColor("escopo")}>
                {(() => {
                  const cl = conteudo.cloud ?? {}
                  const setCloud = (key: string, val: any) => setConteudo(p => ({ ...p, cloud: { ...(p.cloud || {}), [key]: val } }))
                  const inp = (v: any, on: (s: string) => void, ph = '', w = '') => <input value={v ?? ''} onChange={e => on(e.target.value)} placeholder={ph} className={(w || 'flex-1') + ' text-sm rounded-lg px-2 py-1.5 outline-none'} style={inputStyle} />
                  // SLA
                  const sla: any[] = Array.isArray(cl.sla?.linhas) && cl.sla.linhas.length ? cl.sla.linhas : [{ indicador: 'Disponibilidade da Infraestrutura Data Center', nivel: '99,9%', horario: '24x7x365' }]
                  const setSla = (n: any[]) => setCloud('sla', { linhas: n })
                  const sevc: any[] = Array.isArray(cl.severidade?.linhas) && cl.severidade.linhas.length ? cl.severidade.linhas : [{ severidade: '1', impacto: 'Indisponibilidade', reacao: 'Em até 15 Minutos', solucao: 'Em até 04 horas' }]
                  const setSev = (n: any[]) => setCloud('severidade', { linhas: n })
                  const estr: any[] = Array.isArray(cl.estrutura?.linhas) && cl.estrutura.linhas.length ? cl.estrutura.linhas : [{ nome: 'NOC (Network Operation Center):', descricao: '' }]
                  const setEstr = (n: any[]) => setCloud('estrutura', { linhas: n })
                  const hor: any[] = Array.isArray(cl.horario?.linhas) && cl.horario.linhas.length ? cl.horario.linhas : [{ servico: 'Serviços de armazenamento', horario: '24 x 7', obs: '' }]
                  const setHor = (n: any[]) => setCloud('horario', { linhas: n })
                  return (
                    <div className="space-y-3">
                      <TextRow label="Objetivo (texto no topo da página de escopo)" rows={3} value={conteudo.escopo?.objetivo ?? ''} onChange={v => setCont('escopo', 'objetivo', v)} placeholder="Vazio = Contratação de serviço de disponibilidade em cloud do ERP PROTHEUS 12." />
                      <TagsHint />
                      <div>
                        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Escopo (texto padrão do deck por blocos — vazio = 3 páginas padrão; reordene com ↑↓)</span>
                        <div className="space-y-2">
                          {escopoBlocks.length === 0 && (
                            <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem conteúdo próprio — as 3 páginas de escopo padrão (Serviços ERP / Serviços CLOUD / Equipe) aparecem. Adicione blocos para customizar.</p>
                          )}
                          {escopoBlocks.map((b, i) => (
                            <div key={i} className="rounded-lg p-2" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                                  {b.tipo === 'imagem' ? '🖼 Imagem' : b.tipo === 'titulo' ? '🅣 Título' : '¶ Texto'} {i + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-30" style={{ color: 'var(--text-muted)' }} title="Subir"><ArrowUp size={13} /></button>
                                  <button onClick={() => moveBlock(i, 1)} disabled={i === escopoBlocks.length - 1} className="p-0.5 disabled:opacity-30" style={{ color: 'var(--text-muted)' }} title="Descer"><ArrowDown size={13} /></button>
                                  <button onClick={() => removeBlock(i)} className="p-0.5" style={{ color: 'var(--danger)' }} title="Remover"><Trash2 size={13} /></button>
                                </div>
                              </div>
                              {b.tipo === 'titulo' ? (
                                <input value={b.conteudo} onChange={e => updateBlock(i, { conteudo: e.target.value })} placeholder="Título (negrito, roxo)" className={fieldCls} style={inputStyle} />
                              ) : b.tipo === 'texto' ? (
                                <div className="space-y-1.5">
                                  <textarea rows={4} value={b.conteudo} onChange={e => updateBlock(i, { conteudo: e.target.value })} placeholder="Texto do escopo (uma linha por item)… use **palavra** para negrito" className={fieldCls} style={inputStyle} />
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Ícone:
                                      <select value={(b as any).marker ?? 'none'} onChange={e => updateBlock(i, { marker: e.target.value as any })} className="text-xs rounded px-1.5 py-1 outline-none" style={inputStyle}>
                                        <option value="none">Nenhum</option>
                                        <option value="bullet">• Bolinha</option>
                                        <option value="check">✓ Check</option>
                                      </select>
                                    </label>
                                    <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Fonte:
                                      <input type="number" min={8} max={40} value={(b as any).font_size ?? ''} onChange={e => updateBlock(i, { font_size: e.target.value === '' ? undefined : Number(e.target.value) } as any)} placeholder="16" className="w-16 text-xs rounded px-1.5 py-1 outline-none" style={inputStyle} /> px
                                    </label>
                                    <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>negrito: **palavra**</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <img src={`/api/v1/crm/proposals/escopo-image/${b.attachment_id}`} alt="" className="w-full rounded" style={{ maxHeight: 120, objectFit: 'contain', background: 'var(--surface)' }} />
                                  <input value={b.legenda ?? ''} onChange={e => updateBlock(i, { legenda: e.target.value })} placeholder="Legenda (opcional)" className={fieldCls} style={inputStyle} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={addTituloBlock} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>🅣 + Título</button>
                          <button onClick={addTextBlock} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Type size={13} /> + Texto</button>
                          <input ref={escopoFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEscopoImage(f); e.target.value = '' }} />
                          <button onClick={() => escopoFileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ImageIcon size={13} /> + Imagem</button>
                        </div>
                      </div>
                      <div style={fAccent('horario')}>
                        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Horário de Atendimento (Serviço / Horário / OBS)</span>
                        {hor.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 mb-1">
                            <input value={r.servico ?? ''} onChange={e => setHor(hor.map((x, j) => j === i ? { ...x, servico: e.target.value } : x))} placeholder="Serviço" className={fieldCls} style={inputStyle} />
                            <input value={r.horario ?? ''} onChange={e => setHor(hor.map((x, j) => j === i ? { ...x, horario: e.target.value } : x))} placeholder="24 x 7" className="w-20 text-sm rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
                            <input value={r.obs ?? ''} onChange={e => setHor(hor.map((x, j) => j === i ? { ...x, obs: e.target.value } : x))} placeholder="OBS" className={fieldCls} style={inputStyle} />
                            <button type="button" onClick={() => setHor(hor.filter((_, j) => j !== i))} className="text-[11px] px-1" style={{ color: 'var(--danger)' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setHor([...hor, { servico: '', horario: '', obs: '' }])} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Linha</button>
                      </div>
                      <div style={fAccent('sla')}>
                        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Nível de Serviço (Indicador / Nível % / Horário)</span>
                        {sla.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 mb-1">
                            {inp(r.indicador, v => setSla(sla.map((x, j) => j === i ? { ...x, indicador: v } : x)), 'Indicador')}
                            {inp(r.nivel, v => setSla(sla.map((x, j) => j === i ? { ...x, nivel: v } : x)), '%', 'w-20')}
                            {inp(r.horario, v => setSla(sla.map((x, j) => j === i ? { ...x, horario: v } : x)), 'Horário', 'w-28')}
                            <button type="button" onClick={() => setSla(sla.filter((_, j) => j !== i))} className="text-[11px] px-1" style={{ color: 'var(--danger)' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setSla([...sla, { indicador: '', nivel: '', horario: '24x7x365' }])} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Indicador</button>
                      </div>
                      <div style={fAccent('estrutura')}>
                        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Estrutura de atendimento (Nome / Descrição)</span>
                        {estr.map((r, i) => (
                          <div key={i} className="flex items-start gap-1.5 mb-1">
                            {inp(r.nome, v => setEstr(estr.map((x, j) => j === i ? { ...x, nome: v } : x)), 'Nome', 'w-44')}
                            <textarea value={r.descricao ?? ''} onChange={e => setEstr(estr.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))} rows={2} placeholder="Descrição" className={fieldCls} style={inputStyle} />
                            <button type="button" onClick={() => setEstr(estr.filter((_, j) => j !== i))} className="text-[11px] px-1" style={{ color: 'var(--danger)' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setEstr([...estr, { nome: '', descricao: '' }])} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Linha</button>
                      </div>
                      <div style={fAccent('estrutura')}>
                        <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Severidade / SLA (Sev. / Impacto / Reação / Solução)</span>
                        {sevc.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 mb-1">
                            {inp(r.severidade, v => setSev(sevc.map((x, j) => j === i ? { ...x, severidade: v } : x)), 'Sev.', 'w-14')}
                            {inp(r.impacto, v => setSev(sevc.map((x, j) => j === i ? { ...x, impacto: v } : x)), 'Impacto')}
                            {inp(r.reacao, v => setSev(sevc.map((x, j) => j === i ? { ...x, reacao: v } : x)), 'Reação')}
                            {inp(r.solucao, v => setSev(sevc.map((x, j) => j === i ? { ...x, solucao: v } : x)), 'Solução')}
                            <button type="button" onClick={() => setSev(sevc.filter((_, j) => j !== i))} className="text-[11px] px-1" style={{ color: 'var(--danger)' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setSev([...sevc, { severidade: '', impacto: '', reacao: '', solucao: '' }])} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Severidade</button>
                      </div>
                    </div>
                  )
                })()}
              </Section>
            )}

            {tipo === 'cloud' && (
              <Section title="Investimento Único (Cloud)" open={open.cloudinv} onToggle={() => toggleSection("cloudinv")} accent={focusKey === 'cloudinv' ? fColor("tabela") : undefined}>
                {(() => {
                  // ÚNICO (single) — gera 1 card one-time se total > 0
                  const unico = conteudo.cloud?.investimento_unico ?? {}
                  const setUnico = (d: any) => setConteudo(p => ({ ...p, cloud: { ...(p.cloud || {}), investimento_unico: d } }))
                  return (
                    <div>
                      <p className="text-[11px] mb-1" style={{ color: 'var(--text-light)' }}>Se o total &gt; 0, gera 1 card one-time no Kanban de Contratos. (Página "Investimento Único" da proposta.)</p>
                      <InvestLinha data={unico} onChange={setUnico} tipos={ctOptions} mensal={false} />
                    </div>
                  )
                })()}
              </Section>
            )}

            {tipo === 'cloud' && (
              <Section title="Investimento Mensal (Cloud)" open={open.cloudinvmensal} onToggle={() => toggleSection("cloudinvmensal")} accent={focusKey === 'cloudinvmensal' ? fColor("tabela") : undefined}>
                {(() => {
                  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  const lineVal = (d: any) => {
                    const tn = (ctOptions.find(s => String(s.id) === String(d?.contract_type_id))?.name || '').toLowerCase()
                    const fat = /cloud|saas/.test(tn) ? (Number(d?.valor) || 0) : (computeMemoria(d?.memoria ?? {}).faturamento || 0)
                    return fat - (Number(d?.desconto?.valor) || 0)
                  }
                  // MENSAL (multi-linha) — 1 card por linha (cada tipo de contrato com seu valor)
                  const linhas: any[] = (Array.isArray(conteudo.cloud?.investimento?.linhas) && conteudo.cloud.investimento.linhas.length)
                    ? conteudo.cloud.investimento.linhas
                    : [{ label: 'CLOUD', memoria: conteudo.cloud?.investimento?.memoria ?? {}, desconto: conteudo.cloud?.investimento?.desconto ?? { label: 'Desconto', valor: 0 }, contract_type_id: conteudo.cloud?.investimento?.contract_type_id ?? '' }]
                  const setLinhas = (ls: any[]) => setConteudo(p => ({ ...p, cloud: { ...(p.cloud || {}), investimento: { ...(p.cloud?.investimento || {}), linhas: ls } } }))
                  const totalMensal = linhas.reduce((s, l) => s + lineVal(l), 0)
                  return (
                    <div>
                      <p className="text-[11px] mb-1" style={{ color: 'var(--text-light)' }}>Um tipo de contrato por linha — cada uma vira um card no Kanban de Contratos. (Página "Investimento Mensal" da proposta, separada do Único.)</p>
                      {linhas.map((l, i) => (
                        <InvestLinha key={i} data={l} onChange={d => setLinhas(linhas.map((x, j) => j === i ? d : x))} tipos={ctOptions} mensal onRemove={linhas.length > 1 ? () => setLinhas(linhas.filter((_, j) => j !== i)) : undefined} />
                      ))}
                      <button type="button" onClick={() => setLinhas([...linhas, { label: '', memoria: {}, desconto: { label: 'Desconto', valor: 0 }, contract_type_id: '' }])} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+ Adicionar tipo de contrato</button>
                      <p className="text-xs mt-1" style={{ color: 'var(--text)' }}>Total/Mensal: <b>R$ {fmt(totalMensal)}</b></p>
                    </div>
                  )
                })()}
              </Section>
            )}

            {tipo === 'cloud' && (
              <Section title="Aceite (Cloud)" open={open.aceite} onToggle={() => toggleSection("aceite")} accent={fColor("aceite")}>
                <TextRow
                  label="Texto adicional (opcional, no meio do aceite)"
                  rows={4}
                  placeholder="Cláusula/observação extra. Se não couber no espaço da página, cria automaticamente uma página de continuação."
                  value={conteudo.aceite?.texto_extra ?? ''}
                  onChange={v => setCont('aceite', 'texto_extra', v)}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  A página de Aceite é a mesma dos demais contratos. Este texto entra como parágrafo(s) antes do foro, empurrando os blocos de assinatura para baixo. Se faltar espaço, segue em uma página &quot;ACEITE / CONTINUAÇÃO&quot;. Use Enter para separar parágrafos.
                </p>
              </Section>
            )}

            {tipo !== 'cloud' && (<>
            <Section title="Escopo" open={open.escopo} onToggle={() => toggleSection("escopo")} accent={fColor("escopo")}>
              <TextRow label="Tipo de escopo" value={conteudo.escopo?.tipo_escopo ?? ''} onChange={v => setCont('escopo', 'tipo_escopo', v)} />
              <TextRow label="Objetivo (texto da capa)" rows={3} value={conteudo.escopo?.objetivo ?? ''} onChange={v => setCont('escopo', 'objetivo', v)} placeholder="Vazio = gerado automático (horas + serviço). Preencha para escrever seu próprio objetivo." />
              <TagsHint />
              {isProjeto && <TextRow label="Objetivo (descrição do projeto)" rows={2} value={String(inputs.escopo_texto ?? '')} onChange={v => setInput('escopo_texto', v)} />}

              {/* Escopo funcional como BLOCOS (título/texto/imagem) — reordenáveis entre si, fluem e paginam no PDF */}
              <div>
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Escopo funcional (blocos: título / texto / imagem — reordene com ↑↓)</span>
                <div className="space-y-2">
                  {escopoBlocks.length === 0 && (
                    <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem conteúdo próprio — a arte padrão do deck aparece. Adicione título, texto ou imagem abaixo.</p>
                  )}
                  {escopoBlocks.map((b, i) => (
                    <div key={i} className="rounded-lg p-2" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                          {b.tipo === 'imagem' ? '🖼 Imagem' : b.tipo === 'titulo' ? '🅣 Título' : '¶ Texto'} {i + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-30" style={{ color: 'var(--text-muted)' }} title="Subir"><ArrowUp size={13} /></button>
                          <button onClick={() => moveBlock(i, 1)} disabled={i === escopoBlocks.length - 1} className="p-0.5 disabled:opacity-30" style={{ color: 'var(--text-muted)' }} title="Descer"><ArrowDown size={13} /></button>
                          <button onClick={() => removeBlock(i)} className="p-0.5" style={{ color: 'var(--danger)' }} title="Remover"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      {b.tipo === 'titulo' ? (
                        <div className="space-y-1.5">
                          <input value={b.conteudo} onChange={e => updateBlock(i, { conteudo: e.target.value })} placeholder="Título (negrito, roxo)" className={fieldCls} style={inputStyle} />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Posição:</span>
                            {(['left', 'center', 'right'] as const).map(a => (
                              <button key={a} type="button" onClick={() => updateBlock(i, { alinhamento: a })} title={a}
                                className="text-[11px] px-1.5 py-1 rounded"
                                style={{ background: (b.alinhamento ?? 'left') === a ? 'var(--primary)' : 'var(--bg)', color: (b.alinhamento ?? 'left') === a ? 'var(--primary-fg)' : 'var(--text)', border: '1px solid var(--border)' }}>
                                {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : b.tipo === 'texto' ? (
                        <div className="space-y-1.5">
                          <textarea rows={4} value={b.conteudo} onChange={e => updateBlock(i, { conteudo: e.target.value })} placeholder="Texto do escopo (uma linha por item)… use **palavra** para negrito" className={fieldCls} style={inputStyle} />
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Ícone:
                              <select value={(b as any).marker ?? 'none'} onChange={e => updateBlock(i, { marker: e.target.value as any })} className="text-xs rounded px-1.5 py-1 outline-none" style={inputStyle}>
                                <option value="none">Nenhum</option>
                                <option value="bullet">• Bolinha</option>
                                <option value="check">✓ Check</option>
                              </select>
                            </label>
                            <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Fonte:
                              <input type="number" min={8} max={40} value={(b as any).font_size ?? ''} onChange={e => updateBlock(i, { font_size: e.target.value === '' ? undefined : Number(e.target.value) } as any)} placeholder="16" className="w-16 text-xs rounded px-1.5 py-1 outline-none" style={inputStyle} /> px
                            </label>
                            <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>negrito: **palavra**</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <img src={`/api/v1/crm/proposals/escopo-image/${b.attachment_id}`} alt="" className="w-full rounded" style={{ maxHeight: 120, objectFit: 'contain', background: 'var(--surface)' }} />
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                              <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Largura {b.largura ?? 80}%</span>
                              <input type="range" min={20} max={100} step={5} value={b.largura ?? 80} onChange={e => updateBlock(i, { largura: Number(e.target.value) })} className="w-full" />
                            </label>
                            <label className="block">
                              <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Alinhamento</span>
                              <select value={b.alinhamento ?? 'center'} onChange={e => updateBlock(i, { alinhamento: e.target.value as any })} className={fieldCls} style={inputStyle}>
                                <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
                              </select>
                            </label>
                          </div>
                          <input value={b.legenda ?? ''} onChange={e => updateBlock(i, { legenda: e.target.value })} placeholder="Legenda (opcional)" className={fieldCls} style={inputStyle} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={addTituloBlock} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>🅣 + Título</button>
                  <button onClick={addTextBlock} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Type size={13} /> + Texto</button>
                  <input ref={escopoFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEscopoImage(f); e.target.value = '' }} />
                  <button onClick={() => escopoFileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ImageIcon size={13} /> + Imagem</button>
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Os blocos fluem na ordem; se passarem da página, o PDF cria páginas de continuação automaticamente.</p>
              </div>
            </Section>

            <Section title="Investimento" open={open.invest} onToggle={() => toggleSection("invest")}>
              {/* MEMÓRIA DE CÁLCULO (movida p/ dentro de Investimento) — alimenta a Tabela de investimento. */}
              <div className="rounded-lg p-2 mb-1 space-y-2" style={{ background: 'var(--surface-sunken)', ...fAccent('tabela') }}>
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Memória de cálculo</span>
                {/* Memória de cálculo por HORA em TODOS os tipos (incl. Projeto Fechado): faturamento = horas × valor/hora.
                    A PROPOSTA do Projeto Fechado continua mostrando só o valor fixo (total), sem horas ao cliente. */}
                <div className="grid grid-cols-2 gap-2">
                  <NumRow label={tipo === 'bh_mensal' ? 'Horas mensais' : 'Horas de consultoria'} value={String(inputs.horas_consultoria ?? '')} onChange={v => setInput('horas_consultoria', v === '' ? '' : Number(v))} />
                  <NumRow label="Valor/hora cliente (R$)" step="0.01" value={String(inputs.valor_hora_cliente ?? '')} onChange={v => { setInput('valor_hora_cliente', v === '' ? '' : Number(v)); setInput('venda_h', v === '' ? '' : Number(v)) }} />
                </div>
                {(isHoras || isProjeto) && <NumRow label="Duração (meses)" value={String(inputs.duracao_meses ?? 12)} onChange={v => setInput('duracao_meses', v === '' ? '' : Number(v))} />}
                <div className="grid grid-cols-2 gap-2">
                  <NumRow label="Custo/h consultoria" step="0.01" value={String(inputs.custo_h_consultoria ?? '')} onChange={v => setInput('custo_h_consultoria', v === '' ? '' : Number(v))} />
                  <NumRow label="Custo/h coordenação" step="0.01" value={String(inputs.custo_h_coordenacao ?? '')} onChange={v => setInput('custo_h_coordenacao', v === '' ? '' : Number(v))} />
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold" style={{ color: 'var(--primary)' }}>Parâmetros (% planilha)</summary>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {[['pct_coordenacao', '% Coordenação', 0.20], ['pct_imposto', '% Imposto', 0.10], ['pct_custo_fixo', '% Custo fixo', 0.40], ['pct_margem', '% Margem', 0], ['premio_executivo_pct', '% Prêmio exec.', 0], ['premio_arquiteto_pct', '% Prêmio arq.', 0], ['desconto_pct', '% Desconto', 0]].map(([k, lbl, def]) => (
                      <NumRow key={k as string} label={lbl as string} step="0.01" value={String(inputs.params?.[k as string] ?? def)} onChange={v => setInputs(p => ({ ...p, params: { ...(p.params || {}), [k as string]: v === '' ? 0 : Number(v) } }))} />
                    ))}
                  </div>
                </details>
                <div className="rounded-lg px-3 py-2 text-xs mt-1" style={{ background: 'var(--primary-soft)' }}>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Faturamento</span><b style={{ color: 'var(--text)' }}>{fmtBRL(calc.faturamento ?? 0)}</b></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Custo total</span><span style={{ color: 'var(--text)' }}>{fmtBRL(calc.custo_total ?? 0)}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Margem</span><b style={{ color: (calc.margem_pct ?? 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>{((calc.margem_pct ?? 0) * 100).toFixed(2)}%</b></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Lucro líquido</span><b style={{ color: (calc.lucro_liquido ?? 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtBRL(calc.lucro_liquido ?? 0)}</b></div>
                </div>
              </div>
              <TextRow label="Texto do card (vale p/ Investimento e Prazo)" rows={2} value={conteudo.card_texto ?? CARD_DEFAULTS[d.tipo] ?? ''} onChange={v => setConteudo(p => ({ ...p, card_texto: v }))} />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="block"><span className={lblCls} style={{ color: 'var(--text-muted)' }}>Desconto (rótulo editável)</span>
                  <input value={conteudo.investimento?.desconto?.label ?? 'Desconto'} onChange={e => setCont('investimento', 'desconto', { ...(conteudo.investimento?.desconto || { valor: 0 }), label: e.target.value })} placeholder="Desconto / Cortesia" className={fieldCls} style={inputStyle} /></label>
                <label className="block"><span className={lblCls} style={{ color: 'var(--text-muted)' }}>Valor do desconto (R$)</span>
                  <input type="number" value={conteudo.investimento?.desconto?.valor ?? ''} onChange={e => setCont('investimento', 'desconto', { label: conteudo.investimento?.desconto?.label ?? 'Desconto', valor: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0,00" className={fieldCls} style={inputStyle} /></label>
              </div>
              <p className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>O desconto abate do TOTAL da tabela de investimento (e aparece como linha na proposta).</p>
              <div style={fAccent('sob_demanda')}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Horas sob demanda</span>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={sobOn} onChange={e => setCont('investimento', 'sob_demanda_on', e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> Mostrar na proposta
                  </label>
                </div>
                {sobOn && <>
                  <div className="grid grid-cols-2 gap-2">
                    <TextRow label="Valor (R$/hora)" value={curValor} onChange={setSobValor} placeholder="190,00" />
                    <TextRow label="Dia do pagamento" value={curDia} onChange={setSobDia} placeholder="10" />
                  </div>
                </>}
              </div>
              <div style={fAccent('despesas_sp')}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Despesas em SP</span>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={spOn} onChange={e => setCont('investimento', 'despesas_sp_on', e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> Mostrar na proposta
                  </label>
                </div>
                {spOn && <>
                  <TextRow label="Valor (R$/visita)" value={spValor} onChange={setSpValor} placeholder="170,00" />
                  <label className="flex items-start gap-1.5 text-[11px] mt-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={spContrato} onChange={e => setCont('investimento', 'despesas_sp_contrato', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                    <span>Aplicar esta despesa no <b style={{ color: 'var(--text)' }}>contrato gerado</b> (desmarque se o cliente não é de SP — o texto continua na proposta).</span>
                  </label>
                </>}
              </div>
              <div style={fAccent('despesas_fora')}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Despesas fora de SP</span>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={foraOn} onChange={e => setCont('investimento', 'despesas_fora_on', e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> Mostrar na proposta
                  </label>
                </div>
                {foraOn && <>
                  <TextRow label="Valor (R$/visita)" value={foraValor} onChange={setForaValor} placeholder="250" />
                </>}
              </div>
              <div className="pt-1">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Despesa que vai para o contrato</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {([['sp', 'Dentro de SP'], ['fora', 'Fora de SP'], ['nenhum', 'Não informar']] as const).map(([val, lbl]) => {
                    const active = (conteudo.contrato?.despesa ?? 'sp') === val
                    return (
                      <button key={val} type="button" onClick={() => setCont('contrato', 'despesa', val)}
                        className="text-xs px-2.5 py-1.5 rounded-lg"
                        style={{ background: active ? 'var(--primary)' : 'var(--surface)', color: active ? 'var(--primary-fg)' : 'var(--text)', border: '1px solid var(--border)' }}>
                        {lbl}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  &quot;Não informar&quot; = contrato não cobra despesa do cliente. SP/Fora levam o valor da respectiva despesa.
                </p>
              </div>
              <div className="pt-1">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Títulos e textos extras (posição por item; paginam se não couber)</span>
                <ExtrasEditor items={conteudo.investimento?.extras ?? []} onChange={next => setCont('investimento', 'extras', next)} />
              </div>
            </Section>

            <Section title="Prazo e Pagamento" open={open.prazo} onToggle={() => toggleSection("prazo")}>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div style={fAccent('inicio')}><NumRow label={<>Início do atendimento<br />(dias úteis)</>} value={inicioDias} onChange={setInicioDias} /></div>
                {tipo === 'bh_fixo' && <div style={fAccent('duracao')}><NumRow label="Duração do serviço (meses)" value={String(inputs.duracao_meses ?? 12)} onChange={v => setInput('duracao_meses', v === '' ? '' : Number(v))} /></div>}
              </div>
              {(tipo === 'bh_fixo' || isProjeto) && (
                <div className="grid grid-cols-3 gap-2" style={fAccent('parcelas')}>
                  <NumRow label="Parcelas (Nx)" value={parcelasNum} onChange={setParcelasNum} />
                  <TextRow label="Valor %" value={conteudo.prazo?.valor_pct ?? ''} onChange={v => setCont('prazo', 'valor_pct', v)} />
                  <TextRow label="Vencimento" value={conteudo.prazo?.vencimento ?? ''} onChange={v => setCont('prazo', 'vencimento', v)} />
                </div>
              )}
              <div style={fAccent('pagamento')}><NumRow label="Pagamento das despesas — dia do mês" value={despDia} onChange={setDespDia} /></div>
              <div className="pt-1">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Títulos e textos extras (posição por item; paginam se não couber)</span>
                <ExtrasEditor items={conteudo.prazo?.extras ?? []} onChange={next => setCont('prazo', 'extras', next)} />
              </div>
            </Section>

            <Section title="Aceite" open={open.aceite} onToggle={() => toggleSection("aceite")} accent={fColor("aceite")}>
              <TextRow
                label="Texto adicional (opcional)"
                rows={4}
                placeholder="Cláusula/observação extra. Se não couber no espaço da página, cria automaticamente uma página de continuação."
                value={conteudo.aceite?.texto_extra ?? ''}
                onChange={v => setCont('aceite', 'texto_extra', v)}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Os demais textos do Aceite são fixos. Este texto entra como parágrafo(s) antes do foro, empurrando os blocos de assinatura para baixo. Se faltar espaço, segue em uma página &quot;ACEITE / CONTINUAÇÃO&quot;. Use Enter para separar parágrafos.
              </p>
            </Section>
            </>)}

            <Section title="Dados para o contrato (não aparece na proposta)" open={open.contrato} onToggle={() => toggleSection("contrato")}>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                Define o que será carregado ao gerar o contrato (ao ganhar a oportunidade). Não é exibido no PDF da proposta.
                O <b>Tipo de Contrato</b> é determinado pelo <b>Tipo da proposta</b> (Identificação){tipo === 'cloud' ? ' — no Cloud, cada linha do Investimento define o tipo do seu card' : ''}.
              </p>
              {tipo === 'cloud' && (
                <div>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Despesa que vai para o contrato</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([['sp', 'Dentro de SP'], ['fora', 'Fora de SP'], ['nenhum', 'Não informar']] as const).map(([val, lbl]) => {
                      const active = (conteudo.contrato?.despesa ?? 'sp') === val
                      return (
                        <button key={val} type="button" onClick={() => setCont('contrato', 'despesa', val)}
                          className="text-xs px-2.5 py-1.5 rounded-lg"
                          style={{ background: active ? 'var(--primary)' : 'var(--surface)', color: active ? 'var(--primary-fg)' : 'var(--text)', border: '1px solid var(--border)' }}>
                          {lbl}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    &quot;Não informar&quot; = contrato não cobra despesa do cliente. SP/Fora levam o valor da respectiva despesa.
                  </p>
                </div>
              )}
            </Section>

            {tipo !== 'cloud' && (<Section title="Páginas (incluir / remover)" open={open.paginas} onToggle={() => toggleSection("paginas")}>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                Desmarque uma página para não enviá-la nesta proposta. A pré-visualização e o PDF refletem a seleção.
              </p>
              <div className="flex flex-col gap-1">
                {pageLabels.map((label, idx) => {
                  const on = !pagesOff.includes(idx)
                  return (
                    <label key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer"
                      style={{ background: on ? 'var(--surface)' : 'var(--bg)', border: '1px solid var(--border)', opacity: on ? 1 : 0.6 }}>
                      <span className="text-sm" style={{ color: 'var(--text)' }}>
                        <span className="text-[11px] mr-1.5" style={{ color: 'var(--text-muted)' }}>{idx + 1}.</span>{label}
                      </span>
                      <input type="checkbox" checked={on} onChange={e => setPageOn(idx, e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                    </label>
                  )
                })}
              </div>
              {pagesOff.length > 0 && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--warning)' }}>
                  {pagesOff.length} página(s) não serão enviadas.
                </p>
              )}
            </Section>)}
          </div>

          {/* PREVIEW — iframe com o mesmo HTML do PDF (paginação do escopo idêntica) */}
          <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
            {focusKey && focusFields.length > 0 && (
              <div className="mx-auto mb-3 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap" style={{ maxWidth: 980, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Em foco — o que este módulo altera:</span>
                {focusFields.map(f => (
                  <span key={f.key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text)' }}>
                    <span className="inline-block rounded" style={{ width: 12, height: 12, background: f.color, boxShadow: `0 0 0 2px ${f.color}55` }} />
                    {f.label}
                  </span>
                ))}
              </div>
            )}
            {!preview?.html ? <p style={{ color: 'var(--text-muted)' }}>Gerando pré-visualização…</p> : (
              <div className="mx-auto" style={{ maxWidth: 980 }}>
                <PreviewFrame html={preview.html} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: enviar proposta por e-mail (prévia ao vivo + remetente = usuário logado) ── */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !sending && setComposeOpen(false)}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(1040px, 96vw)', height: '92vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Mail size={16} style={{ color: 'var(--primary)' }} />
                <span className="font-bold" style={{ color: 'var(--text)' }}>Enviar proposta {d.codigo ? <span style={{ color: 'var(--primary)' }}>{d.codigo}</span> : null} por e-mail</span>
              </div>
              <button onClick={() => !sending && setComposeOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="flex flex-1 min-h-0">
              {/* esquerda: destinatários + assunto + mensagem */}
              <div className="w-[400px] shrink-0 overflow-y-auto p-4 space-y-4" style={{ borderRight: '1px solid var(--border)' }}>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Destinatários</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {emails.map(e => (
                      <span key={e} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        {e}
                        <button onClick={() => setEmails(emails.filter(x => x !== e))}><X size={11} /></button>
                      </span>
                    ))}
                    {!emails.length && <span className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum destinatário ainda.</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <input value={emailInput} onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail() } }}
                      placeholder="email@cliente.com" className={fieldCls} style={inputStyle} />
                    <button onClick={addEmail} className="px-2.5 rounded-lg text-sm font-semibold shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}><Plus size={14} /></button>
                  </div>
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Assunto</label>
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Mensagem</label>
                  <textarea value={emailMsg} onChange={e => setEmailMsg(e.target.value)} rows={8} className={fieldCls} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <p className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>📎</span><span>O <b>PDF da proposta</b> é gerado e anexado automaticamente. O e-mail sai <b>como você</b> (seu nome/conta) — as respostas voltam pra você.</span>
                </p>
              </div>
              {/* direita: prévia do e-mail */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2 text-[11px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  Prévia do e-mail {emailPrevLoading && <span style={{ color: 'var(--text-light)' }}>· atualizando…</span>}
                </div>
                <div className="flex-1 overflow-hidden" style={{ background: '#e5e7eb' }}>
                  {emailHtml ? <iframe srcDoc={emailHtml} title="prévia do e-mail" className="w-full h-full border-0" />
                    : <p className="p-6" style={{ color: 'var(--text-muted)' }}>Gerando prévia…</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !sending && setComposeOpen(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={enviarEmail} disabled={sending || !emails.length} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Send size={14} />{sending ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: enviar para ASSINATURA (compositor de e-mail; remetente = usuário logado) ── */}
      {assinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !enviandoAssin && setAssinOpen(false)}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(1040px, 96vw)', height: '92vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <FileSignature size={16} style={{ color: '#16A34A' }} />
                <span className="font-bold" style={{ color: 'var(--text)' }}>Enviar para assinatura {d.codigo ? <span style={{ color: 'var(--primary)' }}>{d.codigo}</span> : null}</span>
              </div>
              <button onClick={() => !enviandoAssin && setAssinOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="w-[400px] shrink-0 overflow-y-auto p-4 space-y-4" style={{ borderRight: '1px solid var(--border)' }}>
                {assinForcar && (
                  <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
                    ⚠ Há <b>aprovação pendente</b>. Ao enviar, a etapa de aprovação será <b>pulada</b> e a proposta vai direto para assinatura.
                  </div>
                )}
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Remetente</label>
                  <div className="text-sm px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>{assinSender.nome ?? 'Você'}{assinSender.email ? <span style={{ color: 'var(--text-muted)' }}> · {assinSender.email}</span> : null}</div>
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Assinantes (destinatários)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {assinSigners.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }} title={s.parte ?? ''}>{s.nome}{s.email ? ` · ${s.email}` : ''}</span>
                    ))}
                    {!assinSigners.length && <span className="text-xs" style={{ color: 'var(--danger)' }}>Nenhum assinante definido — adicione na seção Assinatura.</span>}
                  </div>
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Assunto</label>
                  <input value={assinSubject} onChange={e => setAssinSubject(e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Mensagem</label>
                  <textarea value={assinMsg} onChange={e => setAssinMsg(e.target.value)} rows={8} className={fieldCls} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <p className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>✍</span><span>Cada assinante recebe o e-mail <b>como você</b>, com o <b>link individual</b> de assinatura (Clicksign). O PDF gerado é anexado ao envelope.</span>
                </p>
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2 text-[11px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  Prévia do e-mail {assinPrevLoading && <span style={{ color: 'var(--text-light)' }}>· atualizando…</span>}
                </div>
                <div className="flex-1 overflow-hidden" style={{ background: '#e5e7eb' }}>
                  {assinHtml ? <iframe srcDoc={assinHtml} title="prévia do e-mail de assinatura" className="w-full h-full border-0" />
                    : <p className="p-6" style={{ color: 'var(--text-muted)' }}>Gerando prévia…</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !enviandoAssin && setAssinOpen(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={confirmarEnviarAssinatura} disabled={enviandoAssin || !assinSigners.length} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: '#16A34A', color: '#fff' }}><Send size={14} />{enviandoAssin ? 'Enviando…' : 'Enviar para assinatura'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: solicitar APROVAÇÃO (compositor de e-mail; remetente = usuário logado) ── */}
      {/* P-E.2.4 — Assinar pela Contratada (editor, usuário logado) com reuso do perfil salvo */}
      {signPart && (
        <ContratadaSignModal part={signPart.part} perfil={signPart.perfil} busy={partBusy} onClose={() => setSignPart(null)} onSubmit={assinarContratada} />
      )}

      {/* P-E.2.4 — Info: assinatura conduzida pelo Clicksign via e-mail (Contratada) */}
      {enviadoInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setEnviadoInfo(null)}>
          <div className="rounded-xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(440px,96vw)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>✉️</div>
            <h2 className="text-lg font-extrabold mt-2" style={{ color: 'var(--text)' }}>Assinatura enviada via Clicksign</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Link enviado para <b style={{ color: 'var(--text)' }}>{enviadoInfo.nome || 'o assinante'}</b>{enviadoInfo.email ? <> · {enviadoInfo.email}</> : null}. A assinatura é concluída pelo Clicksign (com código). O status atualiza automaticamente.
            </p>
            <button onClick={() => setEnviadoInfo(null)} className="mt-5 px-6 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Entendi</button>
          </div>
        </div>
      )}

      {/* P-E.2.4 — Clicksign embedado no editor (Contratada assina aqui mesmo, com código) */}
      {clickUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => { setClickUrl(null); void carregarParts() }}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(900px,96vw)', height: '88vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>✍ Assinatura eletrônica <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· autenticada por Clicksign</span></span>
              <div className="flex items-center gap-3">
                <a href={clickUrl} target="_blank" rel="noreferrer" className="text-xs font-bold" style={{ color: 'var(--primary)' }}>abrir em nova aba ↗</a>
                <button onClick={() => { setClickUrl(null); void carregarParts() }} style={{ color: 'var(--text-muted)' }}>✕</button>
              </div>
            </div>
            <iframe src={`${clickUrl}${clickUrl.includes('?') ? '&' : '?'}embedded=true&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`} title="Assinatura Clicksign" allow="camera;geolocation;fullscreen;gyroscope;accelerometer;magnetometer" style={{ flex: 1, border: 0, width: '100%' }} />
          </div>
        </div>
      )}

      {/* P-E.2.4 — Comprovante / registro da assinatura */}
      {comprovante && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setComprovante(null)}>
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(480px,96vw)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>📄 Registro da assinatura</h2>
              <button onClick={() => setComprovante(null)} style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div className="mt-3 rounded-lg p-3 text-sm space-y-1" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>
              <div><b>{comprovante.nome}</b>{comprovante.cargo ? ` · ${comprovante.cargo}` : ''}</div>
              <div style={{ color: 'var(--text-muted)' }}>{comprovante.email}{comprovante.cpf ? ` · CPF ${comprovante.cpf}` : ''}{comprovante.parte ? ` · ${comprovante.parte}` : ''}</div>
              <div style={{ color: 'var(--text-muted)' }}>Assinado em {comprovante.assinado_em ? new Date(comprovante.assinado_em).toLocaleString('pt-BR') : '—'}</div>
            </div>
            {comprovante.image && (
              <div className="mt-3">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Assinatura</span>
                <img src={comprovante.image} alt="assinatura" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4 }} />
              </div>
            )}
            <div className="mt-3 text-[11px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>Evidências</div>
              <div>Método: {comprovante.metodo === 'minutor_traco' ? 'Assinatura nativa (traço)' : 'Aceite eletrônico'}</div>
              <div>IP: {comprovante.ip ?? '—'}</div>
              <div>Hash do documento: <span style={{ fontFamily: 'monospace' }}>{comprovante.doc_hash ?? '—'}</span></div>
              <div>Versão da proposta: {comprovante.doc_version ?? '—'} · {comprovante.codigo}</div>
              {comprovante.user_agent && <div className="truncate">Navegador: {comprovante.user_agent}</div>}
            </div>
          </div>
        </div>
      )}

      {aprovOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !aprovSending && setAprovOpen(false)}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(1040px, 96vw)', height: '92vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} style={{ color: '#2563EB' }} />
                <span className="font-bold" style={{ color: 'var(--text)' }}>Solicitar aprovação {d.codigo ? <span style={{ color: 'var(--primary)' }}>{d.codigo}</span> : null}</span>
              </div>
              <button onClick={() => !aprovSending && setAprovOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="w-[400px] shrink-0 overflow-y-auto p-4 space-y-4" style={{ borderRight: '1px solid var(--border)' }}>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Remetente</label>
                  <div className="text-sm px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>{aprovSender.nome ?? 'Você'}{aprovSender.email ? <span style={{ color: 'var(--text-muted)' }}> · {aprovSender.email}</span> : null}</div>
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Aprovadores (destinatários)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {aprovAprovadores.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: s.aprovou ? 'var(--success-bg)' : 'var(--primary-soft)', color: s.aprovou ? 'var(--success)' : 'var(--primary)' }}>{s.aprovou ? '✔ ' : ''}{s.nome}{s.email ? ` · ${s.email}` : ''}</span>
                    ))}
                    {!aprovAprovadores.length && <span className="text-xs" style={{ color: 'var(--danger)' }}>Nenhum aprovador definido — adicione na seção Assinatura.</span>}
                  </div>
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Assunto</label>
                  <input value={aprovSubject} onChange={e => setAprovSubject(e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
                <div>
                  <label className={lblCls} style={{ color: 'var(--text)' }}>Mensagem</label>
                  <textarea value={aprovMsg} onChange={e => setAprovMsg(e.target.value)} rows={8} className={fieldCls} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <p className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>📋</span><span>Cada aprovador pendente recebe o e-mail <b>como você</b>, com o <b>link individual</b> para revisar e aprovar a proposta no portal.</span>
                </p>
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2 text-[11px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  Prévia do e-mail {aprovPrevLoading && <span style={{ color: 'var(--text-light)' }}>· atualizando…</span>}
                </div>
                <div className="flex-1 overflow-hidden" style={{ background: '#e5e7eb' }}>
                  {aprovHtml ? <iframe srcDoc={aprovHtml} title="prévia do e-mail de aprovação" className="w-full h-full border-0" />
                    : <p className="p-6" style={{ color: 'var(--text-muted)' }}>Gerando prévia…</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !aprovSending && setAprovOpen(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={confirmarSolicitarAprovacao} disabled={aprovSending || !aprovAprovadores.length} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: '#2563EB', color: '#fff' }}><Send size={14} />{aprovSending ? 'Enviando…' : 'Solicitar aprovação'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Engajamento / Portal de Propostas (tracking comercial) ── */}
      {/* ── Modal: Liberação Operacional (Proposal-Centric) ── */}
      {libOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setLibOpen(false)}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(560px, 96vw)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>🔓 Liberação — {d.codigo}</span>
              <button onClick={() => setLibOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {libLoading ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> : !lib ? <p style={{ color: 'var(--text-muted)' }}>Sem dados.</p> : (
                <>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Status: <b style={{ color: 'var(--text)' }}>{String(lib.status).replace(/_/g, ' ')}</b>{lib.umbrella ? <> · guarda-chuva <b>{lib.umbrella}</b></> : <> · <span style={{ color: 'var(--warning)' }}>sem guarda-chuva</span></>}</div>
                  {/* Checklist */}
                  <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <div className="text-[11px] font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>Checklist de Liberação</div>
                    <div className="space-y-1">
                      {(lib.checklist ?? []).map((it: any) => (
                        <div key={it.item_key} className="flex items-center gap-2 text-xs">
                          <button onClick={() => !it.auto && !lib.liberacao && marcarItemLib(it.item_key, !it.checked)} disabled={it.auto || !!lib.liberacao} style={{ color: it.checked ? 'var(--success)' : 'var(--text-light)', cursor: (it.auto || lib.liberacao) ? 'default' : 'pointer' }}>{it.checked ? '☑' : '☐'}</button>
                          <span className="flex-1" style={{ color: 'var(--text)' }}>{it.label}{it.obrigatorio && <span style={{ color: 'var(--danger)' }}> *</span>}{it.auto && <span style={{ color: 'var(--text-light)' }}> (auto)</span>}</span>
                          {it.checked && it.checked_by && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{it.checked_by}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Liberação / Projeto */}
                  {lib.projeto ? (
                    <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>✓ Projeto {lib.projeto.code} gerado ({String(lib.projeto.status).replace(/_/g, ' ')})</div>
                  ) : lib.liberacao ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--success)' }}>✓ Liberado por {lib.liberacao.liberado_por}</span>
                      {lib.pode_gerar_projeto && <button onClick={gerarProjeto} disabled={libBusy} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{libBusy ? '…' : 'Gerar Projeto'}</button>}
                    </div>
                  ) : (
                    <button onClick={liberar} disabled={libBusy || !lib.pode_liberar} className="w-full text-sm font-bold px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: 'var(--success)', color: '#fff' }} title={lib.pode_liberar ? 'Liberar' : 'Conclua os itens obrigatórios'}>{libBusy ? 'Liberando…' : 'Liberar para Execução'}</button>
                  )}
                  {/* Bloqueio */}
                  {lib.bloqueio ? (
                    <div className="rounded-lg px-3 py-1.5 flex items-center justify-between text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><span>🔒 Bloqueado por {lib.bloqueio.bloqueado_por}: {lib.bloqueio.motivo}</span><button onClick={desbloquearLib} style={{ color: 'var(--danger)', fontWeight: 600 }}>Desbloquear</button></div>
                  ) : (
                    <button onClick={bloquearLib} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>🔒 Bloquear operacionalmente</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {engOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setEngOpen(false)}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(720px, 96vw)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2"><Activity size={16} style={{ color: 'var(--primary)' }} /><span className="font-bold" style={{ color: 'var(--text)' }}>Engajamento — {d.codigo}</span></div>
              <button onClick={() => setEngOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              {engLoading ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> : !ana ? <p style={{ color: 'var(--text-muted)' }}>Sem dados.</p> : (
                <>
                  {/* BLOCO 1 — DIAGNÓSTICO EXECUTIVO (uma conclusão) */}
                  {ana.situacao && (() => {
                    const s = ana.situacao
                    const cor = s.nivel === 'verde' ? 'var(--success)' : s.nivel === 'amarelo' ? 'var(--warning)' : 'var(--danger)'
                    const dot = s.nivel === 'verde' ? '🟢' : s.nivel === 'amarelo' ? '🟡' : '🔴'
                    return (
                      <div className="rounded-xl p-4" style={{ background: 'var(--surface-sunken)', borderLeft: `4px solid ${cor}`, border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-base font-extrabold" style={{ color: cor }}>{dot} {s.titulo}</div>
                          <div className="flex items-center gap-1.5">
                            {ana.temperatura && (() => { const t = ana.temperatura; const tc = t.nivel === 'quente' ? 'var(--success)' : t.nivel === 'morna' ? 'var(--warning)' : 'var(--danger)'; const td = t.nivel === 'quente' ? '🔥' : t.nivel === 'morna' ? '🌤️' : '❄️'; return <span className="text-xs font-extrabold px-2 py-1 rounded-full" style={{ background: 'var(--surface)', border: `1px solid ${tc}`, color: tc }}>{td} {t.label}</span> })()}
                            {ana.urgencia && (() => { const u = ana.urgencia; const uc = u.nivel === 'verde' ? 'var(--success)' : u.nivel === 'amarelo' ? 'var(--warning)' : 'var(--danger)'; const ud = u.nivel === 'verde' ? '🟢' : u.nivel === 'amarelo' ? '🟡' : '🔴'; return <span className="text-xs font-extrabold px-2 py-1 rounded-full" style={{ background: 'var(--surface)', border: `1px solid ${uc}`, color: uc }} title="Movimentação da negociação (última interação)">{ud} {u.label}</span> })()}
                          </div>
                        </div>
                        {s.descricao && <div className="text-sm mt-1" style={{ color: 'var(--text)' }}>{s.descricao}</div>}
                        <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Última interação: {haRel(s.ultima_interacao_em)}</div>
                      </div>
                    )
                  })()}

                  {/* BLOCO 2 — O QUE FALTA PARA AVANÇAR (mesma fonte do score; pendência ≠ bloqueio) */}
                  {(() => {
                    const pend: string[] = ana.score_prontidao?.pendencias ?? []
                    const ok = pend.length === 0
                    return (
                      <div className="rounded-xl p-3" style={{ background: ok ? 'var(--success-bg)' : 'var(--warning-bg)', border: `1px solid ${ok ? 'var(--success)' : 'var(--warning)'}` }}>
                        <div className="text-[10px] font-bold uppercase" style={{ color: ok ? 'var(--success)' : 'var(--warning)' }}>O que falta para avançar</div>
                        {ok ? (
                          <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>🟢 Nada pendente. A proposta está pronta para avançar.</div>
                        ) : (
                          <div className="mt-1 space-y-0.5">{pend.map((m, i) => <div key={i} className="text-sm font-semibold" style={{ color: 'var(--text)' }}>🟡 {m}</div>)}</div>
                        )}
                      </div>
                    )
                  })()}

                  {/* BLOCO 3 — QUEM ESTÁ PENDENTE (nominal) */}
                  {ana.pendentes && (() => {
                    const pd = ana.pendentes
                    return (
                      <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                        <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Quem está pendente</div>
                        {pd.todos_concluiram ? (
                          <div className="text-sm font-semibold" style={{ color: 'var(--success)' }}>🟢 Todos os participantes concluíram suas ações.</div>
                        ) : (
                          <div className="space-y-1.5 text-xs">
                            {/* P-E.2.3 — sem aprovador NÃO é erro: é fluxo direto (sem aprovação formal). */}
                            {pd.aprovacao_dispensada && <div className="rounded px-2 py-1" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>ℹ Fluxo direto — sem aprovação formal.</div>}
                            {!pd.sem_aprovador && pd.aprovacao?.length > 0 && <div style={{ color: 'var(--text)' }}><b>Aprovação:</b> {pd.aprovacao.join(', ')}</div>}
                            {pd.sem_assinante && <div className="rounded px-2 py-1 font-bold" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>⚠ Nenhum assinante definido</div>}
                            {!pd.sem_assinante && pd.assinatura?.length > 0 && <div style={{ color: 'var(--text)' }}><b>Assinatura:</b> {pd.assinatura.join(', ')}</div>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* BLOCO 3.4 — ASSINATURA POR PARTE (P-E.2.2) */}
                  {ana.assinatura && !ana.assinatura.sem_assinante && (
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Assinatura</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>{ana.assinatura.modo_label}</span>
                      </div>
                      <div className="space-y-2">
                        {ana.assinatura.grupos.map((g: any) => (
                          <div key={g.parte}>
                            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: g.ok ? 'var(--success)' : 'var(--text)' }}>
                              {g.ok ? '✔' : '⏳'} {g.label} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>({g.assinados}/{g.total})</span>
                            </div>
                            <div className="pl-4 space-y-0.5 mt-0.5">
                              {g.assinantes.map((a: any) => (
                                <div key={a.id} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                                  <span>{a.assinado ? '✔' : a.status === 'refused' ? '✖' : '⏳'}</span>
                                  <span className="truncate">{a.nome}{a.cargo ? <span style={{ color: 'var(--text-muted)' }}> · {a.cargo}</span> : null}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {ana.assinatura.completa
                        ? <div className="text-xs font-semibold mt-2" style={{ color: 'var(--success)' }}>🟢 Critério de assinatura atendido.</div>
                        : ana.assinatura.pendentes_bloqueantes?.length > 0 && <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Bloqueando: {ana.assinatura.pendentes_bloqueantes.map((b: any) => `${b.nome} (${b.parte})`).join(', ')}</div>}
                    </div>
                  )}

                  {/* BLOCO 3.5 — PRÓXIMO MARCO (estágio da jornada, não ação) */}
                  {ana.proximo_marco && (
                    <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                      <span className="text-lg">{ana.proximo_marco.icon}</span>
                      <div className="flex-1"><div className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Próximo marco</div><div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{ana.proximo_marco.label}</div></div>
                      {ana.fluxo && <span className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>{ana.fluxo.tem_aprovacao ? 'Com aprovação' : 'Fluxo direto'}</span>}
                    </div>
                  )}

                  {/* BLOCO 4 — PRÓXIMA AÇÃO RECOMENDADA */}
                  <div className="rounded-xl p-3" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
                    <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--primary)' }}>Próxima ação recomendada</div>
                    <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>{ana.diagnostico?.proximo_passo ?? '—'}</div>
                  </div>

                  {/* BLOCO 5 — SCORES (rebaixados; abaixo da ação) */}
                  <div className="grid grid-cols-2 gap-3">
                    {[['Engajamento', ana.score_engajamento, 'eng'], ['Prontidão', ana.score_prontidao, 'pront']].map(([l, sc]: any) => {
                      const v = sc?.score ?? 0
                      const c = v > 75 ? 'var(--success)' : v > 50 ? 'var(--primary)' : v > 25 ? 'var(--warning)' : 'var(--danger)'
                      return (
                        <div key={l} className="rounded-lg p-2.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>{l}</div>
                          <div className="flex items-baseline gap-1"><span className="text-xl font-extrabold" style={{ color: c }}>{v}</span><span className="text-[10px]" style={{ color: 'var(--text-light)' }}>/100 · {sc?.classificacao ?? '—'}</span></div>
                        </div>
                      )
                    })}
                  </div>
                  {ana.score_prontidao?.componentes?.length > 0 && (
                    <details className="rounded-lg" style={{ border: '1px solid var(--border)' }}>
                      <summary className="text-[11px] font-semibold px-2.5 py-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>Como o score de Prontidão ({ana.score_prontidao.score}/100) é calculado</summary>
                      <div className="px-2.5 pb-2 space-y-1.5">
                        {(() => {
                          const cs = ana.score_prontidao.componentes
                          const pos = cs.filter((c: any) => c.ok); const neg = cs.filter((c: any) => !c.ok)
                          return <>
                            {pos.length > 0 && <div><div className="text-[10px] font-bold uppercase" style={{ color: 'var(--success)' }}>Pontos positivos</div>{pos.map((c: any, i: number) => <div key={i} className="flex justify-between text-xs"><span style={{ color: 'var(--text)' }}>✔ {c.label}</span><span className="font-bold" style={{ color: 'var(--success)' }}>+{c.pontos}</span></div>)}</div>}
                            {neg.length > 0 && <div><div className="text-[10px] font-bold uppercase" style={{ color: 'var(--danger)' }}>Pontos que impedem o avanço</div>{neg.map((c: any, i: number) => <div key={i} className="flex justify-between text-xs"><span style={{ color: 'var(--text)' }}>✖ {c.falta}</span><span style={{ color: 'var(--text-light)' }}>+0</span></div>)}</div>}
                            <div className="flex items-center justify-between text-xs pt-1 mt-1" style={{ borderTop: '1px solid var(--border)' }}><span className="font-bold" style={{ color: 'var(--text)' }}>Total</span><span className="font-extrabold" style={{ color: 'var(--text)' }}>{ana.score_prontidao.score}/100 · {ana.score_prontidao.classificacao}</span></div>
                          </>
                        })()}
                      </div>
                    </details>
                  )}

                  {/* PARTICIPANTES (detalhe) */}
                  {ana.participantes?.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>PARTICIPANTES</div>
                      <div className="space-y-1">
                        {ana.participantes.map((x: any) => {
                          const pend = (x.papeis?.includes('approver') && !x.aprovou) || (x.papeis?.includes('signer') && !x.assinou)
                          const st = x.assinou ? '🟢 Assinou' : x.aprovou ? '🟢 Aprovou' : pend ? '🔴 Pendente' : x.total_acessos > 0 ? '🟡 Visualizou' : '🔴 Não acessou'
                          return (
                            <div key={x.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5" style={{ background: pend ? 'var(--danger-bg)' : 'var(--surface-sunken)' }}>
                              <span className="min-w-0"><b style={{ color: 'var(--text)' }}>{x.nome}</b> <span style={{ color: 'var(--text-light)' }}>{(x.papeis ?? []).join('+')}</span></span>
                              <span className="text-right shrink-0" style={{ color: pend ? 'var(--danger)' : 'var(--text-muted)' }}>{st} · {haRel(x.ultimo_acesso)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* LEITURA DA PROPOSTA (cobertura + conteúdo + acompanhamento) */}
                  {ana.leitura_pdf?.disponivel ? (() => {
                    const L = ana.leitura_pdf; const cobertura = L.leitura.percentual_lido; const e = ana.engajamento ?? {}
                    const permSeg = L.tempo_permanencia_seg ?? 0
                    const permLabel = permSeg < 60 ? `${permSeg}s` : `${Math.round(permSeg / 60)} min`
                    const acessos = e.total_visualizacoes ?? 0
                    const vis = L.visualizadores_identificados ?? 0
                    return (
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                      <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>LEITURA DA PROPOSTA</div>
                      {L.leu_ate_fim && <div className="text-sm font-semibold mb-1" style={{ color: 'var(--success)' }}>✔ Leu até o final da proposta</div>}
                      {!L.leu_ate_fim && L.resumo_humano && <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{L.resumo_humano}</div>}
                      <div className="text-xs mb-2" style={{ color: 'var(--text)' }}><b>Cobertura da leitura:</b> {cobertura}%</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Kpi label="Foi até" value={L.leitura.ultima_pagina_label} />
                        <Kpi label="Maior interesse" value={L.interesse.pagina_mais_vista?.label ?? L.interesse.mensagem ?? '—'} />
                        <Kpi label="Chegou ao Investimento?" value={L.diagnostico.chegou_investimento ? 'Sim' : 'Não'} accent={L.diagnostico.chegou_investimento ? 'var(--success)' : 'var(--danger)'} />
                        <Kpi label="Chegou ao Aceite?" value={L.diagnostico.chegou_aceite ? 'Sim' : 'Não'} accent={L.diagnostico.chegou_aceite ? 'var(--success)' : 'var(--danger)'} />
                        {!L.leu_ate_fim && L.abandono.pagina_abandono && <Kpi label="Abandono" value={L.abandono.pagina_abandono} accent="var(--danger)" />}
                      </div>
                      {/* Acompanhamento temporal */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mt-2 pt-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <span>Primeira leitura: <b style={{ color: 'var(--text)' }}>{haRel(e.primeira_abertura_em)}</b></span>
                        <span>Última leitura: <b style={{ color: 'var(--text)' }}>{haRel(e.ultimo_acesso_em)}</b></span>
                        <span>Aberturas: <b style={{ color: 'var(--text)' }}>{acessos} {acessos === 1 ? 'vez' : 'vezes'}</b>{e.retornos > 0 ? ` (${e.retornos} retorno${e.retornos > 1 ? 's' : ''})` : ''}</span>
                        <span>Leitores identificados: <b style={{ color: 'var(--text)' }}>{vis > 0 ? vis : (acessos > 0 ? 'acesso anônimo' : 0)}</b></span>
                        {permSeg > 0 && <span>Tempo de permanência: <b style={{ color: 'var(--text)' }}>{permLabel}</b></span>}
                      </div>
                    </div>
                  ) })() : <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Leitura da proposta: cliente ainda não abriu o deck.</div>}

                  {/* BLOCO 7 — LINK DA PROPOSTA (sem token) */}
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Link2 size={13} /> Portal da Proposta</span>
                      <div className="flex items-center gap-1.5">
                        {eng?.link_ativo && <button onClick={() => copiar(eng.link_ativo.url)} className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>Copiar Link</button>}
                        <button onClick={gerarLink} disabled={linkBusy} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{linkBusy ? '…' : (eng?.link_ativo ? 'Renovar Link' : 'Gerar Link')}</button>
                      </div>
                    </div>
                    {!eng?.link_ativo && <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>Nenhum link ativo. Gere um link ou envie por e-mail.</p>}
                  </div>

                  {/* BLOCO 8 — HISTÓRICO */}
                  {Array.isArray(eng?.eventos) && eng.eventos.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>HISTÓRICO</div>
                      <div className="space-y-1">
                        {eng.eventos.map((ev: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs"><span className="w-28 shrink-0" style={{ color: 'var(--text-light)' }}>{fmtDT(ev.em)}</span><span style={{ color: 'var(--text)' }}>{EV_LABEL[ev.tipo] ?? ev.tipo}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

const EV_LABEL: Record<string, string> = {
  enviado: '📤 Enviada', visualizado: '👁 Aberta (1ª vez)', revisitado: '🔁 Revisitada',
  baixado: '⬇ PDF baixado', aceito: '✓ Aceita', recusado: '✗ Recusada', expirado: '⏰ Expirada',
  contrato_gerado: '📄 Contrato gerado',
}
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
// Tempo relativo executivo: "agora há pouco", "5 minutos", "2 horas", "1 dia", "7 dias".
const haRel = (iso?: string | null): string => {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} minuto${min === 1 ? '' : 's'}`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} hora${h === 1 ? '' : 's'}`
  const dd = Math.floor(h / 24)
  return `há ${dd} dia${dd === 1 ? '' : 's'}`
}
const fmtDur = (min: number) => min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
const fmtSeg = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)} min`
function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className="text-sm font-bold mt-0.5 truncate" style={{ color: accent ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}
