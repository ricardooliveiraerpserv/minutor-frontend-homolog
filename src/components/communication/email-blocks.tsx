'use client'

/**
 * Blocos REUTILIZÁVEIS do editor de comunicação. O usuário NÃO monta layout — apenas
 * preenche o conteúdo dentro destes campos controlados. A paleta de cor é restrita
 * (roxo/verde/ciano/vermelho/cinza) e o HTML é limitado (sem layout livre).
 */
import { type RefCallback } from 'react'
import { RichEditor, type RichEditorHandle } from '@/components/help-desk/rich-editor'
import { Plus, Trash2, X, Megaphone, MousePointerClick, ListChecks, Info } from 'lucide-react'

export const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const
export const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none w-full'
export const lbl = 'text-[11px] font-semibold block mb-0.5'
// Paleta CONTROLADA: roxo (marca), verde, ciano, vermelho (alerta), cinza.
export const BRAND_PALETTE = ['#6d28d9', '#16a34a', '#0891b2', '#dc2626', '#6b7280']

export interface Signature { enabled: boolean; name: string; role: string; phone: string; email: string; site: string; photo: string }
export const emptySig = (): Signature => ({ enabled: false, name: '', role: '', phone: '', email: '', site: '', photo: '' })

const Req = () => <span style={{ color: 'var(--danger)' }}> *</span>

// Reduz a foto da assinatura para um quadrado ~128px e devolve data:URI (leve p/ e-mail).
export function photoToDataUrl(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const S = 128
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S
      const ctx = canvas.getContext('2d'); URL.revokeObjectURL(url)
      if (!ctx) return resolve('')
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

/** HERO (marketing): título + subtítulo + badge — capa em gradiente roxo. */
export function EmailHero({ title, onTitle, subtitle, onSubtitle, badge, onBadge }: {
  title: string; onTitle: (v: string) => void
  subtitle: string; onSubtitle: (v: string) => void
  badge: string; onBadge: (v: string) => void
}) {
  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--primary-soft), transparent)' }}>
      <div className="text-[11px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}><Megaphone size={13} /> HERO (capa)</div>
      <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Título<Req /></label>
        <input className={fieldCls} style={inputStyle} value={title} onChange={e => onTitle(e.target.value)} placeholder="Título grande de impacto" /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Badge</label>
          <input className={fieldCls} style={inputStyle} value={badge} onChange={e => onBadge(e.target.value)} maxLength={40} placeholder="ex.: URGENTE" /></div>
        <div className="col-span-2"><label className={lbl} style={{ color: 'var(--text-light)' }}>Subtítulo<Req /></label>
          <input className={fieldCls} style={inputStyle} value={subtitle} onChange={e => onSubtitle(e.target.value)} placeholder="Linha de apoio do título" /></div>
      </div>
    </div>
  )
}

/** Seção de texto rico controlada (paleta restrita, sem layout livre). */
export function EmailSection({ label, required, hint, initialHtml, onRegister, formKey, minHeight = 90 }: {
  label: string; required?: boolean; hint?: string; initialHtml: string
  onRegister: RefCallback<RichEditorHandle>; formKey: number | string; minHeight?: number
}) {
  return (
    <div>
      <label className={lbl} style={{ color: 'var(--text-light)' }}>{label}{required && <Req />}</label>
      {hint && <p className="text-[11px] mb-1" style={{ color: 'var(--text-light)' }}>{hint}</p>}
      <RichEditor key={`${label}-${formKey}`} ref={onRegister} initialHtml={initialHtml} minHeight={minHeight} showAttach={false} colors={BRAND_PALETTE} allowCustomColor={false} />
    </div>
  )
}

/** Campo de texto simples controlado. */
export function EmailField({ label, value, onChange, placeholder, required, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; maxLength?: number
}) {
  return (
    <div><label className={lbl} style={{ color: 'var(--text-light)' }}>{label}{required && <Req />}</label>
      <input className={fieldCls} style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} /></div>
  )
}

