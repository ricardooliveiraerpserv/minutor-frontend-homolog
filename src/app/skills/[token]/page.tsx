'use client'

import { SkillMatrixWizard, type WizardData, type AutosavePayload, type CadastralField } from '@/components/competencias/matrix-wizard'
import { useParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { AlertTriangle, ClipboardList, Loader2, Paperclip, Check, X } from 'lucide-react'

interface ShowPayload {
  survey: { id: number; type: string; title: string; description: string | null; deadline: string | null }
  cadastral_schema: CadastralField[]
  matrix: WizardData['matrix']
}
interface ResumePayload extends ShowPayload {
  cadastral: Record<string, unknown>
  submission: { id: number; status: string; progress: { current_step?: number } | null; answers: { item_id: number; level_id: number | null }[] }
}
interface StartPayload {
  continue_token: string
  submission: { id: number; status: string; progress: { current_step?: number } | null; answers: { item_id: number; level_id: number | null }[] }
}
interface FileRef { name: string; path: string; size: number }

type Phase = 'loading' | 'error' | 'intro' | 'wizard' | 'done'
const ctKey = (token: string) => `skills_ct_${token}`

// ── Helpers de formato ───────────────────────────────────────────────────────
const onlyDigits = (s: string) => (s || '').replace(/\D/g, '')
function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}
const isMobile = (v: string) => { const d = onlyDigits(v); return d.length === 11 && d[2] === '9' }
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
function isValidCpf(v: string) {
  const c = onlyDigits(v)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  for (let t = 9; t < 11; t++) {
    let sum = 0
    for (let i = 0; i < t; i++) sum += parseInt(c[i], 10) * (t + 1 - i)
    const d = ((10 * sum) % 11) % 10
    if (parseInt(c[t], 10) !== d) return false
  }
  return true
}
const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'
function maskMoney(v: string) {
  const d = onlyDigits(v)
  if (!d) return ''
  const n = (parseInt(d, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `R$ ${n}`
}

export default function PublicSkillsFormPage() {
  const params = useParams()
  const token = String(params?.token ?? '')

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<ShowPayload | null>(null)
  const [cadastral, setCadastral] = useState<Record<string, unknown>>({})
  const [continueToken, setContinueToken] = useState<string | null>(null)
  const [wizardData, setWizardData] = useState<WizardData | null>(null)
  const [starting, setStarting] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const set = (k: string, v: unknown) => setCadastral(p => ({ ...p, [k]: v }))

  const buildWizardData = useCallback((p: ShowPayload, cad: Record<string, unknown>, answersArr: { item_id: number; level_id: number | null }[], step: number): WizardData => {
    const answers: Record<number, number> = {}
    answersArr.forEach(a => { if (a.level_id) answers[a.item_id] = a.level_id })
    return { title: p.survey.title, description: p.survey.description, cadastralSchema: p.cadastral_schema, cadastral: cad, matrix: p.matrix, answers, initialStep: step }
  }, [])

  useEffect(() => {
    if (!token) return
    ;(async () => {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(ctKey(token)) : null
      if (saved) {
        try {
          const r = await api.get<ResumePayload>(`/skills-form/continue/${saved}`)
          if (r.submission.status === 'submitted') { setPhase('done'); return }
          setShow({ survey: r.survey, cadastral_schema: r.cadastral_schema, matrix: r.matrix })
          setContinueToken(saved)
          setWizardData(buildWizardData(r, r.cadastral ?? {}, r.submission.answers, r.submission.progress?.current_step ?? 0))
          setPhase('wizard')
          return
        } catch { localStorage.removeItem(ctKey(token)) }
      }
      try {
        const s = await api.get<ShowPayload>(`/skills-form/${token}`)
        setShow(s); setPhase('intro')
      } catch (e: unknown) { setError(apiMessage(e, 'Pesquisa indisponível.')); setPhase('error') }
    })()
  }, [token, buildWizardData])

  // Busca automática de endereço (ViaCEP).
  async function lookupCep(cepMasked: string) {
    const d = onlyDigits(cepMasked)
    if (d.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const data = await res.json()
      if (data.erro) { toast.error('CEP não encontrado'); return }
      setCadastral(p => ({
        ...p,
        logradouro: data.logradouro || p.logradouro || '',
        bairro: data.bairro || p.bairro || '',
        cidade: data.localidade || '',
        estado: data.uf || '',
      }))
    } catch { toast.error('Não foi possível buscar o CEP') } finally { setCepLoading(false) }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const ref = await api.post<FileRef>(`/skills-form/${token}/upload`, fd)
      set('curriculo', ref)
      toast.success('Currículo anexado')
    } catch (e: unknown) { toast.error(apiMessage(e, 'Falha no upload')) } finally { setUploading(false) }
  }

  function validate(schema: CadastralField[]): string | null {
    for (const f of schema) {
      const v = cadastral[f.key]
      // Campo isento quando o "gatilho" de dispensa está marcado (ex.: "Sem complemento").
      const exemptByUnless = !!f.require_unless && truthy(cadastral[f.require_unless])
      // Booleano (checkbox) nunca é "obrigatório" no sentido de precisar estar preenchido.
      if (f.required && !exemptByUnless && f.type !== 'boolean') {
        if (f.type === 'file') { if (!(v && (v as FileRef).path)) return `Anexe: ${f.label}` }
        else if (!String(v ?? '').trim()) return `Preencha: ${f.label}`
      }
      if (f.require_unless && !truthy(cadastral[f.require_unless]) && !String(v ?? '').trim()) return `Informe: ${f.label} (ou marque "Sem complemento")`
      if (v && f.type === 'phone' && !isMobile(String(v))) return 'Informe um celular válido com DDD.'
      if (v && f.type === 'email' && !isEmail(String(v))) return 'E-mail inválido.'
      if (v && f.type === 'cpf' && !isValidCpf(String(v))) return 'CPF inválido.'
      if (v && f.type === 'cep' && onlyDigits(String(v)).length !== 8) return 'CEP inválido.'
    }
    return null
  }

  async function start() {
    if (!show) return
    const err = validate(show.cadastral_schema)
    if (err) { toast.error(err); return }
    setStarting(true)
    try {
      const r = await api.post<StartPayload>(`/skills-form/${token}/start`, { cadastral })
      localStorage.setItem(ctKey(token), r.continue_token)
      setContinueToken(r.continue_token)
      setWizardData(buildWizardData(show, cadastral, r.submission.answers, r.submission.progress?.current_step ?? 0))
      setPhase('wizard')
    } catch (e: unknown) { toast.error(apiMessage(e, 'Não foi possível iniciar.')) } finally { setStarting(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 20px' }} className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><ClipboardList size={16} /></span>
          <div>
            <div className="text-sm" style={{ fontWeight: 700, color: 'var(--text)' }}>{show?.survey.title ?? 'Banco de Competências'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ERPSERV · Matriz de Conhecimento</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 60px' }}>
        {phase === 'loading' && <div className="flex items-center gap-2 justify-center" style={{ padding: 60, color: 'var(--text-muted)' }}><Loader2 size={18} className="animate-spin" /> Carregando…</div>}

        {phase === 'error' && (
          <div className="ds-card ds-card-pad ds-card-highlight-danger flex items-center gap-2" style={{ maxWidth: 560, margin: '40px auto' }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} /><p className="text-sm" style={{ color: 'var(--text)' }}>{error}</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="ds-card ds-card-pad ds-card-highlight-success text-center" style={{ maxWidth: 560, margin: '40px auto', padding: 40 }}>
            <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--text)' }}>✓ Avaliação enviada!</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Obrigado por responder. Suas respostas foram registradas.</p>
          </div>
        )}

        {phase === 'intro' && show && (
          <div className="space-y-4" style={{ maxWidth: 620, margin: '0 auto' }}>
            {show.survey.description && <div className="ds-card ds-card-pad"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{show.survey.description}</p></div>}
            <div className="ds-card ds-card-pad space-y-3">
              <h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Seus dados</h3>
              {show.cadastral_schema.map(f => (
                <Field key={f.key} field={f} value={cadastral[f.key]}
                  disabled={f.key === 'complemento' && truthy(cadastral['sem_complemento'])}
                  cepLoading={cepLoading && f.type === 'cep'} uploading={uploading && f.type === 'file'}
                  onChange={v => { set(f.key, v); if (f.key === 'sem_complemento' && truthy(v)) set('complemento', '') }}
                  onCepBlur={f.type === 'cep' ? () => lookupCep(String(cadastral[f.key] ?? '')) : undefined}
                  onFile={f.type === 'file' ? uploadFile : undefined}
                  onClearFile={f.type === 'file' ? () => set(f.key, null) : undefined} />
              ))}
            </div>
            <button className="ds-btn-primary w-full flex items-center justify-center gap-2" disabled={starting || uploading} onClick={start}>
              {starting && <Loader2 size={15} className="animate-spin" />} Iniciar avaliação
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>Suas respostas são salvas automaticamente — você pode fechar e continuar depois neste mesmo link.</p>
          </div>
        )}

        {phase === 'wizard' && wizardData && continueToken && (
          <SkillMatrixWizard data={wizardData} hideCadastralStep
            onAutosave={(payload: AutosavePayload) => api.patch(`/skills-form/continue/${continueToken}`, payload).then(() => undefined)}
            onSubmit={() => api.post(`/skills-form/continue/${continueToken}/submit`, {}).then(() => undefined)}
            onDone={() => { localStorage.removeItem(ctKey(token)); setPhase('done') }} />
        )}
      </main>
    </div>
  )
}

function Field({ field: f, value, onChange, onCepBlur, onFile, onClearFile, cepLoading, uploading, disabled }: {
  field: CadastralField; value: unknown; onChange: (v: unknown) => void
  onCepBlur?: () => void; onFile?: (file: File) => void; onClearFile?: () => void
  cepLoading?: boolean; uploading?: boolean; disabled?: boolean
}) {
  const req = f.required || !!f.require_unless
  const label = <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}{req ? ' *' : ''}</div>
  const v = String(value ?? '')

  if (f.type === 'boolean') return (
    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer' }}>
      <input type="checkbox" checked={value === true || value === 'true'} onChange={e => onChange(e.target.checked)} /> {f.label}
    </label>
  )

  if (f.type === 'cpf') {
    const digits = onlyDigits(v)
    const status = digits.length < 11 ? 'incomplete' : (isValidCpf(v) ? 'valid' : 'invalid')
    return (
      <div>{label}
        <div className="flex items-center gap-2">
          <input className="ds-input" inputMode="numeric" placeholder="000.000.000-00" value={maskCpf(v)}
            onChange={e => onChange(maskCpf(e.target.value))} style={{
              flex: 1,
              borderColor: status === 'invalid' ? 'var(--danger)' : status === 'valid' ? 'var(--success)' : undefined,
            }} />
          {status === 'valid' && <Check size={16} style={{ color: 'var(--success)' }} />}
          {status === 'invalid' && <X size={16} style={{ color: 'var(--danger)' }} />}
        </div>
        {status === 'valid' && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>CPF válido</div>}
        {status === 'invalid' && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>CPF inválido — verifique os números</div>}
      </div>
    )
  }

  if (f.type === 'select') return (
    <div>{label}
      <select className="ds-input" value={v} onChange={e => onChange(e.target.value)}>
        <option value="">— selecione —</option>
        {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  if (f.type === 'file') {
    const ref = value as FileRef | null
    return (
      <div>{label}
        {ref?.path ? (
          <div className="flex items-center justify-between ds-input" style={{ display: 'flex' }}>
            <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}><Check size={14} style={{ color: 'var(--success)' }} /> {ref.name}</span>
            <button type="button" onClick={() => onClearFile?.()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={14} /></button>
          </div>
        ) : (
          <label className="ds-input flex items-center gap-2" style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {uploading ? 'Enviando…' : 'Anexar arquivo (PDF, DOC, DOCX)'}
            <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (file) onFile?.(file) }} />
          </label>
        )}
      </div>
    )
  }

  if (f.type === 'cep') return (
    <div>{label}
      <div className="flex items-center gap-2">
        <input className="ds-input" style={{ flex: 1 }} inputMode="numeric" placeholder="00000-000"
          value={maskCep(v)} onChange={e => onChange(maskCep(e.target.value))} onBlur={onCepBlur} />
        {cepLoading && <Loader2 size={15} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>
    </div>
  )

  if (f.type === 'phone') return (
    <div>{label}<input className="ds-input" inputMode="tel" placeholder="(00) 00000-0000" value={maskPhone(v)} onChange={e => onChange(maskPhone(e.target.value))} /></div>
  )

  if (f.type === 'money') return (
    <div>{label}<input className="ds-input" inputMode="numeric" placeholder="R$ 0,00" value={maskMoney(v)} onChange={e => onChange(maskMoney(e.target.value))} /></div>
  )

  return (
    <div>{label}<input className="ds-input" type={f.type === 'email' ? 'email' : 'text'} value={v} disabled={disabled}
      placeholder={disabled ? 'Sem complemento' : undefined} onChange={e => onChange(e.target.value)} /></div>
  )
}
