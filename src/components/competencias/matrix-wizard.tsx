'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Check, CheckCircle2, Cloud } from 'lucide-react'

// ── Tipos compartilhados (interno + público) ────────────────────────────────
export interface Level { id: number; name: string; weight: number }
export interface Item { id: number; skill_id: number | null; name: string; category: string; sort_order: number }
export interface Section { category: string; count: number; items: Item[] }
export interface CadastralField { key: string; label: string; type: string; readonly?: boolean; required?: boolean; options?: string[]; require_unless?: string }
export interface WizardMatrix { sections: Section[]; total_items: number; levels: Level[] }

export interface AutosavePayload {
  current_step?: number
  cadastral?: Record<string, unknown>
  answers: { item_id: number; skill_id: number | null; level_id: number }[]
}

export interface WizardData {
  title: string
  description: string | null
  cadastralSchema: CadastralField[]
  cadastral: Record<string, unknown>
  matrix: WizardMatrix
  answers: Record<number, number>
  initialStep: number
}

interface Props {
  data: WizardData
  onAutosave: (payload: AutosavePayload) => Promise<void>
  onSubmit: () => Promise<void>
  onDone: () => void
  /** true quando os campos cadastrais já foram coletados antes (portal público) —
   *  esconde a etapa de Dados Pessoais no wizard. */
  hideCadastralStep?: boolean
}

type Step =
  | { kind: 'cadastral'; title: string }
  | { kind: 'matrix'; title: string; category: string; items: Item[] }
  | { kind: 'extra'; title: string }
  | { kind: 'review'; title: string }

const CHUNK = 12

