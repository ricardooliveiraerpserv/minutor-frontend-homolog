'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Save } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

interface Tpl {
  company_name: string; primary_color: string; font: string; button_label: string
  footer_text: string; signature: string; show_minutor: boolean
  ticket_prefix: string; ticket_padding: number; ticket_next: number
}

export function CommTemplate() {
  const [t, setT] = useState<Tpl | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get<{ data: Tpl }>('/help-desk/comm-template').then(r => setT(r?.data ?? null)).catch(() => {}) }, [])
  const set = (k: keyof Tpl, v: unknown) => setT(o => o ? { ...o, [k]: v } : o)
  const save = async () => {
    if (!t) return
    setSaving(true)
    try { await api.put('/help-desk/comm-template', t); toast.success('Template institucional salvo') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }
  if (!t) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>

  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Layout único de todos os e-mails do Help Desk (gatilhos e respostas). O logo da ERPSERV é incluído automaticamente.</p>
      <div className="ds-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome da empresa</label><input className={`${fieldCls} w-full`} style={inputStyle} value={t.company_name} onChange={e => set('company_name', e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor principal</label>
            <div className="flex items-center gap-2">
              <input type="color" className="h-8 w-10 rounded cursor-pointer" style={{ border: '1px solid var(--border)' }} value={t.primary_color} onChange={e => set('primary_color', e.target.value)} />
              <input className={`${fieldCls} flex-1`} style={inputStyle} value={t.primary_color} onChange={e => set('primary_color', e.target.value)} />
            </div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Texto do botão</label><input className={`${fieldCls} w-full`} style={inputStyle} value={t.button_label} onChange={e => set('button_label', e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Fonte</label><input className={`${fieldCls} w-full`} style={inputStyle} value={t.font} onChange={e => set('font', e.target.value)} /></div>
          <div className="col-span-2"><label className={lbl} style={{ color: 'var(--text-light)' }}>Assinatura</label><input className={`${fieldCls} w-full`} style={inputStyle} value={t.signature} onChange={e => set('signature', e.target.value)} /></div>
          <div className="col-span-2"><label className={lbl} style={{ color: 'var(--text-light)' }}>Texto do rodapé</label><input className={`${fieldCls} w-full`} style={inputStyle} value={t.footer_text} onChange={e => set('footer_text', e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={t.show_minutor} onChange={e => set('show_minutor', e.target.checked)} /> Exibir &quot;enviada via Minutor&quot; (discreto, no rodapé)
        </label>
        <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar template</button></div>
      </div>

      {/* Numeração de chamados */}
      <div className="ds-card p-4 space-y-3">
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Numeração de chamados</div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Prefixo (opcional)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={t.ticket_prefix ?? ''} onChange={e => set('ticket_prefix', e.target.value)} placeholder="ex.: vazio ou HD-" /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Dígitos (zeros)</label><input type="number" min={1} max={12} className={`${fieldCls} w-full`} style={inputStyle} value={t.ticket_padding} onChange={e => set('ticket_padding', Number(e.target.value))} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Próximo número (iniciador)</label><input type="number" min={1} className={`${fieldCls} w-full`} style={inputStyle} value={t.ticket_next} onChange={e => set('ticket_next', Number(e.target.value))} /></div>
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Próximo chamado ficará: <span className="font-semibold" style={{ color: 'var(--primary)' }}>{(t.ticket_prefix ?? '') + String(Math.max(1, t.ticket_next || 1)).padStart(Math.max(1, Math.min(12, t.ticket_padding || 6)), '0')}</span></div>
        <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar numeração</button></div>
      </div>
    </div>
  )
}
