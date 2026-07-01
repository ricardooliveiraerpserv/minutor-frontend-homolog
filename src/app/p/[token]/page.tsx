'use client'

// Portal de Propostas — página PÚBLICA (sem login). Acessada pelo cliente via link tokenizado.
// P-C.1: experiência nativa por SEÇÕES (HTML) com menu lateral + scroll-spy + tracking de permanência.
// O PDF deixa de ser a navegação principal e vira anexo para download.

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface Section { key: string; title: string; order: number; content: string; data: any; threads_count: number; pending_count: number; page?: number | null }
interface ReviewMessage { id: number; author: string; is_internal: boolean; message: string; created_at: string | null }
interface ReviewThread { id: number; section_key: string; subject: string; status: string; created_by: string | null; resolved_at: string | null; opened_revision: number | null; resolved_revision: number | null; messages: ReviewMessage[] }
interface ReviewSummary { pendentes_total: number; por_secao: { section_key: string; section_title: string; count: number }[]; total_abertas: number; total_resolvidas: number; tempo_medio_resolucao_horas: number | null; ultima_revisao_at: string | null; ultimo_participante: string | null }
interface PortalData {
  codigo: string | null
  tipo_label: string | null
  cliente: string | null
  valor: string
  validade: string | null
  contratada: { nome?: string }
  pdf_url: string
  sections: Section[]
  expirado: boolean
  revogado: boolean
  status: string
  aprovada: boolean
  decisao: 'assinada' | 'recusada' | null
  participantes: Participante[]
  participante: { id: number; name: string; roles: string[] } | null
  pode_revisar: boolean
  pode_aprovar: boolean
  pode_assinar: boolean
  pode_iniciar_assinatura?: boolean
  aprov_pendente_outros?: string[]
  pode_abrir_thread: boolean
  pode_comentar: boolean
  versao: number
  review_summary: ReviewSummary
  // P-E.2.4 — Aprovação e Assinatura integradas
  aprovacao?: AprovacaoBloco
  assinatura?: AssinaturaBloco
  timeline?: { em: string; icon: string; texto: string }[]
  sign_url?: string | null
  envelope_ativo?: boolean
}
interface AprovacaoBloco { tem_aprovacao: boolean; concluida: boolean; pendentes: string[]; itens: { id: number; nome: string; cargo: string | null; status: 'aprovado' | 'pendente' | 'recusado'; data: string | null; comentario: string | null; motivo_recusa: string | null }[] }
interface AssinaturaGrupo { parte: string; label: string; ok: boolean; assinantes: { id: number; nome: string; cargo: string | null; assinado: boolean; data: string | null; status: string | null; motivo: string | null }[] }
interface AssinaturaBloco { modo: string; modo_label: string; status_geral: 'sem_assinantes' | 'nao_enviada' | 'aguardando' | 'concluida'; completa: boolean; grupos: AssinaturaGrupo[]; bloqueadores: { nome: string; parte: string | null }[]; envelope_ativo: boolean }
interface Participante { id: number; name: string; email: string; roles: string[]; cargo?: string | null; parte?: string | null; status: string; approved: boolean; signed: boolean; approved_at?: string | null; signed_at?: string | null }
const dtCurto = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const ROLE_LABEL: Record<string, string> = { viewer: 'Viewer', reviewer: 'Reviewer', approver: 'Approver', signer: 'Signer' }

const C = {
  bg: '#0B1220', surface: '#FFFFFF', ink: '#0F172A', muted: '#64748B',
  teal: '#0E7490', tealDark: '#103A42', border: '#E5E7EB', danger: '#B91C1C',
}

