'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import { Users, Plus, Trash2, Save, X, Lock, Check, RotateCcw, Settings, Search, Download, Mail, Send, Calculator } from 'lucide-react'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { Button, SkeletonTable, EmptyState, Modal, Badge } from '@/components/ds'

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Coop = 'erpserv' | 'bizify'
interface ApiLanc { descricao: string | null; valor: number | null; coop?: Coop | null }
interface FolhaResumo {
  nome: string | null
  producao: number; variavel: number; reemb: number; reemb_auto: number
  descontos: number; adiantamento: number; total_rend: number; total_debitos: number; liquido: number
}
type Status = 'aberto' | 'finalizado' | 'sem_registro'
interface Diretor { id: number; nome: string; status: Status }
interface Lanc { descricao: string; valor: string; coop: Coop }

const emptyLanc = (): Lanc => ({ descricao: '', valor: '', coop: 'erpserv' })
const numOrNull = (s: string): number | null => {
  const t = s.trim()
  if (t === '' || t === '-') return null
  // "-" na frente = negativo (desconto). Detecta o separador decimal pelo ÚLTIMO
  // "." ou "," — assim "25.000,00", "144,50" e "144.5" são todos lidos certos.
  const neg = t.startsWith('-')
  let body = t.replace(/[^0-9.,]/g, '')
  const lastComma = body.lastIndexOf(',')
  const lastDot = body.lastIndexOf('.')
  if (lastComma > lastDot) {
    body = body.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > -1) {
    body = body.replace(/,/g, '')
  }
  const n = parseFloat(body)
  if (!Number.isFinite(n)) return null
  return neg ? -Math.abs(n) : n
}
const num = (s: string) => numOrNull(s) ?? 0
const fmt = (n: number) => formatBRL(n)
const toStr = (n: number) => String(Math.round(n * 100) / 100)
const mapLancs = (arr: ApiLanc[]): Lanc[] => arr.map(l => ({ descricao: l.descricao ?? '', valor: l.valor != null ? String(l.valor) : '', coop: l.coop === 'bizify' ? 'bizify' : 'erpserv' }))

// Remuneração por Produção (base do INSS) por faixa da Remuneração Total — regra do simulador.
const producaoFaixa = (t: number): number =>
  t > 25000 ? 3194 : t > 20000 ? 2945 : t > 15000 ? 2468 : t > 12000 ? 2260 :
  t > 10000 ? 2102 : t > 8000 ? 1945 : t > 6500 ? 1787 : t >= 4706.68 ? 1692 : (t > 0 ? 1621 : 0)
const INSS_TETO = 8157.41
const INSS_TETO_VALOR = 1631.48
const TX_ADM_DIRETORIA = 1 // %

// Desconto (INSS + Taxa Adm) de um REPASSE (bruto).
const descontoDe = (B: number): number => {
  if (!(B > 0)) return 0
  const P = Math.min(producaoFaixa(B), B)
  const inss = P >= INSS_TETO ? INSS_TETO_VALOR : Math.round(P * 0.20 * 100) / 100
  const taxaAdm = Math.round(B * (TX_ADM_DIRETORIA / 100) * 100) / 100
  return Math.round((inss + taxaAdm) * 100) / 100
}
// Desconto de um REPASSE quando a coop NÃO paga INSS (só Taxa Adm).
const descontoSemInss = (B: number): number =>
  B > 0 ? Math.round(B * (TX_ADM_DIRETORIA / 100) * 100) / 100 : 0
// Gross-up: acha o REPASSE cujo líquido (repasse − desconto) = alvo (valor a receber).
// `desc` permite gross-up com INSS (padrão) ou sem INSS (coop que não recolhe).
const grossUp = (alvo: number, desc: (b: number) => number = descontoDe): number => {
  if (!(alvo > 0)) return 0
  const hi = Math.round(alvo * 1.10 * 100) + 500
  for (let c = Math.round(alvo * 100); c <= hi; c++) {
    const B = c / 100
    if (Math.round((B - desc(B)) * 100) / 100 >= alvo) return B
  }
  return alvo
}

// Seletor compacto ERPSERV/BIZIFY por lançamento.
function CoopPills({ value, onChange, disabled }: { value: Coop; onChange: (c: Coop) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-md overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
      {(['erpserv', 'bizify'] as const).map(c => (
        <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)}
          className="px-2 py-1 text-[10px] font-semibold uppercase transition-colors disabled:opacity-60"
          title={c === 'erpserv' ? 'ERPSERV' : 'BIZIFY'}
          style={value === c
            ? { background: 'var(--brand-primary)', color: '#000' }
            : { background: 'transparent', color: 'var(--text-muted)' }}>
          {c === 'erpserv' ? 'ERP' : 'BIZ'}
        </button>
      ))}
    </div>
  )
}

