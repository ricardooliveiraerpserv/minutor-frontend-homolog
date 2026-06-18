'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Building2, Save } from 'lucide-react'

interface Contratada { nome: string; cnpj: string; endereco: string; cep: string }
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function ContratadaConfig() {
  const [f, setF] = useState<Contratada>({ nome: '', cnpj: '', endereco: '', cep: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.get<{ data: Contratada }>('/crm/proposal-config/contratada').then(r => { if (r?.data) setF(r.data) }).catch(() => {})
  }, [])
  const set = (k: keyof Contratada, v: string) => setF(p => ({ ...p, [k]: v }))
  const salvar = async () => {
    setSaving(true)
    try { await api.put('/crm/proposal-config/contratada', f); toast.success('Dados da contratada salvos') }
    catch { toast.error('Erro ao salvar (somente admin/administrativo)') } finally { setSaving(false) }
  }
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Dados da Contratada</h1>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Aparecem no Aceite de <b>todas</b> as propostas. Cadastre uma vez.</p>
        <div className="space-y-3 rounded-xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <label className="block"><span className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-muted)' }}>Nome / Razão social</span>
            <input value={f.nome} onChange={e => set('nome', e.target.value)} className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-muted)' }}>CNPJ</span>
              <input value={f.cnpj} onChange={e => set('cnpj', e.target.value)} className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle} /></label>
            <label className="block"><span className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-muted)' }}>CEP</span>
              <input value={f.cep} onChange={e => set('cep', e.target.value)} className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle} /></label>
          </div>
          <label className="block"><span className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-muted)' }}>Endereço</span>
            <input value={f.endereco} onChange={e => set('endereco', e.target.value)} className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle} /></label>
          <button onClick={salvar} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Save size={14} />{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </AppLayout>
  )
}
