'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { api, ApiError } from '@/lib/api'

interface Project { id: number; name: string; customer_name?: string | null }
interface Category { id: number; name: string; parent_id?: number | null; parent_name?: string | null }

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência' },
]

const TOTAL_STEPS = 4

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 99,
          background: i <= step ? '#8B5CF6' : 'var(--brand-border)',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

function StepLabel({ step }: { step: number }) {
  const labels = ['Projeto', 'Valor', 'Categoria', 'Comprovante']
  return (
    <p style={{ fontSize: 11, color: 'var(--brand-subtle)', marginTop: 4, marginBottom: 0 }}>
      Etapa {step + 1} de {TOTAL_STEPS} — {labels[step]}
    </p>
  )
}

export default function MobileDespesa() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    project_id: '',
    project_name: '',
    amount: '',
    expense_category_id: '',
    category_name: '',
    expense_date: new Date().toISOString().split('T')[0],
    is_paid: false,
    payment_method: 'pix',
    expense_type: 'reimbursement',
    description: '',
  })

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    api.get<any>('/projects?pageSize=200&status=open')
      .then(r => setProjects(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {})
    api.get<any>('/expense-categories?pageSize=100')
      .then(r => setCategories(Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (step === 0) setTimeout(() => searchRef.current?.focus(), 100)
  }, [step])

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(catSearch.toLowerCase()) ||
    (c.parent_name ?? '').toLowerCase().includes(catSearch.toLowerCase())
  )

  const next = () => setStep(s => s + 1)
  const back = () => { if (step === 0) router.push('/mobile'); else setStep(s => s - 1) }

  const canAdvance = () => {
    if (step === 0) return !!form.project_id
    if (step === 1) return !!form.amount && Number(form.amount) > 0
    if (step === 2) return !!form.expense_category_id
    return true
  }

  const handleSave = async () => {
    if (!form.project_id) { toast.error('Selecione um projeto'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Informe o valor'); return }
    if (!form.expense_category_id) { toast.error('Selecione a categoria'); return }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('project_id', form.project_id)
      fd.append('expense_category_id', form.expense_category_id)
      fd.append('expense_date', form.expense_date)
      fd.append('description', form.description || form.category_name)
      fd.append('amount', form.amount)
      fd.append('expense_type', form.expense_type)
      fd.append('payment_method', form.payment_method)
      fd.append('charge_client', '0')
      if (receipt) fd.append('receipt', receipt)

      const token = typeof window !== 'undefined' ? localStorage.getItem('minutor_token') : null
      const res = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json' },
        body: fd,
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new ApiError(res.status, b.message ?? 'Erro ao salvar')
      }
      toast.success('Despesa registrada!')
      router.replace('/mobile')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) return null

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '48px 24px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={back} style={{ background: 'none', border: 'none', padding: '8px 8px 8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="var(--brand-muted)" />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-text)', margin: 0 }}>Nova Despesa</h1>
        </div>
        <ProgressBar step={step} />
        <StepLabel step={step} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '8px 24px 24px', overflowY: 'auto' }}>

        {/* Step 0: Projeto */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>Qual projeto?</h2>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-subtle)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar projeto ou cliente..."
                style={{
                  width: '100%', padding: '14px 14px 14px 38px', borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {filteredProjects.length === 0 && (
                <p style={{ color: 'var(--brand-subtle)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>
                  {projects.length === 0 ? 'Carregando projetos...' : 'Nenhum projeto encontrado'}
                </p>
              )}
              {filteredProjects.map(p => (
                <button key={p.id} onClick={() => { setForm(f => ({ ...f, project_id: String(p.id), project_name: p.name })); next() }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '14px 16px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', width: '100%',
                    background: form.project_id === String(p.id) ? 'rgba(139,92,246,0.08)' : 'var(--brand-surface)',
                    border: form.project_id === String(p.id) ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--brand-border)',
                  }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text)' }}>{p.name}</span>
                  {p.customer_name && <span style={{ fontSize: 12, color: 'var(--brand-subtle)' }}>{p.customer_name}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Valor + Data */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>Qual o valor?</h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>{form.project_name}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Valor (R$)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20, fontWeight: 700, color: 'var(--brand-muted)' }}>R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0,00"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  autoFocus
                  style={{
                    padding: '18px 16px 18px 56px', borderRadius: 12, fontSize: 32, fontWeight: 800, outline: 'none',
                    background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                    color: '#8B5CF6', width: '100%', boxSizing: 'border-box',
                    letterSpacing: 1,
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Data</label>
              <input
                type="date"
                value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                style={{
                  padding: '14px 16px', borderRadius: 12, fontSize: 15, outline: 'none',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                  color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Descrição (opcional)</label>
              <input
                type="text"
                placeholder="Ex: Almoço com cliente, passagem..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{
                  padding: '14px 16px', borderRadius: 12, fontSize: 15, outline: 'none',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                  color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {/* Step 2: Categoria */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>Categoria</h2>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-subtle)', pointerEvents: 'none' }} />
              <input
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
                placeholder="Buscar categoria..."
                autoFocus
                style={{
                  width: '100%', padding: '14px 14px 14px 38px', borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {filteredCategories.length === 0 && (
                <p style={{ color: 'var(--brand-subtle)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>
                  {categories.length === 0 ? 'Carregando categorias...' : 'Nenhuma categoria encontrada'}
                </p>
              )}
              {filteredCategories.map(c => (
                <button key={c.id} onClick={() => { setForm(f => ({ ...f, expense_category_id: String(c.id), category_name: c.name })); next() }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '14px 16px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', width: '100%',
                    background: form.expense_category_id === String(c.id) ? 'rgba(139,92,246,0.08)' : 'var(--brand-surface)',
                    border: form.expense_category_id === String(c.id) ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--brand-border)',
                  }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text)' }}>{c.name}</span>
                  {c.parent_name && <span style={{ fontSize: 12, color: 'var(--brand-subtle)' }}>{c.parent_name}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Comprovante */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>Comprovante</h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>Opcional — foto ou PDF</p>
            </div>

            <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
              onChange={e => setReceipt(e.target.files?.[0] ?? null)} />

            <button onClick={() => fileRef.current?.click()}
              style={{
                padding: '32px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'center',
                background: receipt ? 'rgba(139,92,246,0.08)' : 'var(--brand-surface)',
                border: receipt ? '2px dashed rgba(139,92,246,0.4)' : '2px dashed var(--brand-border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
              <Upload size={28} color={receipt ? '#8B5CF6' : 'var(--brand-subtle)'} />
              {receipt
                ? <p style={{ fontSize: 14, color: '#8B5CF6', fontWeight: 600, margin: 0 }}>{receipt.name}</p>
                : <>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', margin: 0 }}>Tirar foto ou escolher arquivo</p>
                    <p style={{ fontSize: 12, color: 'var(--brand-subtle)', margin: 0 }}>Imagem ou PDF</p>
                  </>
              }
            </button>

            {receipt && (
              <button onClick={() => setReceipt(null)} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--brand-subtle)', cursor: 'pointer', textDecoration: 'underline' }}>
                Remover comprovante
              </button>
            )}

            {/* Resumo */}
            <div style={{ padding: '16px', borderRadius: 12, background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Resumo</p>
              <Row label="Projeto" value={form.project_name} />
              <Row label="Valor" value={`R$ ${Number(form.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
              <Row label="Categoria" value={form.category_name} />
              <Row label="Data" value={new Date(form.expense_date + 'T12:00:00').toLocaleDateString('pt-BR')} />
              <Row label="Status" value={form.is_paid ? 'Já pago' : 'Aguardando reembolso'} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div style={{ padding: '12px 24px 40px', flexShrink: 0 }}>
        {step < 3 && step !== 0 && (
          <button onClick={next} disabled={!canAdvance()}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
              background: canAdvance() ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
              border: canAdvance() ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--brand-border)',
              color: canAdvance() ? '#8B5CF6' : 'var(--brand-subtle)',
              transition: 'all 0.15s',
            }}>
            Próximo
          </button>
        )}
        {step === 3 && (
          <button onClick={handleSave} disabled={saving}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,255,255,0.04)' : 'rgba(139,92,246,0.1)',
              border: saving ? '1px solid var(--brand-border)' : '1px solid rgba(139,92,246,0.3)',
              color: saving ? 'var(--brand-subtle)' : '#8B5CF6',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
            }}>
            {saving ? 'Salvando...' : <><Check size={18} /> Salvar despesa</>}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--brand-subtle)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--brand-text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
