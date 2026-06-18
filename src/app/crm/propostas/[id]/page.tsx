'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { ArrowLeft, FileDown, Save, Image as ImageIcon, ChevronDown, ChevronRight } from 'lucide-react'

const TIPOS = [
  { v: 'bh_fixo', label: 'Banco de Horas Fixo' },
  { v: 'bh_mensal', label: 'Banco de Horas Mensal' },
  { v: 'on_demand', label: 'Consultoria Sob Demanda' },
  { v: 'projeto_fechado', label: 'Projeto Fechado' },
]
const fmtBRL = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Detail {
  id: number; codigo: string | null; tipo: string; versao: number; status: string
  data_emissao: string | null; data_validade: string | null; valor: number; total: number; document_id: number | null
  modo_faturamento: string
  inputs: Record<string, unknown>; calc: Record<string, number>; conteudo: Record<string, any>
  defaults: Record<string, any>; contratada: Record<string, string>
  customer: { id: number; name: string; cgc: string | null } | null; vendedor: { name: string } | null
}
interface Preview { codigo: string | null; calc: Record<string, number>; slides: string[]; overlays: (string | null)[] }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'w-full text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lblCls = 'text-[11px] font-semibold block mb-0.5'

function Section({ title, children, open, onToggle }: { title: string; children: React.ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg mb-2" style={{ border: '1px solid var(--border)' }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold" style={{ color: 'var(--text)' }}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{title}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}
function NumRow({ label, value, onChange, step = '1' }: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <label className="block">
      <span className={lblCls} style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input type="number" step={step} value={value} onChange={e => onChange(e.target.value)} className={fieldCls} style={inputStyle} />
    </label>
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

export default function PropostaEditor() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params?.id)
  const [d, setD] = useState<Detail | null>(null)
  const [inputs, setInputs] = useState<Record<string, any>>({})
  const [conteudo, setConteudo] = useState<Record<string, any>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({ ident: true, calc: true, escopo: false, invest: false, prazo: false, capa: false })
  const fileRef = useRef<HTMLInputElement>(null)

  // carrega a proposta
  useEffect(() => {
    if (!id) return
    api.get<{ data: Detail }>(`/crm/proposals/${id}`).then(r => {
      const det = r?.data; if (!det) return
      setD(det)
      setInputs({ ...(det.inputs || {}) })
      // pré-preenche conteúdo com defaults do deck (intocado = igual default → sem overlay)
      const base = JSON.parse(JSON.stringify(det.defaults || {}))
      const merged = { ...base, ...(det.conteudo || {}) }
      for (const sec of ['escopo', 'investimento', 'prazo']) merged[sec] = { ...(base[sec] || {}), ...((det.conteudo || {})[sec] || {}) }
      if ((det.conteudo || {}).logo_attachment_id) merged.logo_attachment_id = det.conteudo.logo_attachment_id
      setConteudo(merged)
    }).catch(() => toast.error('Erro ao carregar proposta'))
  }, [id])

  // preview debounced
  const tipo = d?.tipo || 'bh_fixo'
  const isProjeto = tipo === 'projeto_fechado'
  const isHoras = tipo === 'bh_fixo' || tipo === 'bh_mensal'
  const refreshPreview = useCallback(() => {
    if (!d) return
    api.post<{ data: Preview }>('/crm/proposals/preview', {
      tipo, inputs, conteudo, codigo: d.codigo, versao: d.versao,
      modo_faturamento: d.modo_faturamento, customer_id: d.customer?.id, data_emissao: d.data_emissao,
    }).then(r => { if (r?.data) setPreview(r.data) }).catch(() => {})
  }, [d, tipo, inputs, conteudo])
  useEffect(() => { const t = setTimeout(refreshPreview, 400); return () => clearTimeout(t) }, [refreshPreview])

  if (!d) return <AppLayout><div className="p-6" style={{ color: 'var(--text-muted)' }}>Carregando…</div></AppLayout>

  const setInput = (k: string, v: any) => setInputs(p => ({ ...p, [k]: v }))
  const setCont = (sec: string, k: string, v: any) => setConteudo(p => ({ ...p, [sec]: { ...(p[sec] || {}), [k]: v } }))
  const calc = preview?.calc || d.calc || {}

  const salvar = async () => {
    setSaving(true)
    try {
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, data_validade: d.data_validade, tipo: d.tipo, modo_faturamento: d.modo_faturamento })
      toast.success('Proposta salva'); refreshPreview()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  const gerarPdf = async () => {
    setGerando(true)
    try {
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, data_validade: d.data_validade, tipo: d.tipo, modo_faturamento: d.modo_faturamento })
      const r = await api.post<{ data: { document_id: number } }>(`/crm/proposals/${id}/gerar`, {})
      if (r?.data?.document_id) window.open(`/api/v1/documents/${r.data.document_id}/download`, '_blank')
      toast.success('PDF gerado')
    } catch { toast.error('Erro ao gerar PDF') } finally { setGerando(false) }
  }
  const uploadLogo = async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await api.post<{ data: { logo_attachment_id: number } }>(`/crm/proposals/${id}/logo`, fd)
      if (r?.data?.logo_attachment_id) { setConteudo(p => ({ ...p, logo_attachment_id: r.data.logo_attachment_id })); toast.success('Logo enviado') }
    } catch { toast.error('Erro no upload do logo') }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-0px)]">
        {/* topo */}
        <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => router.back()} style={{ color: 'var(--text-muted)' }}><ArrowLeft size={18} /></button>
          <div className="flex-1">
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>
              Proposta <span style={{ color: 'var(--primary)' }}>{d.codigo || `#${d.id}`}</span>
              <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-light)' }}>v{d.versao} · {d.status?.replace(/_/g, ' ')}</span>
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.customer?.name} · {TIPOS.find(t => t.v === tipo)?.label}</p>
          </div>
          <button onClick={salvar} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Save size={14} />{saving ? 'Salvando…' : 'Salvar'}</button>
          <button onClick={gerarPdf} disabled={gerando} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><FileDown size={14} />{gerando ? 'Gerando…' : 'Gerar PDF'}</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* FORM */}
          <div className="w-[380px] shrink-0 overflow-y-auto p-4" style={{ borderRight: '1px solid var(--border)' }}>
            <Section title="Identificação" open={open.ident} onToggle={() => setOpen(o => ({ ...o, ident: !o.ident }))}>
              <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                Código <b style={{ color: 'var(--text)' }}>{d.codigo || '—'}</b> · versão {d.versao}<br />
                <span className="text-[10px]">Sequência única do cliente (mesmo código do contrato/projeto ao converter).</span>
              </div>
              <label className="block">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo / template</span>
                <select value={d.tipo} onChange={e => setD({ ...d, tipo: e.target.value, modo_faturamento: e.target.value === 'projeto_fechado' ? 'valor_fixo' : 'por_hora' })} className={fieldCls} style={inputStyle}>
                  {TIPOS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>
              <TextRow label="Validade" value={d.data_validade || ''} onChange={v => setD({ ...d, data_validade: v })} placeholder="AAAA-MM-DD" />
            </Section>

            <Section title="Memória de Cálculo" open={open.calc} onToggle={() => setOpen(o => ({ ...o, calc: !o.calc }))}>
              {isProjeto ? (
                <NumRow label="Valor do projeto (R$)" step="0.01" value={String(inputs.valor_projeto ?? inputs.faturamento_fixo ?? '')} onChange={v => { setInput('valor_projeto', v === '' ? '' : Number(v)); setInput('faturamento_fixo', v === '' ? '' : Number(v)) }} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <NumRow label={tipo === 'bh_mensal' ? 'Horas mensais' : 'Horas'} value={String(inputs.horas_consultoria ?? '')} onChange={v => setInput('horas_consultoria', v === '' ? '' : Number(v))} />
                  <NumRow label="Valor/hora cliente (R$)" step="0.01" value={String(inputs.valor_hora_cliente ?? '')} onChange={v => { setInput('valor_hora_cliente', v === '' ? '' : Number(v)); setInput('venda_h', v === '' ? '' : Number(v)) }} />
                </div>
              )}
              {isHoras && <NumRow label="Duração (meses)" value={String(inputs.duracao_meses ?? 12)} onChange={v => setInput('duracao_meses', v === '' ? '' : Number(v))} />}
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
              {/* resultado da memória de cálculo */}
              <div className="rounded-lg px-3 py-2 text-xs mt-1" style={{ background: 'var(--primary-soft)' }}>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Faturamento</span><b style={{ color: 'var(--text)' }}>{fmtBRL(calc.faturamento ?? 0)}</b></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Custo total</span><span style={{ color: 'var(--text)' }}>{fmtBRL(calc.custo_total ?? 0)}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Margem</span><b style={{ color: (calc.margem_pct ?? 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>{((calc.margem_pct ?? 0) * 100).toFixed(2)}%</b></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Lucro líquido</span><b style={{ color: (calc.lucro_liquido ?? 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtBRL(calc.lucro_liquido ?? 0)}</b></div>
              </div>
            </Section>

            <Section title="Escopo" open={open.escopo} onToggle={() => setOpen(o => ({ ...o, escopo: !o.escopo }))}>
              <TextRow label="Tipo de escopo" value={conteudo.escopo?.tipo_escopo ?? ''} onChange={v => setCont('escopo', 'tipo_escopo', v)} />
              {isProjeto && <TextRow label="Objetivo (descrição do projeto)" rows={2} value={String(inputs.escopo_texto ?? '')} onChange={v => setInput('escopo_texto', v)} />}
              <TextRow label="Escopo funcional" rows={7} value={conteudo.escopo?.escopo_funcional ?? ''} onChange={v => setCont('escopo', 'escopo_funcional', v)} />
            </Section>

            <Section title="Investimento" open={open.invest} onToggle={() => setOpen(o => ({ ...o, invest: !o.invest }))}>
              <TextRow label="Texto do card" rows={2} value={conteudo.investimento?.card_texto ?? ''} onChange={v => setCont('investimento', 'card_texto', v)} />
              <TextRow label="Horas sob demanda" rows={2} value={conteudo.investimento?.sob_demanda ?? ''} onChange={v => setCont('investimento', 'sob_demanda', v)} />
              <TextRow label="Despesas em SP" rows={2} value={conteudo.investimento?.despesas_sp ?? ''} onChange={v => setCont('investimento', 'despesas_sp', v)} />
              <TextRow label="Despesas fora de SP" rows={3} value={conteudo.investimento?.despesas_fora ?? ''} onChange={v => setCont('investimento', 'despesas_fora', v)} />
            </Section>

            <Section title="Prazo e Pagamento" open={open.prazo} onToggle={() => setOpen(o => ({ ...o, prazo: !o.prazo }))}>
              <TextRow label="Texto do card" rows={2} value={conteudo.prazo?.card_texto ?? ''} onChange={v => setCont('prazo', 'card_texto', v)} />
              <TextRow label="Início do atendimento" rows={2} value={conteudo.prazo?.inicio_atendimento ?? ''} onChange={v => setCont('prazo', 'inicio_atendimento', v)} />
              <TextRow label="Pagamento das despesas" rows={2} value={conteudo.prazo?.pagamento_despesas ?? ''} onChange={v => setCont('prazo', 'pagamento_despesas', v)} />
            </Section>

            <Section title="Capa / Logo do cliente" open={open.capa} onToggle={() => setOpen(o => ({ ...o, capa: !o.capa }))}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ImageIcon size={15} />{conteudo.logo_attachment_id ? 'Trocar logo' : 'Enviar logo do cliente'}</button>
              {conteudo.logo_attachment_id && <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>Logo enviado (aparece na capa).</p>}
            </Section>
          </div>

          {/* PREVIEW */}
          <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
            <style>{`@font-face{font-family:'Roboto Condensed';font-weight:100 900;font-style:normal;src:url('/api/v1/crm/proposals/artwork?path=fonts/RobotoCondensed.ttf') format('truetype');}`}</style>
            {!preview ? <p style={{ color: 'var(--text-muted)' }}>Gerando pré-visualização…</p> : (
              <div className="space-y-3 mx-auto" style={{ maxWidth: 980 }}>
                {preview.slides.map((src, i) => (
                  <div key={i} className="relative mx-auto rounded overflow-hidden shadow" style={{ width: '100%', aspectRatio: '1280 / 720', background: '#fff' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: 720, transformOrigin: 'top left', transform: 'scale(var(--pv-scale))', fontFamily: "'Roboto Condensed', Arial, sans-serif" }} ref={el => { if (el?.parentElement) { const w = el.parentElement.clientWidth; el.style.setProperty('--pv-scale', String(w / 1280)) } }}>
                      <img src={src} alt={`slide ${i + 1}`} style={{ position: 'absolute', inset: 0, width: 1280, height: 720 }} />
                      {preview.overlays[i] && <div dangerouslySetInnerHTML={{ __html: preview.overlays[i] as string }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