export function SkillMatrixWizard({ data, onAutosave, onSubmit, onDone, hideCadastralStep }: Props) {
  const [answers, setAnswers] = useState<Record<number, number>>(data.answers)
  const [cadastral, setCadastral] = useState<Record<string, unknown>>(data.cadastral)
  const [step, setStep] = useState(Math.max(0, data.initialStep))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const dirtyRef = useRef<Set<number>>(new Set())
  const cadastralDirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skillByItem = useRef<Record<number, number | null>>({})
  // Espelham o estado mais recente p/ o flush (debounced) não ler closure defasada
  // — senão a última resposta de cada rajada era enviada como level_id null.
  const answersRef = useRef(answers)
  const cadastralRef = useRef(cadastral)
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { cadastralRef.current = cadastral }, [cadastral])

  const steps: Step[] = useMemo(() => {
    const out: Step[] = []
    if (!hideCadastralStep) out.push({ kind: 'cadastral', title: 'Dados Pessoais' })
    for (const sec of data.matrix.sections) {
      sec.items.forEach(i => { skillByItem.current[i.id] = i.skill_id })
      if (sec.items.length <= CHUNK) {
        out.push({ kind: 'matrix', title: sec.category, category: sec.category, items: sec.items })
      } else {
        const pages = Math.ceil(sec.items.length / CHUNK)
        for (let p = 0; p < pages; p++) {
          out.push({
            kind: 'matrix', title: `${sec.category} (${p + 1}/${pages})`, category: sec.category,
            items: sec.items.slice(p * CHUNK, (p + 1) * CHUNK),
          })
        }
      }
    }
    out.push({ kind: 'extra', title: 'Conhecimento complementar' })
    out.push({ kind: 'review', title: 'Revisão' })
    return out
  }, [data.matrix, hideCadastralStep])

  const total = data.matrix.total_items
  const answeredCount = Object.values(answers).filter(v => v != null).length
  const pct = total > 0 ? Math.round(answeredCount / total * 100) : 0

  const flush = useCallback(async (extra?: { current_step?: number }) => {
    const ids = [...dirtyRef.current]
    const sendCadastral = cadastralDirtyRef.current
    if (ids.length === 0 && !sendCadastral && extra?.current_step === undefined) return
    dirtyRef.current.clear()
    cadastralDirtyRef.current = false
    setSaveState('saving')
    try {
      await onAutosave({
        current_step: extra?.current_step,
        cadastral: sendCadastral ? cadastralRef.current : undefined,
        // Lê SEMPRE do ref (valor atual), nunca de closure — e nunca envia nível vazio.
        answers: ids
          .map(itemId => ({ item_id: itemId, skill_id: skillByItem.current[itemId], level_id: answersRef.current[itemId] }))
          .filter(a => a.level_id != null),
      })
      setSaveState('saved')
    } catch {
      ids.forEach(i => dirtyRef.current.add(i))
      if (sendCadastral) cadastralDirtyRef.current = true
      setSaveState('idle')
    }
  }, [onAutosave])

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(), 700)
  }, [flush])

  function setAnswer(itemId: number, levelId: number) {
    setAnswers(prev => ({ ...prev, [itemId]: levelId }))
    dirtyRef.current.add(itemId)
    setSaveState('saving')
    schedule()
  }
  function setCadastralField(key: string, value: unknown) {
    setCadastral(prev => ({ ...prev, [key]: value }))
    cadastralDirtyRef.current = true
    schedule()
  }

  // CEP → preenche endereço automaticamente (ViaCEP). Só toca campos que existem no schema.
  async function lookupCep(cepDigits: string) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      if (!r.ok) return
      const d = await r.json()
      if (!d || d.erro) return
      const fill: Record<string, string> = {}
      if (d.logradouro) fill.logradouro = d.logradouro
      if (d.bairro) fill.bairro = d.bairro
      if (d.localidade) fill.cidade = d.localidade
      if (d.uf) fill.estado = d.uf
      const keys = new Set(data.cadastralSchema.map(f => f.key))
      setCadastral(prev => {
        const next = { ...prev }
        Object.entries(fill).forEach(([k, v]) => { if (keys.has(k)) next[k] = v })
        return next
      })
      cadastralDirtyRef.current = true
      schedule()
    } catch { /* CEP externo pode falhar — silencioso, campos ficam editáveis */ }
  }

  function handleCadastral(key: string, value: unknown) {
    setCadastralField(key, value)
    const f = data.cadastralSchema.find(x => x.key === key)
    if ((key === 'cep' || f?.type === 'cep') && typeof value === 'string') {
      const digits = value.replace(/\D/g, '')
      if (digits.length === 8) lookupCep(digits)
    }
  }

  async function goTo(next: number) {
    const clamped = Math.max(0, Math.min(next, steps.length - 1))
    await flush({ current_step: clamped })
    setStep(clamped)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    setSubmitting(true)
    try {
      await flush()
      await onSubmit()
      setDone(true)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Responda todas as competências antes de enviar.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <div className="ds-card ds-card-pad ds-card-highlight-success text-center" style={{ padding: 40 }}>
      <CheckCircle2 size={44} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
      <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--text)' }}>Avaliação enviada!</h2>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Obrigado. Suas respostas foram registradas.</p>
      <button className="ds-btn-primary mt-4" onClick={onDone}>Concluir</button>
    </div>
  )

  const current = steps[step]
  // Etapa da matriz só libera o "Próximo" quando TODAS as competências dela têm resposta.
  const stepPending = current.kind === 'matrix' ? current.items.filter(it => answers[it.id] == null).length : 0

  return (
    <div className="space-y-4" style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Progresso */}
      <div className="ds-card ds-card-pad">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{current.title}</span>
          <span className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {saveState === 'saving' && <><Cloud size={13} className="animate-pulse" /> Salvando…</>}
            {saveState === 'saved' && <><Check size={13} style={{ color: 'var(--success)' }} /> Salvo</>}
            <span>{answeredCount}/{total}</span>
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-hover)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', transition: 'width .3s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>Etapa {step + 1} de {steps.length}</div>
      </div>

      {current.kind === 'cadastral' && (
        <div className="ds-card ds-card-pad space-y-3">
          {data.description && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{data.description}</p>}
          {data.cadastralSchema.map(f => (
            <CadastralInput key={f.key} field={f} value={cadastral[f.key]} onChange={v => handleCadastral(f.key, v)} />
          ))}
        </div>
      )}

      {current.kind === 'matrix' && (
        <div className="ds-card ds-card-pad">
          <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
            Marque seu nível em cada competência. Se não conhece, marque <strong>Nenhum conhecimento</strong>.
          </p>
          <div className="space-y-4">
            {current.items.map(it => (
              <div key={it.id} style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div className="text-sm mb-2" style={{ color: 'var(--text)', fontWeight: 500 }}>{it.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.matrix.levels.map(lv => {
                    const active = answers[it.id] === lv.id
                    return (
                      <button key={lv.id} type="button" onClick={() => setAnswer(it.id, lv.id)}
                        style={{
                          fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                          background: active ? 'var(--primary-soft)' : 'transparent',
                          color: active ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: active ? 600 : 400,
                        }}>
                        {lv.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {current.kind === 'extra' && (
        <div className="ds-card ds-card-pad">
          <div className="text-sm mb-1" style={{ color: 'var(--text)', fontWeight: 600 }}>
            Existe algum conhecimento complementar que você julga relevante para a ERPSERV?
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10 }}>
            Opcional — cite ferramentas, certificações, experiências ou níveis que não estavam na lista.
          </p>
          <textarea className="ds-input" rows={5} placeholder="Escreva aqui (opcional)…"
            value={String(cadastral['conhecimento_complementar'] ?? '')}
            onChange={e => setCadastralField('conhecimento_complementar', e.target.value)} />
        </div>
      )}

      {current.kind === 'review' && (
        <ReviewStep sections={data.matrix.sections} answers={answers} total={total} answered={answeredCount}
          onJump={(cat) => { const idx = steps.findIndex(s => s.kind === 'matrix' && s.category === cat); if (idx >= 0) goTo(idx) }} />
      )}

      {stepPending > 0 && (
        <div className="ds-card ds-card-pad" style={{ borderColor: 'var(--warning-border)', background: 'var(--warning-bg)' }}>
          <p className="text-sm" style={{ color: 'var(--warning)', fontWeight: 500 }}>
            Responda todas as competências desta etapa para avançar — faltam {stepPending}.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button className="ds-btn-secondary flex items-center gap-1" disabled={step === 0} onClick={() => goTo(step - 1)}>
          <ChevronLeft size={16} /> Voltar
        </button>
        {current.kind === 'review'
          ? <button className="ds-btn-primary flex items-center gap-2" disabled={submitting || answeredCount < total} onClick={submit}>
              <Check size={16} /> Enviar avaliação
            </button>
          : <button className="ds-btn-primary flex items-center gap-1" disabled={stepPending > 0} onClick={() => goTo(step + 1)}>
              Próximo <ChevronRight size={16} />
            </button>}
      </div>
    </div>
  )
}

function CadastralInput({ field: f, value, onChange }: { field: CadastralField; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div>
      <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}{f.required ? ' *' : ''}</div>
      {f.type === 'select' ? (
        <select className="ds-input" disabled={f.readonly} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          <option value="">—</option>
          {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'boolean' ? (
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={!!value} disabled={f.readonly} onChange={e => onChange(e.target.checked)} /> Sim
        </label>
      ) : (
        <input className="ds-input" type={f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text'}
          disabled={f.readonly} inputMode={f.type === 'cep' ? 'numeric' : undefined}
          value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  )
}

function ReviewStep({ sections, answers, total, answered, onJump }: {
  sections: Section[]; answers: Record<number, number>; total: number; answered: number; onJump: (cat: string) => void
}) {
  const rows = sections.map(sec => ({ category: sec.category, total: sec.items.length, pending: sec.items.filter(i => !answers[i.id]).length }))
  const complete = answered >= total
  return (
    <div className="ds-card ds-card-pad">
      <h3 className="text-sm mb-3" style={{ fontWeight: 600, color: 'var(--text)' }}>Revisão final</h3>
      <div className="space-y-1.5">
        {rows.map(r => (
          <button key={r.category} type="button" onClick={() => r.pending > 0 && onJump(r.category)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg"
            style={{ border: '1px solid var(--border)', cursor: r.pending > 0 ? 'pointer' : 'default', background: 'transparent', textAlign: 'left' }}>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{r.category}</span>
            {r.pending === 0
              ? <span className="ds-status-success" style={{ fontSize: 11 }}><Check size={11} style={{ display: 'inline' }} /> Completo</span>
              : <span className="ds-status-warning" style={{ fontSize: 11 }}>{r.pending} pendente{r.pending > 1 ? 's' : ''}</span>}
          </button>
        ))}
      </div>
      <div className="mt-4 text-sm" style={{ color: complete ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
        {complete ? '✓ Tudo respondido — pronto para enviar.' : `Faltam ${total - answered} competência(s).`}
      </div>
    </div>
  )
}
