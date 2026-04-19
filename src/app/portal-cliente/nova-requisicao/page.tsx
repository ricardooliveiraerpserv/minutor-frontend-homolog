'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { CheckCircle, ChevronLeft, AlertCircle, Send } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

const TIPOS = [
  { value: 'implantacao_modulo',        label: 'Implantação de Módulo' },
  { value: 'treinamento_erp',           label: 'Treinamento ERP' },
  { value: 'atualizacao_versao_erp',    label: 'Atualização de Versão do ERP' },
  { value: 'entrega_obrigacao',         label: 'Entrega de Obrigação' },
  { value: 'fluig',                     label: 'Fluig' },
  { value: 'desenvolvimento_web_app',   label: 'Desenvolvimento Web/App' },
  { value: 'customizacao_erp_protheus', label: 'Customização ERP Protheus' },
  { value: 'integracao_erp_protheus',   label: 'Integração com ERP Protheus' },
  { value: 'outro',                     label: 'Outro' },
]

const URGENCIAS = [
  { value: 'quando_possivel', label: 'Quando for possível', color: '#64748b' },
  { value: 'baixo',           label: 'Baixo',               color: '#22c55e' },
  { value: 'medio',           label: 'Médio',               color: '#eab308' },
  { value: 'alto',            label: 'Alto',                color: '#f97316' },
  { value: 'altissimo',       label: 'Altíssimo',           color: '#ef4444' },
]

// ─── Field Components ─────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>
      {children} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
  )
}

function Input({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-lg px-3 py-2.5 text-sm transition-all outline-none"
      style={{
        background: 'var(--brand-bg)',
        border: '1px solid var(--brand-border)',
        color: 'var(--brand-text)',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,245,255,0.08)' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--brand-border)'; e.currentTarget.style.boxShadow = 'none' }}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg px-3 py-2.5 text-sm transition-all outline-none resize-none"
      style={{
        background: 'var(--brand-bg)',
        border: '1px solid var(--brand-border)',
        color: 'var(--brand-text)',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,245,255,0.08)' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--brand-border)'; e.currentTarget.style.boxShadow = 'none' }}
    />
  )
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
        {number}
      </div>
      <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{title}</p>
    </div>
  )
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ onNew, onList }: { onNew: () => void; onList: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-20">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
        <CheckCircle size={32} style={{ color: '#22c55e' }} />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--brand-text)' }}>Requisição enviada!</h2>
        <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
          Sua necessidade foi registrada e será analisada pela nossa equipe. Você receberá um retorno em breve.
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={onNew} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
          Nova Requisição
        </button>
        <button onClick={onList} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
          Ver Minhas Requisições
        </button>
      </div>
    </div>
  )
}

// ─── Main Form ────────────────────────────────────────────────────────────────

