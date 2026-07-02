'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Phone, Plus, X, Check } from 'lucide-react'

interface ContactType { id: number; nome: string; slug: string; ordem: number; ativo: boolean }
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function TiposContatoConfig() {
  const [rows, setRows] = useState<ContactType[]>([])
  const [novo, setNovo] = useState('')
  const load = useCallback(() => { api.get<{ data: ContactType[] }>('/crm/contact-types?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!novo.trim()) return
    try { await api.post('/crm/contact-types', { nome: novo.trim() }); setNovo(''); load(); toast.success('Tipo adicionado') }
    catch { toast.error('Erro ao adicionar (somente admin/administrativo)') }
  }
  const toggle = async (r: ContactType) => { try { await api.put(`/crm/contact-types/${r.id}`, { ativo: !r.ativo }); load() } catch { toast.error('Erro') } }
  const rename = async (r: ContactType, nome: string) => { if (nome && nome !== r.nome) { try { await api.put(`/crm/contact-types/${r.id}`, { nome }); load() } catch { toast.error('Erro') } } }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-1">
          <Phone size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Tipos de Contato (follow-up)</h1>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Tipos de contato usados nos follow-ups das oportunidades (Ligação, WhatsApp, Reunião…).</p>

        <div className="flex gap-2 mb-4">
          <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Novo tipo de contato…" className="flex-1 text-sm rounded-lg px-3 py-2 outline-none" style={inputStyle} />
          <button onClick={add} className="flex items-center gap-1.5 px-3 rounded-lg text-sm font-bold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
        </div>

        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: r.ativo ? 1 : 0.5 }}>
              <input defaultValue={r.nome} onBlur={e => rename(r, e.target.value.trim())} className="flex-1 bg-transparent outline-none" style={{ color: 'var(--text)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{r.slug}</span>
              <button onClick={() => toggle(r)} className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: r.ativo ? 'var(--success-bg)' : 'var(--surface-sunken)', color: r.ativo ? 'var(--success-border)' : 'var(--text-muted)' }}>
                {r.ativo ? <span className="flex items-center gap-1"><Check size={11} /> ativo</span> : <span className="flex items-center gap-1"><X size={11} /> inativo</span>}
              </button>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhum tipo cadastrado.</p>}
        </div>
      </div>
    </AppLayout>
  )
}