/** Lista de benefícios (mín. 1), rich por item — renderizados com ícone ✔. */
export function EmailBenefits({ benefits, onAdd, onRemove, onRegister, formKey }: {
  benefits: { id: number; html: string }[]
  onAdd: () => void; onRemove: (id: number) => void
  onRegister: (id: number) => RefCallback<RichEditorHandle>; formKey: number | string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={lbl} style={{ color: 'var(--text-light)', marginBottom: 0 }}><ListChecks size={12} className="inline mr-1" />Benefícios<Req /></label>
        <button onClick={onAdd} className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={11} /> adicionar</button>
      </div>
      {benefits.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Liste ao menos 1 benefício (saem com ícone ✔, na cor da marca).</p>}
      <div className="space-y-2">
        {benefits.map(b => (
          <div key={`ben-${formKey}-${b.id}`} className="flex items-start gap-2">
            <span className="text-sm font-bold mt-2 shrink-0" style={{ color: 'var(--primary)' }}>✔</span>
            <div className="flex-1 min-w-0">
              <RichEditor ref={onRegister(b.id)} initialHtml={b.html} minHeight={44} showAttach={false} colors={BRAND_PALETTE} allowCustomColor={false} />
            </div>
            <button onClick={() => onRemove(b.id)} className="mt-2 shrink-0" title="Remover"><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** CTA estruturado (label + URL). */
export function EmailCTA({ label, onLabel, url, onUrl, required }: {
  label: string; onLabel: (v: string) => void; url: string; onUrl: (v: string) => void; required?: boolean
}) {
  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="text-[11px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
        <MousePointerClick size={13} /> Botão (CTA){required && <span style={{ color: 'var(--danger)' }}>* obrigatório em Marketing</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={fieldCls} style={inputStyle} value={label} onChange={e => onLabel(e.target.value)} placeholder="Texto do botão" />
        <input className={fieldCls} style={inputStyle} value={url} onChange={e => onUrl(e.target.value)} placeholder="https://…" />
      </div>
    </div>
  )
}

/** Assinatura opcional (nome/cargo/contato + foto até 128px). */
export function EmailSignature({ sig, onToggle, onField, onPhoto }: {
  sig: Signature; onToggle: (on: boolean) => void
  onField: (patch: Partial<Signature>) => void; onPhoto: (file: File) => void
}) {
  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <label className="flex items-center gap-2 text-[12px] font-bold cursor-pointer" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={sig.enabled} onChange={e => onToggle(e.target.checked)} /> Incluir assinatura
      </label>
      {sig.enabled && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={fieldCls} style={inputStyle} value={sig.name} onChange={e => onField({ name: e.target.value })} placeholder="Nome" />
            <input className={fieldCls} style={inputStyle} value={sig.role} onChange={e => onField({ role: e.target.value })} placeholder="Cargo · empresa" />
            <input className={fieldCls} style={inputStyle} value={sig.phone} onChange={e => onField({ phone: e.target.value })} placeholder="Telefone" />
            <input className={fieldCls} style={inputStyle} value={sig.email} onChange={e => onField({ email: e.target.value })} placeholder="E-mail" />
            <input className={fieldCls} style={inputStyle} value={sig.site} onChange={e => onField({ site: e.target.value })} placeholder="Site (ex.: www.erpserv.com.br)" />
          </div>
          <div className="flex items-center gap-2">
            <input className={`${fieldCls} flex-1`} style={inputStyle} value={sig.photo.startsWith('data:') ? '' : sig.photo} onChange={e => onField({ photo: e.target.value })} placeholder="URL da foto (opcional)" />
            <label className="ds-btn-secondary text-xs px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0">
              Foto…
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f) }} />
            </label>
            {sig.photo && <img src={sig.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />}
            {sig.photo && <button onClick={() => onField({ photo: '' })}><X size={13} style={{ color: 'var(--text-muted)' }} /></button>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Footer institucional FIXO (não editável) — apenas informa o usuário. */
export function EmailFooter() {
  return (
    <div className="rounded-lg p-2.5 text-[11px] flex items-start gap-2" style={{ border: '1px dashed var(--border)', color: 'var(--text-light)' }}>
      <Info size={13} className="mt-0.5 shrink-0" />
      <span>Footer automático e fixo: <b>Central de Atendimento — ERPSERV</b> · mensagem via Minutor · link de cancelar inscrição. Não editável (identidade da marca).</span>
    </div>
  )
}