export default function FechamentoDiretoriaPage() {
  const now = new Date()
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const [year, setYear] = useState<number>(now.getFullYear())
  const [diretores, setDiretores] = useState<Diretor[]>([])
  const [userId, setUserId] = useState<string>('')
  const [status, setStatus] = useState<Status>('sem_registro')
  const [cooperativa, setCooperativa] = useState('')
  const [taxaInss, setTaxaInss] = useState('')
  // Divisão por cooperativa (valor líquido e taxa, cada um entre ERPSERV e BIZIFY)
  const [valCoopErp, setValCoopErp] = useState('')
  const [valCoopBiz, setValCoopBiz] = useState('')
  const [taxCoopErp, setTaxCoopErp] = useState('')
  const [taxCoopBiz, setTaxCoopBiz] = useState('')
  const [inssCoop, setInssCoop] = useState<'erpserv' | 'bizify'>('erpserv') // qual coop paga o INSS
  const [lancs, setLancs] = useState<Lanc[]>([])
  const [adiantamento, setAdiantamento] = useState(0)         // parcelas da rotina no mês (desconto)
  const [adiantamentoDesc, setAdiantamentoDesc] = useState<string | null>(null)
  const [adtoCoop, setAdtoCoop] = useState<Coop>('erpserv')   // coop que recebe o desconto do adiantamento
  const [folha, setFolha] = useState<FolhaResumo | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Envio por e-mail
  const [envioEm, setEnvioEm] = useState<string | null>(null)
  const [envioPor, setEnvioPor] = useState<string | null>(null)
  const [diretorEmail, setDiretorEmail] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null)
  const [reportPreview, setReportPreview] = useState<string | null>(null)
  // Gerenciar diretores
  const [gerirOpen, setGerirOpen] = useState(false)
  const [usuarios, setUsuarios] = useState<{ id: number; nome: string; is_diretor: boolean }[]>([])
  const [buscaUser, setBuscaUser] = useState('')
  const [savingDir, setSavingDir] = useState(false)

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const prevDate = new Date(year, month - 2, 1)
  const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  const finalizado = status === 'finalizado'
  const ro = finalizado
  const diretorNome = diretores.find(d => String(d.id) === userId)?.nome ?? ''

  // Lançamentos (salário − descontos) somam o VALOR A RECEBER (líquido do diretor).
  // O REPASSE à cooperativa é o gross-up disso; a TAXA + INSS incide sobre o REPASSE.
  const taxa = num(taxaInss)
  const somaLanc = Math.round((lancs.reduce((a, l) => a + num(l.valor), 0) - adiantamento) * 100) / 100 // = VALOR A RECEBER (− adiantamento)
  const valorReceber = somaLanc
  const repasse = Math.round((somaLanc + taxa) * 100) / 100 // REPASSE = valor a receber + taxa
  const total = repasse // "Remuneração Total" exibida = REPASSE

  // Cálculo do simulador: gross-up do valor a receber → repasse; taxa incide no repasse.
  const repasseCalc = grossUp(somaLanc)
  const producao = Math.min(repasseCalc, producaoFaixa(repasseCalc))
  const inssCalc = producao >= INSS_TETO ? INSS_TETO_VALOR : Math.round(producao * 0.20 * 100) / 100
  const taxaAdmCalc = Math.round(repasseCalc * (TX_ADM_DIRETORIA / 100) * 100) / 100
  const taxaInssCalc = Math.round((inssCalc + taxaAdmCalc) * 100) / 100 // = repasseCalc − somaLanc
  const liquido = valorReceber

  // Divisão por cooperativa: valores derivados dos lançamentos (cada um marcado p/ uma coop).
  const valSum = Math.round((num(valCoopErp) + num(valCoopBiz)) * 100) / 100
  const taxSum = Math.round((num(taxCoopErp) + num(taxCoopBiz)) * 100) / 100
  const valBate = Math.abs(valSum - liquido) < 0.01
  const taxBate = Math.abs(taxSum - taxa) < 0.01
  // Produção que vai pra cada folha = valor a receber (coop) + taxa (coop) da empresa.
  const prodErp = Math.round((num(valCoopErp) + num(taxCoopErp)) * 100) / 100
  const prodBiz = Math.round((num(valCoopBiz) + num(taxCoopBiz)) * 100) / 100

  // Divisão por cooperativa AUTOMÁTICA: cada lançamento é marcado p/ uma coop e soma no
  // valor líquido dela; o adiantamento (desconto) sai da coop escolhida em `adtoCoop`.
  useEffect(() => {
    if (ro) return
    const r2 = (n: number) => Math.round(n * 100) / 100
    let sErp = lancs.filter(l => l.coop === 'erpserv').reduce((a, l) => a + num(l.valor), 0)
    let sBiz = lancs.filter(l => l.coop === 'bizify').reduce((a, l) => a + num(l.valor), 0)
    if (adtoCoop === 'bizify') sBiz -= adiantamento; else sErp -= adiantamento
    setValCoopErp(toStr(r2(sErp))); setValCoopBiz(toStr(r2(sBiz)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancs, adiantamento, adtoCoop, ro])

  // Taxa por cooperativa AUTOMÁTICA: cada coop é calculada de forma INDEPENDENTE com a
  // mesma montagem (gross-up) sobre o SEU próprio valor — uma coop não influencia a outra.
  // A coop escolhida recolhe o INSS (gross-up completo); a outra leva só a taxa adm
  // (gross-up sem INSS). taxa da coop = repasse(gross-up do seu valor) − seu valor.
  useEffect(() => {
    if (ro) return
    const r2 = (n: number) => Math.round(n * 100) / 100
    const vErp = num(valCoopErp), vBiz = num(valCoopBiz)
    if (vErp <= 0 && vBiz <= 0) return // sem divisão por coop → não mexe na taxa
    const taxaCoop = (v: number, paysInss: boolean) =>
      v > 0 ? r2(grossUp(v, paysInss ? descontoDe : descontoSemInss) - v) : 0
    const tErp = taxaCoop(vErp, inssCoop === 'erpserv')
    const tBiz = taxaCoop(vBiz, inssCoop === 'bizify')
    setTaxCoopErp(toStr(tErp)); setTaxCoopBiz(toStr(tBiz)); setTaxaInss(toStr(r2(tErp + tBiz)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valCoopErp, valCoopBiz, inssCoop, ro])

  const loadDiretores = useCallback(() => {
    api.get<{ data: Diretor[] }>(`/fechamento-diretoria/diretores?year_month=${yearMonth}`)
      .then(r => setDiretores(r.data ?? [])).catch(() => {})
  }, [yearMonth])
  useEffect(() => { loadDiretores() }, [loadDiretores])

  const loadDiretor = useCallback(() => {
    if (!userId) { setLancs([]); setStatus('sem_registro'); setCooperativa(''); setTaxaInss(''); setValCoopErp(''); setValCoopBiz(''); setTaxCoopErp(''); setTaxCoopBiz(''); setFolha(null); setAdiantamento(0); setAdiantamentoDesc(null); setAdtoCoop('erpserv'); return }
    setLoading(true)
    api.get<{ status: Status; cooperativa: string | null; taxa_inss: number | null; valor_coop_erpserv: number | null; valor_coop_bizify: number | null; taxa_coop_erpserv: number | null; taxa_coop_bizify: number | null; diretor_email: string | null; envio_em: string | null; envio_por: string | null; adiantamento_coop?: Coop | null; lancamentos: ApiLanc[]; adiantamento?: number; adiantamento_desc?: string | null }>(`/fechamento-diretoria/${userId}/${yearMonth}`)
      .then(r => {
        setAdiantamento(r.adiantamento ?? 0)
        setAdiantamentoDesc(r.adiantamento_desc ?? null)
        setAdtoCoop(r.adiantamento_coop === 'bizify' ? 'bizify' : 'erpserv')
        setStatus(r.status ?? 'sem_registro')
        setCooperativa(r.cooperativa ?? '')
        setDiretorEmail(r.diretor_email ?? '')
        setEnvioEm(r.envio_em ?? null)
        setEnvioPor(r.envio_por ?? null)
        setTaxaInss(r.taxa_inss != null ? String(r.taxa_inss) : '')
        setValCoopErp(r.valor_coop_erpserv != null ? String(r.valor_coop_erpserv) : '')
        setValCoopBiz(r.valor_coop_bizify != null ? String(r.valor_coop_bizify) : '')
        setTaxCoopErp(r.taxa_coop_erpserv != null ? String(r.taxa_coop_erpserv) : '')
        setTaxCoopBiz(r.taxa_coop_bizify != null ? String(r.taxa_coop_bizify) : '')
        // Deriva qual coop paga o INSS: a que tem taxa acima de 1% do seu valor.
        {
          const inssErp = (r.taxa_coop_erpserv ?? 0) - (r.valor_coop_erpserv ?? 0) * (TX_ADM_DIRETORIA / 100)
          const inssBiz = (r.taxa_coop_bizify ?? 0) - (r.valor_coop_bizify ?? 0) * (TX_ADM_DIRETORIA / 100)
          setInssCoop(inssBiz > inssErp + 0.01 ? 'bizify' : 'erpserv')
        }
        const ls = mapLancs(r.lancamentos ?? [])
        if (ls.length) { setLancs(ls); setLoading(false); return }
        // Sem dados no mês → replica do mês anterior (só pra ajustar e salvar).
        api.get<{ cooperativa: string | null; taxa_inss: number | null; lancamentos: ApiLanc[] }>(`/fechamento-diretoria/${userId}/${prevYM}`)
          .then(p => {
            const pls = mapLancs(p.lancamentos ?? [])
            if (pls.length) {
              setLancs(pls)
              if (!r.cooperativa && p.cooperativa) setCooperativa(p.cooperativa)
              if (r.taxa_inss == null && p.taxa_inss != null) setTaxaInss(String(p.taxa_inss))
              toast.message('Lançamentos importados do mês anterior — ajuste e salve.')
            } else setLancs([emptyLanc()])
          })
          .catch(() => setLancs([emptyLanc()]))
          .finally(() => setLoading(false))
      })
      .catch(() => { toast.error('Erro ao carregar o fechamento do diretor'); setLoading(false) })
    api.get<{ data: FolhaResumo | null }>(`/fechamento-diretoria/folha/${userId}/${yearMonth}`)
      .then(r => setFolha(r.data ?? null)).catch(() => setFolha(null))
  }, [userId, yearMonth, prevYM])
  useEffect(() => { loadDiretor() }, [loadDiretor])

  // Prévia da página = o relatório que vai em PDF anexo — AO VIVO (reflete a tela atual).
  const loadReportPreview = useCallback(() => {
    if (!userId) { setReportPreview(null); return }
    const body = {
      cooperativa: cooperativa.trim() || null,
      taxa_inss: numOrNull(taxaInss),
      valor_coop_erpserv: numOrNull(valCoopErp),
      valor_coop_bizify: numOrNull(valCoopBiz),
      taxa_coop_erpserv: numOrNull(taxCoopErp),
      taxa_coop_bizify: numOrNull(taxCoopBiz),
      adiantamento_coop: adtoCoop,
      lancamentos: lancs.map(l => ({ descricao: l.descricao.trim() || null, valor: numOrNull(l.valor), coop: l.coop })),
    }
    api.post<{ html: string }>(`/fechamento-diretoria/${userId}/${yearMonth}/report-html`, body)
      .then(r => setReportPreview(r.html)).catch(() => setReportPreview(null))
  }, [userId, yearMonth, cooperativa, taxaInss, valCoopErp, valCoopBiz, taxCoopErp, taxCoopBiz, adtoCoop, lancs])
  useEffect(() => {
    const t = setTimeout(loadReportPreview, 350) // debounce nas edições
    return () => clearTimeout(t)
  }, [loadReportPreview])

  useEffect(() => {
    if (userId && !cooperativa && diretorNome) setCooperativa(diretorNome)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, diretorNome])

  const setLanc = (i: number, patch: Partial<Lanc>) => setLancs(prev => prev.map((l, j) => j === i ? { ...l, ...patch } : l))
  const addLanc = () => setLancs(prev => [...prev, emptyLanc()])
  const removeLanc = (i: number) => setLancs(prev => prev.filter((_, j) => j !== i))

  const importarMesAnterior = async () => {
    if (!userId) return
    try {
      const p = await api.get<{ cooperativa: string | null; taxa_inss: number | null; lancamentos: ApiLanc[] }>(`/fechamento-diretoria/${userId}/${prevYM}`)
      const pls = mapLancs(p.lancamentos ?? [])
      if (!pls.length && p.taxa_inss == null) { toast.error('Mês anterior sem lançamentos'); return }
      setLancs(pls.length ? pls : [emptyLanc()])
      if (p.cooperativa) setCooperativa(p.cooperativa)
      setTaxaInss(p.taxa_inss != null ? String(p.taxa_inss) : '')
      toast.success('Importado do mês anterior')
    } catch { toast.error('Erro ao importar') }
  }

  const payload = () => ({
    cooperativa: cooperativa.trim() || null,
    taxa_inss: numOrNull(taxaInss),
    valor_coop_erpserv: numOrNull(valCoopErp),
    valor_coop_bizify: numOrNull(valCoopBiz),
    taxa_coop_erpserv: numOrNull(taxCoopErp),
    taxa_coop_bizify: numOrNull(taxCoopBiz),
    adiantamento_coop: adtoCoop,
    lancamentos: lancs.map(l => ({ descricao: l.descricao.trim() || null, valor: numOrNull(l.valor), coop: l.coop })),
  })

  const salvar = async () => {
    if (!userId) return
    setSaving(true)
    try {
      const r = await api.post<{ status: Status }>(`/fechamento-diretoria/${userId}/${yearMonth}`, payload())
      setStatus(r.status ?? 'aberto'); toast.success('Fechamento salvo'); loadDiretores(); loadReportPreview()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  const finalizar = async () => {
    if (!userId) return
    setSaving(true)
    try {
      await api.post(`/fechamento-diretoria/${userId}/${yearMonth}`, payload())
      const r = await api.post<{ status: Status }>(`/fechamento-diretoria/${userId}/${yearMonth}/finalizar`, {})
      setStatus(r.status ?? 'finalizado'); toast.success(`Fechamento de ${diretorNome} finalizado`); loadDiretores(); loadReportPreview()
    } catch { toast.error('Erro ao finalizar') } finally { setSaving(false) }
  }
  const reabrir = async () => {
    if (!userId) return
    try {
      const r = await api.post<{ status: Status }>(`/fechamento-diretoria/${userId}/${yearMonth}/reabrir`, {})
      setStatus(r.status ?? 'aberto'); toast.success('Reaberto'); loadDiretores()
    } catch { toast.error('Erro ao reabrir') }
  }
  const openEmail = async () => {
    if (!userId) return
    // Salva (silencioso) antes de abrir — o corpo e o PDF anexo são montados do banco.
    if (!ro) { try { await api.post(`/fechamento-diretoria/${userId}/${yearMonth}`, payload()) } catch {} }
    setEmailTo(diretorEmail || '')
    setEmailMsg('')
    setEmailPreviewHtml(null)
    setEmailOpen(true)
  }
  // Prévia do CORPO do e-mail (atualiza com a mensagem). O relatório vai em PDF anexo.
  useEffect(() => {
    if (!emailOpen || !userId) return
    const t = setTimeout(() => {
      api.post<{ html: string }>(`/fechamento-diretoria/${userId}/${yearMonth}/email-preview`, { mensagem: emailMsg.trim() || null })
        .then(r => setEmailPreviewHtml(r.html)).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [emailOpen, emailMsg, userId, yearMonth])
  const enviarEmail = async () => {
    if (!userId) return
    const emails = emailTo.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (!emails.length) { toast.error('Informe ao menos um e-mail'); return }
    setSendingEmail(true)
    try {
      const r = await api.post<{ envio_em: string | null; envio_por: string | null }>(`/fechamento-diretoria/${userId}/${yearMonth}/enviar-email`, { emails, mensagem: emailMsg.trim() || null })
      setEnvioEm(r.envio_em ?? null); setEnvioPor(r.envio_por ?? null)
      toast.success('Fechamento enviado por e-mail'); setEmailOpen(false)
    } catch { toast.error('Erro ao enviar e-mail') } finally { setSendingEmail(false) }
  }

  const lancarFolha = () => {
    if (!folha?.liquido) return
    setLancs(prev => {
      const base = prev.filter(l => l.descricao.trim() || l.valor.trim())
      return [...base, { descricao: 'Folha (líquido)', valor: String(folha.liquido), coop: 'erpserv' as Coop }]
    })
  }

  const openGerir = () => {
    setBuscaUser('')
    api.get<{ data: { id: number; nome: string; is_diretor: boolean }[] }>('/fechamento-diretoria/usuarios')
      .then(r => setUsuarios(r.data ?? [])).catch(() => toast.error('Erro ao carregar usuários'))
    setGerirOpen(true)
  }
  const toggleUser = (id: number) => setUsuarios(prev => prev.map(u => u.id === id ? { ...u, is_diretor: !u.is_diretor } : u))
  const salvarDiretores = async () => {
    setSavingDir(true)
    try {
      await api.post('/fechamento-diretoria/diretores', { user_ids: usuarios.filter(u => u.is_diretor).map(u => u.id) })
      toast.success('Diretores atualizados'); setGerirOpen(false); loadDiretores()
    } catch { toast.error('Erro ao salvar diretores') } finally { setSavingDir(false) }
  }

  const lancados = diretores.filter(d => d.status !== 'sem_registro')
  const inputStyle = 'ds-input w-full text-sm'
  const temTaxa = numOrNull(taxaInss) !== null

  return (
    <AppLayout title="Fechamento Diretoria">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Header */}
        <div className="px-4 md:px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Users size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>Fechamento Diretoria</h1>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Competência</div>
              <MonthYearPicker month={month} year={year} onChange={(m, y) => { if (m && y) { setMonth(m); setYear(y) } }} />
            </div>
            <div className="min-w-[260px]">
              <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Diretor</div>
              <SearchSelect value={userId} onChange={setUserId} options={diretores.map(d => ({ id: d.id, name: d.nome }))} placeholder="Abrir fechamento de um diretor…" fullWidth />
            </div>
            {userId && (
              <Badge variant={finalizado ? 'success' : status === 'aberto' ? 'warning' : 'default'}>
                {finalizado ? <><Check size={11} className="mr-1" />Finalizado</> : status === 'aberto' ? 'Aberto' : 'Novo'}
              </Badge>
            )}
            <div className="flex-1" />
            <Button variant="secondary" size="sm" icon={Settings} onClick={openGerir}>Gerenciar diretores</Button>
          </div>
          {lancados.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {lancados.map(d => (
                <button key={d.id} onClick={() => setUserId(String(d.id))} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
                  style={{ background: String(d.id) === userId ? 'var(--primary-soft)' : 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {d.status === 'finalizado' ? <Check size={11} style={{ color: 'var(--success)' }} /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warning)' }} />}
                  {d.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6 flex flex-col gap-6">
          {!userId ? (
            <EmptyState icon={Users} title="Selecione um diretor" description="Escolha um diretor para abrir o fechamento. Finalize e abra o do próximo." />
          ) : loading ? <SkeletonTable rows={4} cols={2} /> : (
            <>
              {/* Folha do diretor */}
              {folha && (
                <div className="rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>Folha de {folha.nome ?? diretorNome}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Produção {fmt(folha.producao)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Débitos {fmt(folha.total_debitos)}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Líquido {fmt(folha.liquido)}</span>
                  {!ro && folha.liquido > 0 && <Button size="sm" variant="secondary" onClick={lancarFolha}>Lançar líquido</Button>}
                </div>
              )}

              {/* Rótulo + Taxa (campo) + importar */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px] max-w-md">
                  <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Cooperativa (rótulo)</div>
                  <input disabled={ro} className={inputStyle} value={cooperativa} onChange={e => setCooperativa(e.target.value)} placeholder={`Ex.: ${diretorNome || 'Nome'} - REPASSE NOVA COOP`} />
                </div>
                <div className="w-44">
                  <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Taxa + INSS (campo)</div>
                  <input disabled={ro} className={`${inputStyle} text-right tabular-nums`} inputMode="decimal" value={taxaInss} onChange={e => setTaxaInss(e.target.value)} placeholder="0,00" />
                </div>
                {!ro && <Button variant="secondary" size="sm" icon={Calculator} onClick={() => setTaxaInss(String(taxaInssCalc))} title="Calcula a Taxa + INSS pelo gross-up: acha o repasse cujo líquido = soma dos lançamentos (INSS 20% da produção + Taxa Adm 1% sobre o repasse)">Calcular Taxa + INSS</Button>}
                {!ro && <Button variant="secondary" size="sm" icon={Download} onClick={importarMesAnterior}>Importar do mês anterior</Button>}
              </div>
              {/* Memória de cálculo (base = soma dos lançamentos) */}
              <div className="rounded-lg px-3 py-2 text-[11px] flex flex-wrap items-center gap-x-4 gap-y-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <span>Valor a Receber (líquido): <strong style={{ color: 'var(--text)' }}>{fmt(somaLanc)}</strong></span>
                <span>Repasse (gross-up): <strong style={{ color: 'var(--text)' }}>{fmt(repasseCalc)}</strong></span>
                <span>Produção: {fmt(producao)}</span>
                <span>INSS (20%): {fmt(inssCalc)}</span>
                <span>Taxa Adm. (1%): {fmt(taxaAdmCalc)}</span>
                <span>= Taxa + INSS: <strong style={{ color: 'var(--text)' }}>{fmt(taxaInssCalc)}</strong></span>
              </div>

              {/* Tabela: Descrição | Valor (a Taxa entra como linha vinda do campo) */}
              <div>
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr style={{ background: 'var(--surface)' }}>
                        <th className="text-left px-2 py-2 text-xs uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Descrição</th>
                        <th className="text-right px-2 py-2 text-xs uppercase tracking-wide w-48" style={{ color: 'var(--text-light)' }}>Valor</th>
                        {!ro && <th className="w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lancs.map((l, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <input disabled={ro} className={`${inputStyle} flex-1`} value={l.descricao} onChange={e => setLanc(i, { descricao: e.target.value })} placeholder="Ex.: Pagamento, Convênio, Valor Elinton" />
                              <CoopPills value={l.coop} onChange={c => setLanc(i, { coop: c })} disabled={ro} />
                            </div>
                          </td>
                          <td className="px-2 py-1.5"><input disabled={ro} className={`${inputStyle} text-right tabular-nums`} inputMode="decimal" value={l.valor} onChange={e => setLanc(i, { valor: e.target.value })} placeholder="0,00 (negativo = desconto)" style={num(l.valor) < 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined} /></td>
                          {!ro && <td className="text-center px-2 py-1.5"><button onClick={() => removeLanc(i)} title="Remover" style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button></td>}
                        </tr>
                      ))}
                      {/* Adiantamento (parcelas da rotina) — desconto automático, não editável; coop selecionável */}
                      {adiantamento > 0 && (
                        <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                          <td className="px-2 py-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>Adiantamento{adiantamentoDesc ? ` (${adiantamentoDesc})` : ''} <span className="text-[10px]">— rotina de adiantamento</span></span>
                              <CoopPills value={adtoCoop} onChange={setAdtoCoop} disabled={ro} />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--danger)', fontWeight: 600 }}>− {fmt(adiantamento)}</td>
                          {!ro && <td />}
                        </tr>
                      )}
                      {/* REPASSE à cooperativa (gross-up) = Valor a Receber + Taxa + INSS */}
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface)' }}>
                        <td className="px-2 py-2 text-right text-xs font-bold uppercase" style={{ color: 'var(--text)' }}>Repasse à cooperativa</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: total < 0 ? 'var(--danger)' : 'var(--text)' }}>{fmt(total)}</td>
                        {!ro && <td />}
                      </tr>
                      {/* (−) Taxa + INSS (incide sobre o repasse) */}
                      {temTaxa && (
                        <tr style={{ background: 'var(--bg)' }}>
                          <td className="px-2 py-2 text-sm text-right" style={{ color: 'var(--text-muted)' }}>(−) Taxa + INSS <span className="text-[10px]">(desconto)</span></td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--danger)' }}>− {fmt(taxa)}</td>
                          {!ro && <td />}
                        </tr>
                      )}
                      {/* VALOR A RECEBER (líquido do diretor) = soma dos lançamentos */}
                      <tr style={{ background: 'var(--success-bg)' }}>
                        <td className="px-2 py-2 text-right text-xs font-bold uppercase" style={{ color: 'var(--text)' }}>Valor a Receber (líquido)</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: liquido < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(liquido)}</td>
                        {!ro && <td />}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!ro && <Button variant="secondary" size="sm" icon={Plus} onClick={addLanc}>Adicionar lançamento</Button>}
                  {envioEm
                    ? <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--success)' }}><Check size={12} />Enviado em {new Date(envioEm).toLocaleString('pt-BR')}{envioPor ? ` por ${envioPor}` : ''}</span>
                    : <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Valor negativo = desconto.</span>}
                  <div className="flex-1" />
                  <Button variant="secondary" size="sm" icon={Mail} onClick={openEmail}>Enviar e-mail</Button>
                  {finalizado ? (
                    <Button variant="secondary" size="sm" icon={RotateCcw} onClick={reabrir}>Reabrir</Button>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" icon={Save} loading={saving} onClick={salvar}>Salvar</Button>
                      <Button variant="primary" size="sm" icon={Lock} loading={saving} onClick={finalizar}>Finalizar diretor</Button>
                    </>
                  )}
                </div>
              </div>

              {/* Divisão por cooperativa */}
              <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[11px] uppercase tracking-wide font-semibold mb-3" style={{ color: 'var(--text-light)' }}>Divisão por cooperativa</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
                  {/* Valor líquido */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Valor líquido a receber <span className="text-[10px] font-normal" style={{ color: 'var(--text-light)' }}>(automático)</span></span>
                      <span className="text-[11px] tabular-nums" style={{ color: valBate ? 'var(--success)' : 'var(--danger)' }}>
                        {valBate ? '✓ ' : '✗ '}{fmt(valSum)} / {fmt(liquido)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] mb-1" style={{ color: 'var(--text-light)' }}>Coop ERPSERV</div>
                        <input disabled readOnly className={`${inputStyle} text-right tabular-nums opacity-90`} value={fmt(num(valCoopErp))} tabIndex={-1} />
                      </div>
                      <div>
                        <div className="text-[10px] mb-1" style={{ color: 'var(--text-light)' }}>Coop BIZIFY</div>
                        <input disabled readOnly className={`${inputStyle} text-right tabular-nums opacity-90`} value={fmt(num(valCoopBiz))} tabIndex={-1} />
                      </div>
                    </div>
                  </div>
                  {/* Taxa — preenchida automaticamente */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Taxa + INSS <span className="text-[10px] font-normal" style={{ color: 'var(--text-light)' }}>(automático)</span></span>
                      <span className="text-[11px] tabular-nums" style={{ color: taxBate ? 'var(--success)' : 'var(--danger)' }}>
                        {taxBate ? '✓ ' : '✗ '}{fmt(taxSum)} / {fmt(taxa)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] mb-1" style={{ color: 'var(--text-light)' }}>Taxa Coop ERPSERV</div>
                        <input disabled readOnly className={`${inputStyle} text-right tabular-nums opacity-90`} value={fmt(num(taxCoopErp))} tabIndex={-1} />
                      </div>
                      <div>
                        <div className="text-[10px] mb-1" style={{ color: 'var(--text-light)' }}>Taxa Coop BIZIFY</div>
                        <input disabled readOnly className={`${inputStyle} text-right tabular-nums opacity-90`} value={fmt(num(taxCoopBiz))} tabIndex={-1} />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-light)' }}>Valores somados automaticamente pela coop marcada em cada lançamento (ERP/BIZ), incluindo o adiantamento.</p>

                {/* INSS pago por UMA coop — a taxa de cada coop é recalculada automaticamente */}
                {!ro && (
                  <div className="mt-3 rounded-lg px-3 py-3 flex flex-wrap items-center gap-3" style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid var(--brand-primary)' }}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>INSS pago por:</span>
                    <div className="flex gap-1">
                      {(['erpserv', 'bizify'] as const).map(c => (
                        <button key={c} onClick={() => setInssCoop(c)}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                          style={inssCoop === c
                            ? { background: 'var(--brand-primary)', color: '#000' }
                            : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {c === 'erpserv' ? 'ERPSERV' : 'BIZIFY'}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px]" style={{ color: 'var(--brand-muted)' }}>Taxa adm rateada por coop + INSS inteiro na escolhida — fecha com a Taxa + INSS do cabeçalho.</span>
                  </div>
                )}
                <div className="mt-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Produção → Folha ERPSERV</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>{fmt(prodErp)}</span>
                  </div>
                  <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Produção → Folha BIZIFY</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>{fmt(prodBiz)}</span>
                  </div>
                </div>
              </div>

              {/* Pré-visualização = relatório que vai em PDF anexo (reflete o que está salvo) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-light)' }}>Pré-visualização do relatório (PDF anexo)</p>
                  <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Salve para atualizar.</span>
                </div>
                {reportPreview === null
                  ? <div className="text-xs italic p-4" style={{ color: 'var(--text-light)' }}>Carregando relatório…</div>
                  : <iframe srcDoc={reportPreview} title="Relatório" className="w-full" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, minHeight: 560 }} />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: enviar por e-mail (com prévia do relatório) */}
      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title="Enviar fechamento por e-mail" width="max-w-3xl">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Destinatários</label>
            <textarea className="ds-input w-full mt-1 text-sm" rows={2} value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="email@exemplo.com (separe vários por vírgula)" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Mensagem (opcional)</label>
            <textarea className="ds-input w-full mt-1 text-sm resize-none" rows={2} value={emailMsg} onChange={e => setEmailMsg(e.target.value)} placeholder="Texto adicional antes do relatório" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Prévia do e-mail</label>
            <p className="text-[11px] mb-1" style={{ color: 'var(--text-light)' }}>Corpo do e-mail abaixo; o relatório completo vai em <strong>PDF anexo</strong>. (Reflete o que está salvo.)</p>
            {emailPreviewHtml === null
              ? <div className="text-xs italic p-4" style={{ color: 'var(--text-light)' }}>Carregando prévia…</div>
              : <iframe srcDoc={emailPreviewHtml} title="Prévia do e-mail" className="w-full" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, height: 360 }} />}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" icon={X} onClick={() => setEmailOpen(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" icon={Send} loading={sendingEmail} onClick={enviarEmail}>Enviar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: gerenciar diretores */}
      <Modal open={gerirOpen} onClose={() => setGerirOpen(false)} title="Gerenciar diretores" width="max-w-lg">
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Marque os usuários que são diretores. Só eles aparecem no seletor.</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input className="ds-input w-full pl-9 text-sm" placeholder="Buscar usuário…" value={buscaUser} onChange={e => setBuscaUser(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
            {usuarios.filter(u => u.nome.toLowerCase().includes(buscaUser.toLowerCase())).map(u => (
              <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer" style={{ background: u.is_diretor ? 'var(--primary-soft)' : 'transparent' }}>
                <input type="checkbox" checked={u.is_diretor} onChange={() => toggleUser(u.id)} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>{u.nome}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{usuarios.filter(u => u.is_diretor).length} diretor(es)</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" icon={X} onClick={() => setGerirOpen(false)}>Cancelar</Button>
              <Button variant="primary" size="sm" icon={Save} loading={savingDir} onClick={salvarDiretores}>Salvar</Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
