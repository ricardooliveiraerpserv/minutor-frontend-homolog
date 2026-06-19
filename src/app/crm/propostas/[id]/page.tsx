'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { ArrowLeft, ArrowRight, FileDown, Save, Image as ImageIcon, ChevronDown, ChevronRight, Plus, Minus, Trash2, ArrowUp, ArrowDown, Type } from 'lucide-react'

type EscopoBlock =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'titulo'; conteudo: string; alinhamento?: 'left' | 'center' | 'right' }
  | { tipo: 'imagem'; attachment_id: number; largura?: number; alinhamento?: 'left' | 'center' | 'right'; legenda?: string }

const TIPOS = [
  { v: 'bh_fixo', label: 'Banco de Horas Fixo' },
  { v: 'bh_mensal', label: 'Banco de Horas Mensal' },
  { v: 'on_demand', label: 'Consultoria Sob Demanda' },
  { v: 'projeto_fechado', label: 'Projeto Fechado' },
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
  id: number; codigo: string | null; tipo: string; versao: number; status: string
  data_emissao: string | null; data_validade: string | null; valor: number; total: number; document_id: number | null
  modo_faturamento: string
  inputs: Record<string, unknown>; calc: Record<string, number>; conteudo: Record<string, any>
  defaults: Record<string, any>; contratada: Record<string, string>
  customer: { id: number; name: string; cgc: string | null } | null; vendedor: { name: string } | null
}
interface Preview { codigo: string | null; calc: Record<string, number>; slides: string[]; overlays: (string | null)[]; html?: string }

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
function NumRow({ label, value, onChange, step = '1' }: { label: React.ReactNode; value: string; onChange: (v: string) => void; step?: string }) {
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
  const id = Number(params?.id)
  const [d, setD] = useState<Detail | null>(null)
  const [inputs, setInputs] = useState<Record<string, any>>({})
  const [conteudo, setConteudo] = useState<Record<string, any>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({ ident: true, calc: true, escopo: false, invest: false, prazo: false, aceite: false, paginas: false, contrato: false, capa: false })
  // Tipos p/ os seletores de geração do contrato (metadados — não aparecem no PDF).
  const [ctOptions, setCtOptions] = useState<{ id: number; name: string }[]>([])
  const [stOptions, setStOptions] = useState<{ id: number; name: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const escopoFileRef = useRef<HTMLInputElement>(null)

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
      for (const sec of ['escopo', 'investimento', 'prazo', 'aceite', 'contrato']) merged[sec] = { ...(base[sec] || {}), ...((det.conteudo || {})[sec] || {}) }
      if ((det.conteudo || {}).logo_attachment_id) merged.logo_attachment_id = det.conteudo.logo_attachment_id
      setConteudo(merged)
    }).catch(() => toast.error('Erro ao carregar proposta'))
  }, [id])

  // Opções de Tipo de Contrato / Tipo de Serviço (mesmas do modal de contrato).
  useEffect(() => {
    api.get<any>('/contract-types?pageSize=100').then(r => setCtOptions((r?.items ?? r?.data ?? r ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {})
    api.get<any>('/service-types?pageSize=100').then(r => setStOptions((r?.items ?? r?.data ?? r ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {})
  }, [])

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
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, data_emissao: d.data_emissao, data_validade: d.data_validade, tipo: d.tipo, modo_faturamento: d.modo_faturamento })
      toast.success('Proposta salva'); refreshPreview()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  const gerarPdf = async () => {
    setGerando(true)
    try {
      await api.put(`/crm/proposals/${id}/editar`, { inputs, conteudo, data_emissao: d.data_emissao, data_validade: d.data_validade, tipo: d.tipo, modo_faturamento: d.modo_faturamento })
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
  // Ajuste de posição/tamanho do logo na capa (conteudo.logo).
  const logoOffX = Number(conteudo.logo?.offset_x ?? 0)
  const logoOffY = Number(conteudo.logo?.offset_y ?? 0)
  const logoEsc = Number(conteudo.logo?.escala ?? 100)
  const setLogoCfg = (patch: Record<string, number>) => setConteudo(p => ({ ...p, logo: { ...(p.logo || {}), ...patch } }))

  // "Horas sob demanda": texto livre + atalhos p/ trocar só o valor e o dia + liga/desliga.
  const sobText: string = conteudo.investimento?.sob_demanda ?? ''
  const sobOn = conteudo.investimento?.sob_demanda_on !== false
  const setSob = (t: string) => setCont('investimento', 'sob_demanda', t)
  const curValor = sobText.match(/R\$\s?([\d.]*,?\d+)/)?.[1] ?? ''
  const curDia = sobText.match(/dia\s?(\d{1,2})/i)?.[1] ?? ''
  const setSobValor = (v: string) => setSob(sobText.replace(/R\$\s?[\d.]*,?\d+/, `R$ ${v}`))
  const setSobDia = (dia: string) => setSob(sobText.replace(/dia\s?\d{1,2}/i, `dia ${dia}`))

  // Despesas SP / fora: mesmo conceito (texto livre + valor + liga/desliga).
  const spText: string = conteudo.investimento?.despesas_sp ?? ''
  const spOn = conteudo.investimento?.despesas_sp_on !== false
  const spContrato = conteudo.investimento?.despesas_sp_contrato !== false
  const setSp = (t: string) => setCont('investimento', 'despesas_sp', t)
  const spValor = spText.match(/R\$\s?([\d.]*,?\d+)/)?.[1] ?? ''
  const setSpValor = (v: string) => setSp(spText.replace(/R\$\s?[\d.]*,?\d+/, `R$${v}`))
  const foraText: string = conteudo.investimento?.despesas_fora ?? ''
  const foraOn = conteudo.investimento?.despesas_fora_on !== false
  const setFora = (t: string) => setCont('investimento', 'despesas_fora', t)
  const foraValor = foraText.match(/R\$\s?([\d.]*,?\d+)/)?.[1] ?? ''
  const setForaValor = (v: string) => setFora(foraText.replace(/R\$\s?[\d.]*,?\d+/, `R$${v}`))

  // Prazo e Pagamento: textos fixos onde só o NÚMERO edita (início/pagamento/parcelas) + 2 campos livres (valor %/vencimento).
  const inicioText: string = conteudo.prazo?.inicio_atendimento ?? ''
  const inicioDias = inicioText.match(/(\d{1,3})\s*dias/i)?.[1] ?? ''
  const setInicioDias = (n: string) => setCont('prazo', 'inicio_atendimento', inicioText.replace(/\d{1,3}(\s*dias)/i, `${n}$1`))
  const despDiaText: string = conteudo.prazo?.pagamento_despesas ?? ''
  const despDia = despDiaText.match(/dia\s+(\d{1,2})/i)?.[1] ?? ''
  const setDespDia = (n: string) => setCont('prazo', 'pagamento_despesas', despDiaText.replace(/(dia\s+)\d{1,2}/i, `$1${n}`))
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
                <select value={d.tipo} onChange={e => { const nt = e.target.value; setD({ ...d, tipo: nt, modo_faturamento: nt === 'projeto_fechado' ? 'valor_fixo' : 'por_hora' }); setConteudo(p => ({ ...p, card_texto: CARD_DEFAULTS[nt] ?? CARD_DEFAULTS.bh_fixo })) }} className={fieldCls} style={inputStyle}>
                  {TIPOS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Data da proposta (capa)</span>
                <input type="date" value={d.data_emissao || ''} onChange={e => setD({ ...d, data_emissao: e.target.value })} className={fieldCls} style={inputStyle} />
              </label>
            </Section>

            <Section title="Capa / Logo do cliente" open={open.capa} onToggle={() => setOpen(o => ({ ...o, capa: !o.capa }))}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><ImageIcon size={15} />{conteudo.logo_attachment_id ? 'Trocar logo' : 'Enviar logo do cliente'}</button>
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
              <TextRow label="Objetivo (texto da capa)" rows={3} value={conteudo.escopo?.objetivo ?? ''} onChange={v => setCont('escopo', 'objetivo', v)} placeholder="Vazio = gerado automático (horas + serviço). Preencha para escrever seu próprio objetivo." />
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
                        <textarea rows={4} value={b.conteudo} onChange={e => updateBlock(i, { conteudo: e.target.value })} placeholder="Texto do escopo (uma linha por item/bullet)…" className={fieldCls} style={inputStyle} />
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

            <Section title="Investimento" open={open.invest} onToggle={() => setOpen(o => ({ ...o, invest: !o.invest }))}>
              <TextRow label="Texto do card (vale p/ Investimento e Prazo)" rows={2} value={conteudo.card_texto ?? CARD_DEFAULTS[d.tipo] ?? ''} onChange={v => setConteudo(p => ({ ...p, card_texto: v }))} />
              <div>
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
              <div>
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
              <div>
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
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Títulos e textos extras (posição por item; paginam se não couber)</span>
                <ExtrasEditor items={conteudo.investimento?.extras ?? []} onChange={next => setCont('investimento', 'extras', next)} />
              </div>
            </Section>

            <Section title="Prazo e Pagamento" open={open.prazo} onToggle={() => setOpen(o => ({ ...o, prazo: !o.prazo }))}>
              <div className="grid grid-cols-2 gap-2 items-end">
                <NumRow label={<>Início do atendimento<br />(dias úteis)</>} value={inicioDias} onChange={setInicioDias} />
                {tipo === 'bh_fixo' && <NumRow label="Duração do serviço (meses)" value={String(inputs.duracao_meses ?? 12)} onChange={v => setInput('duracao_meses', v === '' ? '' : Number(v))} />}
              </div>
              {(tipo === 'bh_fixo' || isProjeto) && (
                <div className="grid grid-cols-3 gap-2">
                  <NumRow label="Parcelas (Nx)" value={parcelasNum} onChange={setParcelasNum} />
                  <TextRow label="Valor %" value={conteudo.prazo?.valor_pct ?? ''} onChange={v => setCont('prazo', 'valor_pct', v)} />
                  <TextRow label="Vencimento" value={conteudo.prazo?.vencimento ?? ''} onChange={v => setCont('prazo', 'vencimento', v)} />
                </div>
              )}
              <NumRow label="Pagamento das despesas — dia do mês" value={despDia} onChange={setDespDia} />
              <div className="pt-1">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Títulos e textos extras (posição por item; paginam se não couber)</span>
                <ExtrasEditor items={conteudo.prazo?.extras ?? []} onChange={next => setCont('prazo', 'extras', next)} />
              </div>
            </Section>

            <Section title="Aceite" open={open.aceite} onToggle={() => setOpen(o => ({ ...o, aceite: !o.aceite }))}>
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

            <Section title="Dados para o contrato (não aparece na proposta)" open={open.contrato} onToggle={() => setOpen(o => ({ ...o, contrato: !o.contrato }))}>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                Define o que será carregado ao gerar o contrato (ao ganhar a oportunidade). Não é exibido no PDF da proposta.
              </p>
              <label className="block mb-2">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo de Contrato</span>
                <select value={conteudo.contrato?.contract_type_id ?? ''} onChange={e => setCont('contrato', 'contract_type_id', e.target.value)} className={fieldCls} style={inputStyle}>
                  <option value="">— selecionar —</option>
                  {ctOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block mb-2">
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo de Serviço</span>
                <select value={conteudo.contrato?.service_type_id ?? ''} onChange={e => setCont('contrato', 'service_type_id', e.target.value)} className={fieldCls} style={inputStyle}>
                  <option value="">— selecionar —</option>
                  {stOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
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
            </Section>

            <Section title="Páginas (incluir / remover)" open={open.paginas} onToggle={() => setOpen(o => ({ ...o, paginas: !o.paginas }))}>
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
            </Section>
          </div>

          {/* PREVIEW — iframe com o mesmo HTML do PDF (paginação do escopo idêntica) */}
          <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
            {!preview?.html ? <p style={{ color: 'var(--text-muted)' }}>Gerando pré-visualização…</p> : (
              <div className="mx-auto" style={{ maxWidth: 980 }}>
                <PreviewFrame html={preview.html} />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