function NovaRequisicaoContent() {
  const router = useRouter()
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving]       = useState(false)

  const [form, setForm] = useState({
    area_requisitante:  '',
    product_owner:      '',
    modulo_tecnologia:  '',
    tipo_necessidade:   '',
    tipo_necessidade_outro: '',
    nivel_urgencia:     '',
    descricao:          '',
    cenario_atual:      '',
    cenario_desejado:   '',
  })

  const set = (field: keyof typeof form) => (value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const isOutro = form.tipo_necessidade === 'outro'
  const isValid = form.area_requisitante.trim() && form.tipo_necessidade && form.nivel_urgencia &&
    (!isOutro || form.tipo_necessidade_outro.trim())

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error('Preencha os campos obrigatórios: área requisitante, tipo de necessidade e urgência.')
      return
    }
    setSaving(true)
    try {
      await api.post('/contract-requests', form)
      setSubmitted(true)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao enviar requisição')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setForm({ area_requisitante: '', product_owner: '', modulo_tecnologia: '', tipo_necessidade: '', tipo_necessidade_outro: '', nivel_urgencia: '', descricao: '', cenario_atual: '', cenario_desejado: '' })
    setSubmitted(false)
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: 'var(--brand-muted)' }}>
              <ChevronLeft size={16} />
            </button>
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Formulário de Requisição</h1>
              <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Descreva sua necessidade e nossa equipe entrará em contato</p>
            </div>
          </div>
        </div>

        {submitted ? (
          <SuccessScreen onNew={resetForm} onList={() => router.push('/portal-cliente/requisicoes')} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

              {/* Seção 1–3: Identificação */}
              <div className="rounded-2xl p-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <SectionTitle number="1" title="Identificação da Requisição" />
                <div className="space-y-4">
                  <div>
                    <Label required>Área Requisitante</Label>
                    <Input value={form.area_requisitante} onChange={set('area_requisitante')} placeholder="Ex: Financeiro, RH, TI..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Product Owner</Label>
                      <Input value={form.product_owner} onChange={set('product_owner')} placeholder="Nome do responsável" />
                    </div>
                    <div>
                      <Label>Módulo / Tecnologia</Label>
                      <Input value={form.modulo_tecnologia} onChange={set('modulo_tecnologia')} placeholder="Ex: SIGAFIN, Fluig..." />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 4: Tipo de Necessidade */}
              <div className="rounded-2xl p-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <SectionTitle number="4" title="Tipo de Necessidade" />
                <div className="grid grid-cols-2 gap-2.5">
                  {TIPOS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => set('tipo_necessidade')(t.value)}
                      className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-left transition-all"
                      style={{
                        background: form.tipo_necessidade === t.value ? 'rgba(0,245,255,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${form.tipo_necessidade === t.value ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
                        color: form.tipo_necessidade === t.value ? 'var(--brand-primary)' : 'var(--brand-muted)',
                      }}
                    >
                      <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                        style={{
                          border: `2px solid ${form.tipo_necessidade === t.value ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
                          background: form.tipo_necessidade === t.value ? 'var(--brand-primary)' : 'transparent',
                        }}>
                        {form.tipo_necessidade === t.value && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                      {t.label}
                    </button>
                  ))}
                </div>
                {isOutro && (
                  <div className="mt-3">
                    <Label required>Descreva o tipo de necessidade</Label>
                    <Input
                      value={form.tipo_necessidade_outro}
                      onChange={set('tipo_necessidade_outro')}
                      placeholder="Ex: Consultoria, Auditoria, Integração customizada..."
                    />
                  </div>
                )}
                {!form.tipo_necessidade && (
                  <p className="text-[11px] mt-3 flex items-center gap-1" style={{ color: '#ef4444' }}>
                    <AlertCircle size={11} /> Selecione o tipo de necessidade
                  </p>
                )}
              </div>

              {/* Seção 5: Urgência */}
              <div className="rounded-2xl p-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <SectionTitle number="5" title="Nível de Urgência" />
                <div className="flex flex-col gap-2">
                  {URGENCIAS.map(u => (
                    <button
                      key={u.value}
                      onClick={() => set('nivel_urgencia')(u.value)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all"
                      style={{
                        background: form.nivel_urgencia === u.value ? `${u.color}12` : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${form.nivel_urgencia === u.value ? u.color : 'var(--brand-border)'}`,
                        color: form.nivel_urgencia === u.value ? u.color : 'var(--brand-muted)',
                      }}
                    >
                      <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                        style={{
                          border: `2px solid ${form.nivel_urgencia === u.value ? u.color : 'var(--brand-border)'}`,
                          background: form.nivel_urgencia === u.value ? u.color : 'transparent',
                        }}>
                        {form.nivel_urgencia === u.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="font-medium">{u.label}</span>
                      {form.nivel_urgencia === u.value && (
                        <CheckCircle size={14} className="ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seção 6: Descrição */}
              <div className="rounded-2xl p-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <SectionTitle number="6" title="Descrição da Necessidade" />
                <div className="space-y-4">
                  <div>
                    <Label>Descrição Geral</Label>
                    <Textarea value={form.descricao} onChange={set('descricao')} placeholder="Descreva de forma geral o que você precisa..." rows={3} />
                  </div>
                  <div>
                    <Label>6.1 · Cenário Atual</Label>
                    <Textarea value={form.cenario_atual} onChange={set('cenario_atual')} placeholder="Como o processo funciona hoje? Quais são as dificuldades?" rows={4} />
                  </div>
                  <div>
                    <Label>6.2 · Cenário Desejado</Label>
                    <Textarea value={form.cenario_desejado} onChange={set('cenario_desejado')} placeholder="Como você gostaria que o processo funcionasse? Qual seria o resultado esperado?" rows={4} />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-between pb-8">
                <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                  <span style={{ color: '#ef4444' }}>*</span> Campos obrigatórios
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={!isValid || saving}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                  style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
                >
                  <Send size={15} />
                  {saving ? 'Enviando...' : 'Enviar Requisição'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default function NovaRequisicaoPage() {
  return <NovaRequisicaoContent />
}