const SECTION_CSS = `
.portal-cols { display:flex; gap:20px; align-items:flex-start; }
.portal-nav { position:sticky; top:16px; width:212px; flex-shrink:0; background:#0F1B2E; border:1px solid #1E293B; border-radius:14px; padding:8px; }
.portal-nav button { display:block; width:100%; text-align:left; background:transparent; border:0; color:#94A3B8; font-size:13px; font-weight:600; padding:9px 12px; border-radius:9px; cursor:pointer; }
.portal-nav button:hover { color:#E2E8F0; background:#16233A; }
.portal-nav button.active { color:#FFFFFF; background:#0E7490; }
.portal-nav button { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.portal-nav .navbadge { font-size:11px; font-weight:800; min-width:18px; height:18px; padding:0 5px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background:#DC2626; color:#fff; }
.portal-nav button.active .navbadge { background:#fff; color:#0E7490; }
.portal-nav a.navpdf { display:block; margin-top:6px; text-align:center; color:#CBD5E1; font-size:12px; font-weight:600; text-decoration:none; padding:9px 12px; border-radius:9px; border:1px solid #334155; }
.rev-summary { background:#13243B; border:1px solid #24344F; border-radius:14px; padding:16px 18px; margin-bottom:16px; }
.rev-summary .top { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.rev-summary .big { font-size:22px; font-weight:800; color:#fff; }
.rev-summary .lbl { font-size:12px; color:#94A3B8; text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
.rev-summary .chips { display:flex; flex-wrap:wrap; gap:8px; }
.rev-summary .chip { font-size:12px; font-weight:700; color:#E2E8F0; background:#1E3350; border:1px solid #2C4A6E; border-radius:999px; padding:5px 11px; }
.rev-summary .chip b { color:#FCA5A5; }
.rev-summary .meta { margin-top:10px; font-size:12px; color:#94A3B8; display:flex; flex-wrap:wrap; gap:14px; }
.deck-wrap { position:relative; flex:1 1 auto; min-width:0; background:#1E293B; border:1px solid #334155; border-radius:16px; overflow:hidden; }
.deck-frame { width:100%; height:94vh; border:0; background:#475569; display:block; }
.cmt-fab { position:absolute; top:14px; right:14px; z-index:5; background:#0E7490; color:#fff; border:0; border-radius:999px; font-size:13px; font-weight:700; padding:9px 16px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); }
.cmt-rail { order:-1; width:360px; flex:0 0 360px; position:sticky; top:16px; max-height:94vh; overflow:auto; background:#FFFFFF; border-radius:16px; padding:16px 16px 8px; box-shadow:0 1px 2px rgba(16,24,40,.06); }
.cmt-rail-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.cmt-collapse { background:transparent; border:0; color:#0E7490; font-size:12px; font-weight:700; cursor:pointer; padding:0; }
.cmt-rail .rev-head { color:#0F172A; font-size:14px; font-weight:800; margin:0 0 4px; }
.cmt-note { color:#64748B; font-size:12px; margin:0 0 12px; }
.cmt-sec { border-top:1px solid #EEF1F5; padding-top:10px; margin-top:10px; }
.cmt-sec:first-of-type { border-top:0; margin-top:0; padding-top:0; }
.cmt-sec-h { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#0F172A; font-weight:700; font-size:13px; margin-bottom:2px; }
.cmt-sec-jump { background:transparent; border:0; color:#0F172A; font-weight:700; font-size:13px; cursor:pointer; padding:0; text-align:left; }
.cmt-sec-jump:hover { color:#0E7490; text-decoration:underline; }
.cmt-identify { background:#F4F7FB; border:1px solid #DCE6F2; border-radius:11px; padding:12px; margin:0 0 12px; }
.cmt-identify .ci-h { font-size:12px; font-weight:800; color:#0F172A; margin-bottom:8px; }
.cmt-identify input { width:100%; box-sizing:border-box; padding:8px 10px; margin-bottom:6px; border:1px solid #CBD5E1; border-radius:8px; font-size:13px; color:#0F172A; }
.cmt-identify button { width:100%; padding:8px; border:0; border-radius:8px; background:#0E7490; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
.rev-head { color:#E2E8F0; font-size:13px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; margin:0 2px 10px; }
.sec-card { background:#FFFFFF; border-radius:16px; padding:24px 26px; margin-bottom:16px; scroll-margin-top:16px; box-shadow:0 1px 2px rgba(16,24,40,.04); }
.sec-card > h2 { margin:0 0 14px; font-size:18px; font-weight:800; color:#0F172A; }
.sec-head { display:flex; align-items:center; gap:11px; margin:0 0 16px; }
.sec-head .ico { width:36px; height:36px; flex:none; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; background:#ECFEFF; border:1px solid #CFFAFE; }
.sec-head h2 { margin:0; font-size:18px; font-weight:800; color:#0F172A; }
.sec-head .rule { flex:1; height:1px; background:linear-gradient(90deg,#E2E8F0,transparent); }
/* renderers comerciais */
.r-lead { font-size:15px; font-weight:600; color:#0F172A; line-height:1.6; margin:0 0 12px; }
.r-note { font-size:13px; color:#64748B; line-height:1.6; margin:0 0 14px; }
.r-hl { background:linear-gradient(135deg,#0E7490 0%,#0B1B2E 100%); color:#fff; border-radius:14px; padding:18px 22px; margin:0 0 16px; }
.r-hl .l { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#A5F3FC; }
.r-hl .v { font-size:28px; font-weight:800; margin-top:2px; line-height:1.1; }
.r-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:0 0 6px; }
.r-fcard { background:#F8FAFC; border:1px solid #EEF1F5; border-radius:11px; padding:11px 13px; }
.r-fcard .l { font-size:11px; color:#64748B; text-transform:uppercase; letter-spacing:.04em; }
.r-fcard .v { font-size:14px; font-weight:700; color:#0F172A; margin-top:3px; }
.r-callout { display:flex; gap:11px; background:#F8FAFC; border:1px solid #EEF1F5; border-left:3px solid #0E7490; border-radius:11px; padding:12px 14px; margin:8px 0 0; }
.r-callout .ci { font-size:17px; line-height:1.4; }
.r-callout .ch { font-weight:700; color:#0F172A; font-size:13px; margin-bottom:3px; }
.r-callout .ct { font-size:13px; color:#334155; line-height:1.6; white-space:pre-line; }
.r-callout .r-prose-p { font-size:13px; color:#334155; line-height:1.6; margin:0; }
.r-prose { color:#0F172A; font-size:14px; line-height:1.7; }
.r-prose-p { margin:0 0 12px; }
.r-prose-ul { margin:0 0 12px; padding-left:20px; }
.r-prose-ul li { margin:4px 0; }
.r-checks { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; margin:6px 0 0; }
.r-chk { display:flex; gap:8px; align-items:flex-start; font-size:14px; color:#0F172A; line-height:1.5; }
.r-chk .ck { color:#16A34A; font-weight:900; flex:none; }
.r-badge { display:inline-block; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#0E7490; background:#ECFEFF; border:1px solid #A5F3FC; border-radius:999px; padding:4px 12px; margin:0 0 12px; }
.r-step { display:flex; gap:12px; align-items:center; background:#F8FAFC; border:1px solid #EEF1F5; border-radius:12px; padding:14px 16px; }
.r-step .num { width:40px; height:40px; flex:none; border-radius:10px; background:#0E7490; color:#fff; font-weight:800; font-size:16px; display:flex; align-items:center; justify-content:center; }
.r-step .v { font-size:15px; font-weight:700; color:#0F172A; }
.r-step .l { font-size:11px; color:#64748B; text-transform:uppercase; letter-spacing:.05em; }
.r-dl { display:inline-flex; align-items:center; gap:9px; background:#0E7490; color:#fff; font-weight:700; font-size:14px; padding:13px 22px; border-radius:11px; text-decoration:none; }
.sec-html { color:#0F172A; font-size:14px; line-height:1.7; }
.sec-html p { margin:0 0 12px; }
.sec-html ul { margin:0 0 12px; padding-left:20px; }
.sec-html li { margin:4px 0; }
.sec-html h4 { margin:16px 0 6px; font-size:14px; font-weight:700; color:#0F172A; }
.sec-html .lead { font-size:15px; font-weight:600; }
.sec-html .badge { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#0E7490; background:#ECFEFF; border:1px solid #A5F3FC; border-radius:999px; padding:3px 10px; margin:0 0 12px; }
.sec-html .total { font-size:16px; }
.sec-html dl.facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 16px; margin:8px 0 4px; }
.sec-html dl.facts > div { display:flex; flex-direction:column; padding:8px 0; border-bottom:1px solid #EEF1F5; }
.sec-html dl.facts dt { font-size:11px; color:#64748B; text-transform:uppercase; letter-spacing:.04em; }
.sec-html dl.facts dd { margin:2px 0 0; font-size:14px; font-weight:600; }
.sec-html a.dl { color:#0E7490; font-weight:600; }
@media (max-width:880px){ .portal-cols{flex-direction:column} .cmt-rail{order:0;width:100%;flex:1 1 auto;position:static;max-height:none} .deck-frame{height:70vh} }
`

// useSearchParams exige Suspense no build de produção (next build/Render) — wrapper abaixo.
export default function PortalProposta() {
  return <Suspense fallback={null}><PortalPropostaInner /></Suspense>
}

function PortalPropostaInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = String(params?.token ?? '')
  // Identificação persistente: URL (?pt=) tem prioridade; senão recupera do localStorage (não pede de novo a cada refresh).
  const [pt, setPt] = useState(() => {
    const fromUrl = searchParams?.get('pt') ?? ''
    if (fromUrl) return fromUrl
    if (typeof window !== 'undefined' && token) { try { return window.localStorage.getItem(`minutor_pt:${token}`) ?? '' } catch { return '' } }
    return ''
  })
  // Grava o pt (localStorage + URL) sempre que identificado, para sobreviver a refresh.
  useEffect(() => {
    if (!pt || !token || typeof window === 'undefined') return
    try { window.localStorage.setItem(`minutor_pt:${token}`, pt) } catch { /* noop */ }
    const url = new URL(window.location.href)
    if (url.searchParams.get('pt') !== pt) { url.searchParams.set('pt', pt); window.history.replaceState(null, '', url.toString()) }
  }, [pt, token])
  const deckRef = useRef<HTMLIFrameElement>(null)
  const idNameRef = useRef<HTMLInputElement>(null)
  const focarIdentificacao = () => { setRailOpen(true); setTimeout(() => { idNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); idNameRef.current?.focus() }, 60) }
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [decided, setDecided] = useState<'assinada' | 'recusada' | null>(null)
  const [partOpen, setPartOpen] = useState(false)
  const [np, setNp] = useState<{ name: string; email: string; roles: string[] }>({ name: '', email: '', roles: [] })
  const [railOpen, setRailOpen] = useState(true)

  const load = useCallback(async (tentativa = 0) => {
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}${pt ? `?pt=${encodeURIComponent(pt)}` : ''}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      if (res.status === 404) { setErro('Proposta não encontrada. Verifique o link recebido.'); return }
      if (!res.ok) {
        // Auto-retry em falha transitória (5xx/proxy) antes de desistir (absorve recompile do dev).
        if (res.status >= 500 && tentativa < 4) { await new Promise(r => setTimeout(r, 800 * (tentativa + 1))); return load(tentativa + 1) }
        setErro('Não foi possível carregar a proposta.'); return
      }
      const j = await res.json()
      setData(j?.data ?? null)
      setDecided(j?.data?.decisao ?? null)
      setErro(null)
    } catch {
      if (tentativa < 4) { await new Promise(r => setTimeout(r, 800 * (tentativa + 1))); return load(tentativa + 1) }
      setErro('Falha de conexão ao carregar a proposta.')
    }
    finally { setLoading(false) }
  }, [token, pt])

  useEffect(() => { void load() }, [load])

  // P-E.2.4 — Atualização em tempo real do status de assinatura: ao voltar à aba (retorno do Clicksign)
  // e por polling enquanto a proposta aguarda assinaturas.
  useEffect(() => {
    if (!data || data.expirado || data.revogado) return
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    const aguardando = data.status === 'aguardando_assinatura' || data.assinatura?.status_geral === 'aguardando'
    const id = aguardando ? setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15000) : undefined
    return () => { document.removeEventListener('visibilitychange', onVisible); if (id) clearInterval(id) }
  }, [data, load])

  // Heartbeat de permanência: a cada 25s enquanto a aba está visível.
  const acc = useRef(0)
  useEffect(() => {
    if (!data || data.expirado || data.revogado) return
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      acc.current += 25
      void fetch(`/api/v1/p/${encodeURIComponent(token)}/heartbeat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: 25 }), keepalive: true,
      }).catch(() => {})
    }
    const id = setInterval(beat, 25000)
    return () => clearInterval(id)
  }, [data, token])

  // Tracking de engajamento por seção (section_entered/exited) — disparado ao abrir/fechar o painel de comentários.
  const engaged = useRef<{ key: string; since: number } | null>(null)
  const sendSection = useCallback((key: string, action: 'entered' | 'exited', duration?: number) => {
    const body = JSON.stringify({ section_key: key, action, duration_seconds: duration ?? 0, pt })
    const url = `/api/v1/p/${encodeURIComponent(token)}/secao`
    try {
      if (action === 'exited' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      } else {
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
      }
    } catch { /* tracking é best-effort */ }
  }, [token, pt])

  const trackSection = useCallback((key: string, open: boolean) => {
    const prev = engaged.current
    if (open) {
      if (prev && prev.key !== key) sendSection(prev.key, 'exited', Math.round((Date.now() - prev.since) / 1000))
      sendSection(key, 'entered'); engaged.current = { key, since: Date.now() }
    } else if (prev && prev.key === key) {
      sendSection(key, 'exited', Math.round((Date.now() - prev.since) / 1000)); engaged.current = null
    }
  }, [sendSection])

  // P-E.1.1 — leitura real do PDF: o deck (iframe) posta eventos de página; encaminhamos ao backend.
  const postPagina = useCallback((body: any) => {
    const payload = JSON.stringify({ ...body, pt })
    const url = `/api/v1/p/${encodeURIComponent(token)}/pagina`
    try {
      if ((body.action === 'pagina_saida' || body.action === 'pdf_fechado') && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
      } else {
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
      }
    } catch { /* best-effort */ }
  }, [token, pt])
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d: any = ev.data
      if (!d || d.__deck !== 1) return
      if (d.type === 'pdf_aberto') postPagina({ action: 'pdf_aberto', total_pages: d.total })
      else if (d.type === 'pagina_visualizada') postPagina({ action: 'pagina_visualizada', page: d.page, total_pages: d.total })
      else if (d.type === 'pagina_saida') postPagina({ action: 'pagina_saida', page: d.page, total_pages: d.total, duration_seconds: d.duration_seconds })
      else if (d.type === 'pdf_fechado') postPagina({ action: 'pdf_fechado', page: d.page, total_pages: d.total, duration_seconds: d.duration_seconds })
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [postPagina])
  const gotoPage = (page?: number | null) => { if (page) deckRef.current?.contentWindow?.postMessage({ __deckCmd: 'goto', page }, '*') }

  // Fecha a seção corrente ao sair da página (duração final).
  useEffect(() => {
    const flush = () => { const c = engaged.current; if (c) { sendSection(c.key, 'exited', Math.round((Date.now() - c.since) / 1000)); engaged.current = null } }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis); flush() }
  }, [sendSection])

  const post = async (acao: string, body?: any) => {
    setActing(true)
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}/${acao}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...(body ?? {}), pt }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j?.message ?? 'Não foi possível concluir a ação.'); return false }
      await load()
      return true
    } finally { setActing(false) }
  }
  const aprovar = () => { if (!window.confirm('Aprovar comercialmente esta proposta?')) return; const c = window.prompt('Comentário (opcional):') ?? ''; void post('aprovar', { comentario: c.trim() }) }
  const [signOpen, setSignOpen] = useState(false)   // P-E.2.4 — assinatura NATIVA (padrão)
  const [clickOpen, setClickOpen] = useState(false) // Clicksign embedado (autenticação jurídica)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [dadosOpen, setDadosOpen] = useState(false) // modal de dados do assinante
  const [dados, setDados] = useState<{ nome: string; cpf: string }>({ nome: '', cpf: '' })
  const [enviadoEmail, setEnviadoEmail] = useState<string | null>(null) // info: assinatura enviada por e-mail (Clicksign)
  const backdropDown = useRef(false) // só fecha no backdrop se o mousedown começou nele (não em seleção de texto)
  // Ao clicar Assinar → abre o modal para o assinante confirmar/preencher os próprios dados (nome completo + CPF).
  const assinar = () => { setDados({ nome: data?.participante?.name ?? '', cpf: '' }); setDadosOpen(true) }
  // "Baixar proposta assinada": confirma no Clicksign (refresh), regenera o PDF com a página de registro, atualiza a tela e baixa.
  const baixarAssinada = async () => {
    setActing(true)
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}/sincronizar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ pt }) })
      const j = await res.json().catch(() => ({}))
      await load() // atualiza a tela do portal (status/assinaturas)
      if (j?.data?.assinada) {
        window.open(`/api/v1/p/${encodeURIComponent(token)}/pdf?ts=${Date.now()}`, '_blank')
      } else {
        alert('A assinatura ainda não foi concluída por todas as partes. Assim que todos assinarem, baixe a proposta assinada aqui.')
      }
    } catch { alert('Não foi possível confirmar a assinatura agora. Tente novamente em instantes.') }
    finally { setActing(false) }
  }
  // Confirma os dados e segue: assina DENTRO do Minutor via Clicksign embedado (fallback nativo se em stub).
  const confirmarDadosEAssinar = async () => {
    if (!dados.nome.trim() || dados.nome.trim().split(/\s+/).length < 2) { alert('Informe seu nome completo (nome e sobrenome).'); return }
    setActing(true)
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}/iniciar-assinatura`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ pt, nome: dados.nome.trim(), cpf: dados.cpf.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j?.message ?? 'Não foi possível iniciar a assinatura.'); return }
      setDadosOpen(false)
      if (j?.data?.ja_assinou) { await load(); return }
      if (j?.data?.por_email) { setEnviadoEmail(j?.data?.email ?? (data?.participante?.name ? '' : '')); await load(); return }
      if (j?.data?.stub || !j?.data?.sign_url) { setSignOpen(true) } // fallback nativo (Clicksign em stub)
      else { setSignUrl(j.data.sign_url); setClickOpen(true) }       // Clicksign embedado
    } catch { alert('Falha de conexão ao iniciar a assinatura.') }
    finally { setActing(false) }
  }
  const enviarAssinatura = async (dados: { nome: string; cpf: string; cargo: string; imagem: string }) => {
    const ok = await post('assinar', dados)
    if (ok) { setSignOpen(false) }
  }
  const sairIdentificacao = () => {
    // limpa antes de zerar o pt; o efeito [load] recarrega sozinho ao mudar o pt (sem closure stale).
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(`minutor_pt:${token}`) } catch { /* noop */ }
      const url = new URL(window.location.href); url.searchParams.delete('pt'); window.history.replaceState(null, '', url.toString())
    }
    setSoVisualiza(false); setIdEmail(''); setErro(null); setPt('')
  }
  const solicitarRevisao = () => { const m = window.prompt('Descreva a revisão desejada:') ?? ''; if (m.trim()) void post('revisao', { motivo: m.trim() }) }
  const toggleRole = (r: string) => setNp(s => ({ ...s, roles: s.roles.includes(r) ? s.roles.filter(x => x !== r) : [...s.roles, r] }))
  // Identificação por E-MAIL: só quem está cadastrado recebe seus papéis; e-mail desconhecido = só visualiza.
  const [idEmail, setIdEmail] = useState('')
  const [soVisualiza, setSoVisualiza] = useState(false)
  const identificar = async () => {
    if (!idEmail.trim()) { alert('Informe o e-mail cadastrado na proposta.'); return }
    setActing(true)
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}/identificar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email: idEmail.trim() }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j?.data?.matched && j?.data?.pt) { setPt(j.data.pt); setIdEmail(''); setSoVisualiza(false) }
      else if (res.ok && j?.data?.matched === false) { setSoVisualiza(true) }
      else alert(j?.message ?? 'Não foi possível identificar você.')
    } finally { setActing(false) }
  }
  // Abrir o painel de uma seção posiciona o deck na página correspondente + tracking.
  const onSectionToggle = (key: string, open: boolean) => {
    trackSection(key, open)
    if (open) { const sec = (data?.sections ?? []).find(s => s.key === key); gotoPage(sec?.page) }
  }
  const addParticipante = async () => {
    if (!np.name.trim() || !np.email.trim() || !np.roles.length) { alert('Preencha nome, e-mail e ao menos um papel.'); return }
    setActing(true)
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}/participantes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(np) })
      if (res.ok) { setNp({ name: '', email: '', roles: [] }); setPartOpen(false); await load() }
      else { const j = await res.json().catch(() => ({})); alert(j?.message ?? 'Erro ao adicionar participante.') }
    } finally { setActing(false) }
  }
  const recusar = async () => {
    setActing(true)
    try {
      const res = await fetch(`/api/v1/p/${encodeURIComponent(token)}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ motivo }),
      })
      if (res.ok) { setDecided('recusada'); setRejectOpen(false) }
      else { const j = await res.json().catch(() => ({})); alert(j?.message ?? 'Não foi possível registrar a recusa.') }
    } finally { setActing(false) }
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '24px 16px', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: SECTION_CSS }} />
      <div style={{ maxWidth: 1680, margin: '0 auto' }}>{children}</div>
    </div>
  )

  if (loading) return wrap(<div style={{ color: '#CBD5E1', textAlign: 'center', padding: 80 }}>Carregando proposta…</div>)
  if (erro) return wrap(<div style={{ background: C.surface, borderRadius: 16, padding: 40, textAlign: 'center', color: C.ink }}><h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Ops</h1><p style={{ color: C.muted, marginTop: 8 }}>{erro}</p><button onClick={() => { setErro(null); setLoading(true); void load() }} style={{ marginTop: 16, padding: '10px 22px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: C.teal, color: '#fff', border: 0, cursor: 'pointer' }}>Tentar novamente</button></div>)
  if (!data) return null

  const indisponivel = data.revogado || data.expirado
  const decisaoFinal = decided ?? data.decisao
  const sections = data.sections ?? []

  return wrap(
    <>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#5EEAD4', fontSize: 11, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase' }}>
            Proposta Comercial{data.tipo_label ? ` · ${data.tipo_label}` : ''}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
            {data.codigo}{data.cliente ? <span style={{ color: '#94A3B8', fontWeight: 500 }}> · {data.cliente}</span> : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>Investimento</div>
          <div style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 800 }}>{data.valor}</div>
          {data.validade && <div style={{ color: '#64748B', fontSize: 12 }}>válida até {data.validade}</div>}
        </div>
      </div>

      {/* Avisos de estado */}
      {data.revogado && <Banner color="#7F1D1D" text="Este link foi revogado. Solicite uma nova proposta ao seu contato comercial." />}
      {data.expirado && !data.revogado && <Banner color="#78350F" text="Esta proposta expirou. Fale com o seu contato comercial para uma nova versão." />}
      {decisaoFinal === 'assinada' && <Banner color="#064E3B" text="✓ Proposta assinada. Obrigado! Em breve nosso time dará sequência." />}
      {decisaoFinal === 'recusada' && <Banner color="#7F1D1D" text="Proposta recusada. Agradecemos o retorno." />}
      {!decisaoFinal && !indisponivel && data.aprovada && <Banner color="#0E7490" text="✓ Proposta aprovada. Falta apenas a assinatura para concluir." />}
      {!decisaoFinal && !indisponivel && data.status === 'em_revisao' && <Banner color="#78350F" text="Revisão solicitada — nosso time está preparando uma nova versão." />}

      {/* P-E.2.4 — Barra de identificação sempre visível (login do portal). */}
      {!indisponivel && (
        <div style={{ background: '#0F1B2E', border: '1px solid #1E293B', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          {data.participante ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#E2E8F0', fontSize: 14 }}>✓ Identificado como <b>{data.participante.name}</b> <span style={{ color: '#64748B' }}>· {(data.participante.roles ?? []).map(r => ROLE_LABEL[r] ?? r).join(' + ')}</span></span>
              <button onClick={sairIdentificacao} style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', background: 'transparent', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Trocar / Sair</button>
            </div>
          ) : soVisualiza ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#FCD34D', fontSize: 13 }}>👁 Acesso de visualização — este e-mail não está cadastrado para agir nesta proposta.</span>
              <button onClick={() => { setSoVisualiza(false); setIdEmail('') }} style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', background: 'transparent', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Tentar outro e-mail</button>
            </div>
          ) : (
            <div>
              <div style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🔒 Identifique-se para aprovar/assinar</div>
              <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>Informe o e-mail cadastrado na proposta. Outros e-mails têm acesso de visualização.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={idEmail} onChange={e => setIdEmail(e.target.value)} placeholder="Seu e-mail" type="email" onKeyDown={e => { if (e.key === 'Enter') void identificar() }}
                  style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0B1220', color: '#E2E8F0', fontSize: 14 }} />
                <button onClick={identificar} disabled={acting} style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: C.teal, border: 0, borderRadius: 8, padding: '9px 18px', cursor: 'pointer' }}>{acting ? '…' : 'Identificar'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Governança P-C — resumo executivo de revisões pendentes */}
      {!indisponivel && data.review_summary?.pendentes_total > 0 && <ReviewSummaryCard s={data.review_summary} />}

      {/* A PROPOSTA REAL (deck) é a visão principal; os comentários ficam na MESMA página, à direita,
          e SOMENTE em Escopo, Investimento e Prazo de Pagamento. Rail recolhível p/ ampliar as páginas. */}
      <div className="portal-cols">
        <div className="deck-wrap">
          <iframe ref={deckRef} src={`/api/v1/p/${encodeURIComponent(token)}/deck-html`} title="Proposta" className="deck-frame" />
          {!indisponivel && sections.length > 0 && !railOpen && (
            <button className="cmt-fab" onClick={() => setRailOpen(true)} title="Mostrar comentários">💬 Comentários</button>
          )}
        </div>
        {!indisponivel && sections.length > 0 && railOpen && (
          <aside className="cmt-rail">
            <div className="cmt-rail-top">
              <div className="rev-head">💬 Comentários e Revisões</div>
              <button className="cmt-collapse" onClick={() => setRailOpen(false)} title="Ocultar e ampliar a proposta">⟩ ocultar</button>
            </div>
            <p className="cmt-note">Disponível em Escopo, Investimento e Prazo de Pagamento. Abrir uma seção posiciona a proposta na página correspondente.</p>
            {!data.participante && !soVisualiza && (
              <div className="cmt-identify">
                <div className="ci-h">Identifique-se com seu e-mail</div>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 6px' }}>Apenas e-mails cadastrados na proposta podem revisar, aprovar ou assinar. Outros e-mails têm acesso de visualização.</p>
                <input ref={idNameRef} value={idEmail} onChange={e => setIdEmail(e.target.value)} placeholder="Seu e-mail" type="email" />
                <button onClick={identificar} disabled={acting}>{acting ? '…' : 'Identificar'}</button>
              </div>
            )}
            {!data.participante && soVisualiza && (
              <div className="cmt-identify">
                <div className="ci-h">Acesso de visualização</div>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 6px' }}>Este e-mail não está cadastrado como participante desta proposta. Você pode visualizar o conteúdo. Para revisar/aprovar/assinar, use o e-mail cadastrado ou solicite acesso ao seu contato comercial.</p>
                <button onClick={() => { setSoVisualiza(false); setIdEmail('') }}>Tentar outro e-mail</button>
              </div>
            )}
            {sections.map(s => (
              <div key={s.key} className="cmt-sec">
                <div className="cmt-sec-h"><button className="cmt-sec-jump" onClick={() => gotoPage(s.page)} title="Ir para esta página na proposta">{SECTION_ICON[s.key] ?? '💬'} {s.title}</button>{s.pending_count > 0 && <span className="navbadge">{s.pending_count}</span>}</div>
                <ReviewPanel
                  token={token} pt={pt} sectionKey={s.key} sectionTitle={s.title} count={s.threads_count ?? 0}
                  canOpen={data.pode_abrir_thread} canComment={data.pode_comentar} onChanged={load} onToggle={onSectionToggle}
                  identified={!!data.participante} onNeedIdentify={focarIdentificacao}
                />
              </div>
            ))}
          </aside>
        )}
      </div>

      {/* Barra de ações */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href={data.pdf_url} target="_blank" rel="noreferrer" download
            style={{ color: '#CBD5E1', fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '12px 18px', borderRadius: 10, border: '1px solid #334155' }}>
            ⬇ Baixar PDF
          </a>
          {(decisaoFinal === 'assinada' || data.aprovada || data.assinatura?.status_geral === 'aguardando' || data.assinatura?.status_geral === 'concluida') && (
            <button onClick={baixarAssinada} disabled={acting}
              style={{ padding: '12px 20px', borderRadius: 10, fontWeight: 800, fontSize: 14, color: '#FFF', background: '#16A34A', border: 0, cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
              {acting ? 'Confirmando…' : '⬇ Baixar proposta assinada'}
            </button>
          )}
        </div>
        {!decisaoFinal && !indisponivel && (data.pode_aprovar || data.pode_assinar || data.pode_iniciar_assinatura) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {data.pode_revisar && <button onClick={solicitarRevisao} disabled={acting}
              style={{ padding: '12px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#FCD34D', background: 'transparent', border: '1px solid #78350F', cursor: 'pointer' }}>
              Solicitar revisão
            </button>}
            {data.pode_aprovar && <button onClick={() => setRejectOpen(true)} disabled={acting}
              style={{ padding: '12px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#FCA5A5', background: 'transparent', border: '1px solid #7F1D1D', cursor: 'pointer' }}>
              Recusar
            </button>}
            {data.pode_aprovar && <button onClick={aprovar} disabled={acting}
              style={{ padding: '12px 26px', borderRadius: 10, fontWeight: 800, fontSize: 14, color: '#FFFFFF', background: C.teal, border: 0, cursor: 'pointer' }}>
              {acting ? '…' : 'Aprovar proposta'}
            </button>}
            {(data.pode_assinar || data.pode_iniciar_assinatura) && <button onClick={assinar} disabled={acting}
              style={{ padding: '12px 30px', borderRadius: 10, fontWeight: 800, fontSize: 14, color: '#FFFFFF', background: '#16A34A', border: 0, cursor: 'pointer' }}>
              {acting ? 'Abrindo…' : '✍ Assinar proposta'}
            </button>}
          </div>
        )}
        {!decisaoFinal && !indisponivel && !data.pode_aprovar && !data.pode_iniciar_assinatura && (data.aprov_pendente_outros?.length ?? 0) > 0 && data.participante?.roles?.includes('signer') && (
          <div style={{ color: '#FCD34D', fontSize: 13, fontWeight: 600 }}>⏳ Assinatura liberada após a aprovação de {data.aprov_pendente_outros!.join(', ')}.</div>
        )}
      </div>

      {/* P-E.2.4 — Aprovação e Assinatura */}
      <div style={{ background: C.surface, borderRadius: 14, padding: 20, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink }}>Aprovação e Assinatura</h2>
          {!indisponivel && <button onClick={() => setPartOpen(o => !o)} style={{ fontSize: 13, fontWeight: 600, color: C.teal, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ Adicionar</button>}
        </div>

        {/* Bloco 1 — Aprovação */}
        {data.aprovacao?.tem_aprovacao && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: C.muted }}>APROVAÇÃO</div>
            <div style={{ marginTop: 6 }}>
              {data.aprovacao.itens.map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600, color: C.ink, fontSize: 14 }}>
                      {a.status === 'aprovado' ? '✔' : a.status === 'recusado' ? '❌' : '⏳'} {a.nome}
                      {a.cargo ? <span style={{ color: C.muted, fontWeight: 400 }}> · {a.cargo}</span> : null}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: a.status === 'aprovado' ? '#0E7490' : a.status === 'recusado' ? C.danger : C.muted }}>
                      {a.status === 'aprovado' ? 'Aprovado' : a.status === 'recusado' ? 'Recusado' : 'Pendente'}
                      {a.data && <span style={{ display: 'block', fontWeight: 400, fontSize: 10, color: C.muted, textAlign: 'right' }}>{dtCurto(a.data)}</span>}
                    </span>
                  </div>
                  {a.motivo_recusa && <div style={{ fontSize: 12, color: C.danger, marginTop: 2, fontStyle: 'italic' }}>“{a.motivo_recusa}”</div>}
                  {a.comentario && a.status === 'aprovado' && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{a.comentario}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bloco 2 — Assinatura */}
        {data.assinatura && data.assinatura.status_geral !== 'sem_assinantes' && (() => {
          const a = data.assinatura!
          const geral = a.status_geral === 'concluida' ? { t: '✔ Proposta formalizada', c: '#16A34A' }
            : a.status_geral === 'aguardando' ? { t: '⏳ Aguardando assinaturas', c: '#B45309' }
              : { t: 'Aguardando envio para assinatura', c: C.muted }
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: C.muted }}>ASSINATURA DA PROPOSTA</div>
                <span style={{ fontSize: 11, color: C.muted }}>{a.modo_label}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: geral.c, marginTop: 4 }}>{geral.t}</div>
              {a.grupos.map(g => (
                <div key={g.parte} style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.ok ? '#16A34A' : C.ink }}>{g.ok ? '✔' : '⏳'} {g.label}</div>
                  {g.assinantes.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 6px 14px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 13, color: C.ink }}>
                        {s.assinado ? '✔' : s.status === 'refused' ? '❌' : '⏳'} {s.nome}{s.cargo ? <span style={{ color: C.muted }}> · {s.cargo}</span> : null}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: s.assinado ? '#16A34A' : C.muted, textAlign: 'right' }}>
                        {s.assinado ? 'Assinado' : s.status === 'refused' ? 'Recusou' : 'Pendente'}
                        {s.data && <span style={{ display: 'block', fontWeight: 400, fontSize: 10, color: C.muted }}>{dtCurto(s.data)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {a.bloqueadores.length > 0 && (
                <div style={{ marginTop: 10, background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>Faltam assinaturas de:</div>
                  {a.bloqueadores.map((b, i) => <div key={i} style={{ fontSize: 12, color: '#92400E' }}>• {b.nome}{b.parte ? ` (${b.parte})` : ''}</div>)}
                </div>
              )}
            </div>
          )
        })()}

        {partOpen && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={np.name} onChange={e => setNp(s => ({ ...s, name: e.target.value }))} placeholder="Nome" style={{ flex: 1, minWidth: 140, padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, color: C.ink }} />
              <input value={np.email} onChange={e => setNp(s => ({ ...s, email: e.target.value }))} placeholder="E-mail" style={{ flex: 1, minWidth: 160, padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, color: C.ink }} />
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
              {['viewer', 'reviewer', 'approver', 'signer'].map(r => (
                <label key={r} style={{ fontSize: 13, color: C.ink, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={np.roles.includes(r)} onChange={() => toggleRole(r)} /> {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <button onClick={addParticipante} disabled={acting} style={{ padding: '10px 20px', borderRadius: 10, fontWeight: 700, background: C.teal, color: '#fff', border: 0, cursor: 'pointer' }}>{acting ? '…' : 'Adicionar e convidar'}</button>
            </div>
          </div>
        )}
      </div>

      {/* P-E.2.4 — Histórico da Formalização */}
      {data.timeline && data.timeline.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 14, padding: 20, marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink }}>Histórico da Formalização</h2>
          <div style={{ marginTop: 12 }}>
            {data.timeline.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: i < data.timeline!.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize: 13, color: C.ink }}>{t.texto}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{dtCurto(t.em)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 28 }}>
        {data.contratada?.nome || 'ERPSERV Consultoria'} · proposta gerada pelo Minutor
      </div>

      {/* Modal de recusa */}
      {rejectOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onMouseDown={e => { backdropDown.current = e.target === e.currentTarget }}
          onMouseUp={e => { if (!acting && e.target === e.currentTarget && backdropDown.current) setRejectOpen(false); backdropDown.current = false }}>
          <div style={{ background: C.surface, borderRadius: 14, padding: 24, width: 'min(480px,95vw)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink }}>Recusar proposta</h2>
            <p style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>Se puder, conte o motivo — ajuda nosso time a ajustar.</p>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={4} placeholder="Motivo (opcional)"
              style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, resize: 'vertical', color: C.ink }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setRejectOpen(false)} disabled={acting} style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 14, background: '#F1F5F9', color: C.ink, border: 0, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={recusar} disabled={acting} style={{ padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: C.danger, color: '#FFF', border: 0, cursor: 'pointer' }}>{acting ? 'Enviando…' : 'Confirmar recusa'}</button>
            </div>
          </div>
        </div>
      )}

      {/* P-E.2.4 — Info: assinatura conduzida pelo Clicksign via e-mail */}
      {enviadoEmail !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 55 }} onClick={() => setEnviadoEmail(null)}>
          <div style={{ background: C.surface, borderRadius: 14, padding: 28, width: 'min(460px,95vw)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 34 }}>✉️</div>
            <h2 style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 800, color: C.ink }}>Assinatura enviada via Clicksign</h2>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
              Enviamos o link de assinatura{enviadoEmail ? <> para <b style={{ color: C.ink }}>{enviadoEmail}</b></> : ' por e-mail'}. Abra o e-mail e conclua pelo Clicksign (com o código). O status atualiza automaticamente.
            </p>
            <button onClick={() => setEnviadoEmail(null)} style={{ marginTop: 18, padding: '11px 26px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: C.teal, color: '#FFF', border: 0, cursor: 'pointer' }}>Entendi</button>
          </div>
        </div>
      )}

      {/* P-E.2.4 — Modal de DADOS do assinante (nome completo + CPF) antes de seguir p/ assinatura */}
      {dadosOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onMouseDown={e => { backdropDown.current = e.target === e.currentTarget }}
          onMouseUp={e => { if (!acting && e.target === e.currentTarget && backdropDown.current) setDadosOpen(false); backdropDown.current = false }}>
          <div style={{ background: C.surface, borderRadius: 14, padding: 24, width: 'min(440px,95vw)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink }}>✍ Dados para a assinatura</h2>
            <p style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>Confirme seus dados antes de assinar. O nome deve ser completo (nome e sobrenome).</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 12 }}>Nome completo</label>
            <input value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} placeholder="Ex.: Ricardo Oliveira"
              style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.ink }} />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 12 }}>CPF</label>
            <input value={dados.cpf} onChange={e => setDados({ ...dados, cpf: e.target.value })} placeholder="000.000.000-00" inputMode="numeric"
              style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.ink }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setDadosOpen(false)} disabled={acting} style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 14, background: '#F1F5F9', color: C.ink, border: 0, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarDadosEAssinar} disabled={acting} style={{ padding: '10px 22px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: '#16A34A', color: '#FFF', border: 0, cursor: 'pointer' }}>{acting ? 'Abrindo…' : 'Continuar p/ assinar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* P-E.2.4 — Assinatura NATIVA do Minutor (padrão): traço + dados + evidências */}
      {signOpen && <SignatureModal defaultName={dados.nome || (data.participante?.name ?? '')} acting={acting} onClose={() => setSignOpen(false)} onSubmit={enviarAssinatura} />}

      {/* Clicksign embedado (validade jurídica reforçada — opcional) */}
      {clickOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }} onClick={() => setClickOpen(false)}>
          <div style={{ background: C.surface, borderRadius: 14, overflow: 'hidden', width: 'min(900px,96vw)', height: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 800, color: C.ink }}>✍ Assinatura eletrônica <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>· autenticada por Clicksign</span></span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {signUrl && <a href={signUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>abrir em nova aba ↗</a>}
                <button onClick={() => { setClickOpen(false); void load() }} style={{ background: 'transparent', border: 0, color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            {signUrl ? (
              <iframe src={`${signUrl}${signUrl.includes('?') ? '&' : '?'}embedded=true&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`} title="Assinatura Clicksign" allow="camera;geolocation;fullscreen;gyroscope;accelerometer;magnetometer" style={{ flex: 1, border: 0, width: '100%' }} />
            ) : (
              <div style={{ padding: 28, textAlign: 'center', color: C.muted }}>Não foi possível iniciar a assinatura via Clicksign. Use a assinatura do Minutor.</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// Assinatura em tela (canvas) + dados do signatário.
function SignatureModal({ defaultName, acting, onClose, onSubmit, onClicksign }: { defaultName: string; acting: boolean; onClose: () => void; onSubmit: (d: { nome: string; cpf: string; cargo: string; imagem: string }) => void; onClicksign?: () => void }) {
  const C = { surface: '#FFFFFF', ink: '#0F172A', muted: '#64748B', teal: '#0E7490', border: '#E5E7EB' }
  const [nome, setNome] = useState(defaultName)
  const [cpf, setCpf] = useState('')
  const [cargo, setCargo] = useState('')
  const [temTraco, setTemTraco] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0F172A'
    const pos = (e: any) => { const r = cv.getBoundingClientRect(); const t = e.touches?.[0]; return { x: ((t?.clientX ?? e.clientX) - r.left) * (cv.width / r.width), y: ((t?.clientY ?? e.clientY) - r.top) * (cv.height / r.height) } }
    const down = (e: any) => { e.preventDefault(); drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    const move = (e: any) => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setTemTraco(true) }
    const up = () => { drawing.current = false }
    cv.addEventListener('mousedown', down); cv.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up)
    return () => { cv.removeEventListener('mousedown', down); cv.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); cv.removeEventListener('touchstart', down); cv.removeEventListener('touchmove', move); window.removeEventListener('touchend', up) }
  }, [])
  const limpar = () => { const cv = canvasRef.current; const ctx = cv?.getContext('2d'); if (cv && ctx) { ctx.clearRect(0, 0, cv.width, cv.height); setTemTraco(false) } }
  const confirmar = () => {
    if (!nome.trim()) { alert('Informe o nome completo.'); return }
    if (!temTraco) { alert('Desenhe sua assinatura no quadro.'); return }
    onSubmit({ nome: nome.trim(), cpf: cpf.trim(), cargo: cargo.trim(), imagem: canvasRef.current?.toDataURL('image/png') ?? '' })
  }
  const inp = { width: '100%', padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.ink, marginTop: 8, boxSizing: 'border-box' as const }
  const bdDown = useRef(false)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
      onMouseDown={e => { bdDown.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (!acting && e.target === e.currentTarget && bdDown.current) onClose(); bdDown.current = false }}>
      <div style={{ background: C.surface, borderRadius: 14, padding: 24, width: 'min(520px,96vw)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink }}>✍ Assinar Proposta</h2>
        <p style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>Confirme seus dados e desenhe sua assinatura. Isso formaliza o aceite.</p>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" style={inp} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="CPF" style={{ ...inp, flex: 1 }} />
          <input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Cargo" style={{ ...inp, flex: 1 }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Assinatura</span>
            <button onClick={limpar} style={{ fontSize: 12, color: C.teal, background: 'transparent', border: 0, cursor: 'pointer' }}>Limpar</button>
          </div>
          <canvas ref={canvasRef} width={460} height={160} style={{ width: '100%', height: 160, border: `1px dashed ${C.border}`, borderRadius: 10, background: '#F8FAFC', touchAction: 'none', cursor: 'crosshair' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={acting} style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 14, background: '#F1F5F9', color: C.ink, border: 0, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={confirmar} disabled={acting} style={{ padding: '10px 22px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: '#16A34A', color: '#FFF', border: 0, cursor: 'pointer' }}>{acting ? 'Assinando…' : '✍ Assinar'}</button>
        </div>
        {onClicksign && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
            <button onClick={onClicksign} disabled={acting} style={{ background: 'transparent', border: 0, color: C.teal, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Precisa de validade jurídica reforçada? Assinar via Clicksign ↗
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Banner({ color, text }: { color: string; text: string }) {
  return <div style={{ background: color, color: '#FFFFFF', borderRadius: 12, padding: '12px 18px', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{text}</div>
}

// "há 2 horas" / "há 3 dias" — tempo relativo simples.
function haCerca(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

// Resumo executivo de revisões — "o que está travando esta proposta?"
function ReviewSummaryCard({ s }: { s: ReviewSummary }) {
  return (
    <div className="rev-summary">
      <div className="top"><span className="big">{s.pendentes_total}</span><span className="lbl">{s.pendentes_total === 1 ? 'revisão aberta' : 'revisões abertas'}</span></div>
      <div className="chips">
        {s.por_secao.map(x => <span key={x.section_key} className="chip">{x.section_title} <b>{x.count}</b></span>)}
      </div>
      <div className="meta">
        {s.ultima_revisao_at && <span>Última revisão {haCerca(s.ultima_revisao_at)}{s.ultimo_participante ? ` · ${s.ultimo_participante}` : ''}</span>}
        <span>Resolvidas: {s.total_resolvidas}</span>
        {s.tempo_medio_resolucao_horas != null && <span>Tempo médio: {s.tempo_medio_resolucao_horas}h</span>}
      </div>
    </div>
  )
}

// ───────────────────────── Proposal Theme Renderer ─────────────────────────
// Cada seção tem um renderer visual próprio (ícones/badges/cards/banners/grids),
// para o Portal preservar a identidade da proposta comercial. Fallback = HTML do snapshot.
const SECTION_ICON: Record<string, string> = {
  resumo_executivo: '✦', escopo: '🎯', premissas: '📌', cronograma: '🗓️',
  investimento: '💰', observacoes: '📝', aceite: '🤝', anexos: '📎',
}

// P-C.2 — painel de Comentários e Revisões de UMA seção.
function ReviewPanel({ token, pt, sectionKey, sectionTitle, count, canOpen, canComment, onChanged, onToggle, identified, onNeedIdentify }: {
  token: string; pt: string; sectionKey: string; sectionTitle: string; count: number; canOpen: boolean; canComment: boolean; onChanged: () => void; onToggle?: (key: string, open: boolean) => void; identified?: boolean; onNeedIdentify?: () => void
}) {
  const [open, setOpen] = useState(false)
  const toggleOpen = () => setOpen(o => { const n = !o; onToggle?.(sectionKey, n); return n })
  const [threads, setThreads] = useState<ReviewThread[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [novo, setNovo] = useState(false)
  const [subj, setSubj] = useState('')
  const [msg, setMsg] = useState('')
  const [reply, setReply] = useState<Record<number, string>>({})

  const STAT: Record<string, { label: string; color: string }> = {
    aberta: { label: 'Aberta', color: '#B45309' }, respondida: { label: 'Respondida', color: '#0E7490' }, resolvida: { label: 'Resolvida', color: '#16A34A' },
  }
  const base = `/api/v1/p/${encodeURIComponent(token)}`
  const carregar = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`${base}/secao/${encodeURIComponent(sectionKey)}/threads`).then(r => r.json()); setThreads(r?.data ?? []) }
    catch { /* */ } finally { setLoading(false) }
  }, [base, sectionKey])
  useEffect(() => { if (open) void carregar() }, [open, carregar])

  const postJson = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...body, pt }) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.message ?? 'Erro') }
    return res.json()
  }
  const abrir = async () => {
    if (!subj.trim() || !msg.trim()) { alert('Informe o assunto e a mensagem.'); return }
    setBusy(true)
    try { await postJson(`${base}/secao/${encodeURIComponent(sectionKey)}/threads`, { subject: subj.trim(), message: msg.trim() }); setSubj(''); setMsg(''); setNovo(false); await carregar(); onChanged() }
    catch (e: any) { alert(e.message) } finally { setBusy(false) }
  }
  const responder = async (id: number) => {
    const txt = (reply[id] ?? '').trim(); if (!txt) return
    setBusy(true)
    try { await postJson(`${base}/threads/${id}/mensagens`, { message: txt }); setReply(s => ({ ...s, [id]: '' })); await carregar(); onChanged() }
    catch (e: any) { alert(e.message) } finally { setBusy(false) }
  }
  const resolver = async (id: number) => {
    if (!window.confirm('Marcar esta revisão como resolvida?')) return
    setBusy(true)
    try { await postJson(`${base}/threads/${id}/resolver`, {}); await carregar(); onChanged() }
    catch (e: any) { alert(e.message) } finally { setBusy(false) }
  }

  const bd = '#E5E7EB', ink = '#0F172A', muted = '#64748B', teal = '#0E7490'
  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${bd}`, paddingTop: 12 }}>
      <button onClick={toggleOpen} style={{ background: 'transparent', border: 0, color: teal, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}>
        💬 Comentários e Revisões ({count}) {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {loading ? <p style={{ color: muted, fontSize: 13 }}>Carregando…</p> : threads.length === 0 ? (
            <p style={{ color: muted, fontSize: 13 }}>Nenhuma discussão nesta seção ainda.</p>
          ) : threads.map(t => (
            <div key={t.id} style={{ border: `1px solid ${bd}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 700, color: ink, fontSize: 14 }}>{t.subject}</div>
                <span style={{ fontSize: 11, fontWeight: 800, color: STAT[t.status]?.color ?? muted }}>{STAT[t.status]?.label ?? t.status}</span>
              </div>
              {(t.opened_revision || t.resolved_revision) && (
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                  {t.opened_revision ? `Aberta na v${String(t.opened_revision).padStart(2, '0')}` : ''}
                  {t.resolved_revision ? ` · Resolvida na v${String(t.resolved_revision).padStart(2, '0')}` : ''}
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.messages.map(m => (
                  <div key={m.id} style={{ background: m.is_internal ? '#ECFEFF' : '#F8FAFC', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: m.is_internal ? teal : muted }}>{m.author}</div>
                    <div style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap', marginTop: 2 }}>{m.message}</div>
                  </div>
                ))}
              </div>
              {canComment && t.status !== 'resolvida' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input value={reply[t.id] ?? ''} onChange={e => setReply(s => ({ ...s, [t.id]: e.target.value }))} placeholder="Responder…"
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${bd}`, fontSize: 13, color: ink }} />
                  <button onClick={() => responder(t.id)} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: teal, color: '#fff', border: 0, cursor: 'pointer' }}>Enviar</button>
                </div>
              )}
              {canComment && t.status !== 'resolvida' && (
                <button onClick={() => resolver(t.id)} disabled={busy} style={{ marginTop: 8, background: 'transparent', border: 0, color: '#16A34A', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 }}>✓ Marcar como resolvida</button>
              )}
            </div>
          ))}

          {!identified && <button onClick={onNeedIdentify} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: teal, border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>🔒 Identifique-se para comentar</button>}
          {identified && !canOpen && !canComment && <p style={{ fontSize: 12, color: muted }}>Seu acesso é somente leitura nesta proposta.</p>}
          {canOpen && !novo && <button onClick={() => setNovo(true)} style={{ fontSize: 13, fontWeight: 600, color: teal, background: 'transparent', border: `1px solid ${bd}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>+ Nova discussão</button>}
          {canOpen && novo && (
            <div style={{ border: `1px solid ${bd}`, borderRadius: 10, padding: 12, marginTop: 4 }}>
              <input value={subj} onChange={e => setSubj(e.target.value)} placeholder={`Assunto (sobre ${sectionTitle})`} style={{ width: '100%', padding: 9, borderRadius: 8, border: `1px solid ${bd}`, fontSize: 14, color: ink, boxSizing: 'border-box' }} />
              <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} placeholder="Sua dúvida ou solicitação…" style={{ width: '100%', marginTop: 8, padding: 9, borderRadius: 8, border: `1px solid ${bd}`, fontSize: 14, color: ink, resize: 'vertical', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button onClick={() => { setNovo(false); setSubj(''); setMsg('') }} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, background: '#F1F5F9', color: ink, border: 0, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={abrir} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: teal, color: '#fff', border: 0, cursor: 'pointer' }}>{busy ? '…' : 'Abrir discussão'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
