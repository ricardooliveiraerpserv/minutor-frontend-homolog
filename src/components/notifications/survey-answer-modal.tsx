'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { CheckCircle2, ClipboardList, X } from 'lucide-react'

// Pesquisa (survey): formulário com várias perguntas (texto/pessoa/escolha).
export interface SurveyQ { id: number; label: string; type: 'text' | 'person' | 'choice'; required: boolean; multiple: boolean; options: { id: number; label: string }[] }
export interface SurveyData { survey_id: number; anonymous: boolean; closed: boolean; has_responded: boolean; people?: { id: number; name: string }[]; questions: SurveyQ[] }
type SAns = { text?: string; user_id?: string; option_ids?: number[] }

/**
 * Modal de resposta da PESQUISA — reutilizado pelo pop-up global e pelo "Meu Dia"
 * (pendência até a data limite). onSubmitted dispara após enviar com sucesso.
 */
export function SurveyAnswerModal({ title, survey, onClose, onSubmitted }: { title: string; survey: SurveyData; onClose: () => void; onSubmitted: () => void }) {
  const [ans, setAns] = useState<Record<number, SAns>>({})
  const [busy, setBusy] = useState(false)

  const valid = () => (survey.questions ?? []).every(q => {
    if (!q.required) return true
    const a = ans[q.id] || {}
    if (q.type === 'text') return !!a.text?.trim()
    if (q.type === 'person') return !!a.user_id
    return (a.option_ids?.length ?? 0) > 0
  })

  const submit = async () => {
    if (!valid()) { toast.error('Responda as perguntas obrigatórias.'); return }
    setBusy(true)
    try {
      const answers = survey.questions.map(q => {
        const a = ans[q.id] || {}
        if (q.type === 'text') return { question_id: q.id, text: a.text ?? '' }
        if (q.type === 'person') return { question_id: q.id, user_id: a.user_id ?? '' }
        return { question_id: q.id, option_ids: a.option_ids ?? [] }
      })
      await api.post(`/surveys/${survey.survey_id}/respond`, { answers })
      toast.success('Pesquisa respondida ✓')
      onSubmitted()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao enviar') } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <ClipboardList size={16} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</span>
          <button onClick={onClose} className="ml-auto" style={{ color: 'var(--text-muted)' }} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {survey.anonymous ? 'Respostas anônimas — sua identidade não é registrada.' : 'Respondendo de forma identificada (seu nome fica registrado).'} Perguntas com <b>*</b> são obrigatórias.
          </p>
          {survey.questions.map((q, qi) => {
            const a = ans[q.id] || {}
            return (
              <div key={q.id} className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--text)' }}>{qi + 1}. {q.label} {q.required && <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>}</label>
                {q.type === 'text' && (
                  <input className="ds-input w-full text-sm" placeholder="Sua resposta" value={a.text ?? ''} onChange={e => setAns(s => ({ ...s, [q.id]: { ...s[q.id], text: e.target.value } }))} />
                )}
                {q.type === 'person' && (
                  <PersonSelect people={survey.people ?? []} value={a.user_id ?? ''} onChange={id => setAns(s => ({ ...s, [q.id]: { ...s[q.id], user_id: id } }))} />
                )}
                {q.type === 'choice' && (
                  <div className="space-y-1">
                    {q.options.map(o => {
                      const picked = (a.option_ids ?? []).includes(o.id)
                      const toggle = () => setAns(s => {
                        const cur = s[q.id]?.option_ids ?? []
                        const next = q.multiple ? (cur.includes(o.id) ? cur.filter(x => x !== o.id) : [...cur, o.id]) : [o.id]
                        return { ...s, [q.id]: { ...s[q.id], option_ids: next } }
                      })
                      return (
                        <button key={o.id} type="button" onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm"
                          style={{ border: `1px solid ${picked ? 'var(--primary)' : 'var(--border)'}`, background: picked ? 'var(--primary-soft)' : 'var(--surface)', color: 'var(--text)' }}>
                          <span className="inline-flex items-center justify-center shrink-0" style={{ width: 16, height: 16, borderRadius: q.multiple ? 4 : 999, border: `1.5px solid ${picked ? 'var(--primary)' : 'var(--border)'}`, background: picked ? 'var(--primary)' : 'transparent' }}>{picked && <CheckCircle2 size={11} style={{ color: 'var(--primary-fg)' }} />}</span>
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-3 flex items-center justify-end gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} disabled={busy} className="ds-btn-secondary text-sm px-4 py-2 rounded-lg">Cancelar</button>
          <button onClick={submit} disabled={busy} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg"><CheckCircle2 size={15} /> Enviar respostas</button>
        </div>
      </div>
    </div>
  )
}

/** Seletor de pessoa com busca por texto (combobox): filtra ao digitar e seleciona ao clicar. */
function PersonSelect({ people, value, onChange }: { people: { id: number; name: string }[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = people.find(p => String(p.id) === value)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  // Ao abrir, rola a lista à vista (o modal tem overflow — senão a lista fica escondida atrás do rodapé).
  useEffect(() => { if (open) listRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [open])
  const filtered = q.trim() ? people.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : people
  return (
    <div ref={ref}>
      <input
        className="ds-input w-full text-sm"
        placeholder="Buscar pessoa…"
        autoComplete="off"
        value={open ? q : (selected?.name ?? '')}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
      />
      {open && (
        // Inline (não-absoluto) p/ não ser cortado pelo overflow do modal; rola junto.
        <div ref={listRef} className="mt-1 max-h-48 overflow-auto rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>Ninguém encontrado.</div>}
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(String(p.id)); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm"
              style={{ color: 'var(--text)', background: String(p.id) === value ? 'var(--primary-soft)' : 'transparent' }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
