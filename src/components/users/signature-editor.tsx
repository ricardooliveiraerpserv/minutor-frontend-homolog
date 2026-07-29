'use client'

/**
 * Editor da ASSINATURA padrão do usuário — campos ESTRUTURADOS (sem HTML livre).
 * O HTML é gerado pelo backend (template padrão ERPSERV); aqui só preview em tempo real,
 * em duas visões: "como e-mail" (iframe isolado) e "no sistema" (inline).
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { photoToDataUrl, inputStyle, fieldCls, lbl } from '@/lib/signature-fields'
import { Monitor, Mail, X } from 'lucide-react'

export interface SignatureData {
  role?: string; mobile?: string; photo?: string; show_photo?: boolean
  custom_cargo?: boolean // true = usa o cargo próprio (role); false = usa o padrão do perfil
  alt_email?: string     // e-mail secundário — usado na assinatura da OUTRA empresa (não a base)
  bizify_email?: string  // legado (compat) — lido como alt_email
}

// Máscara de celular: (00)00000.0000
function maskCelular(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)})${d.slice(2)}`
  return `(${d.slice(0, 2)})${d.slice(2, 7)}.${d.slice(7)}`
}

export function SignatureEditor({ value, onChange, name = '', email = '', lockRole = false, hidePhoto = false, userId, isBizify }: {
  value: SignatureData; onChange: (v: SignatureData) => void; name?: string; email?: string
  lockRole?: boolean   // cargo governado pelo admin (vínculo Cargo × Perfil) — só leitura
  hidePhoto?: boolean  // foto vem da foto de perfil do sistema — não edita aqui
  userId?: number      // usuário-alvo do preview (modal admin). Ausente = usa o logado (tela de perfil).
  isBizify?: boolean   // empresa base = Bizify (selecionada no form) → preview usa a marca Bizify
}) {
  const [variants, setVariants] = useState<{ system: string; email: string }>({ system: '', email: '' })
  const [view, setView] = useState<'system' | 'email'>('system')
  // Marca do preview. Admin precisa validar as DUAS (ERPSERV × Bizify) → toggle no cadastro.
  const brandProvided = typeof isBizify === 'boolean'
  const [brand, setBrand] = useState<'erpserv' | 'bizify'>(isBizify ? 'bizify' : 'erpserv')
  useEffect(() => { if (brandProvided) setBrand(isBizify ? 'bizify' : 'erpserv') }, [isBizify, brandProvided])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)
  // Sempre usa o value MAIS RECENTE (evita closure stale de callback async dropar campos, ex: foto).
  const valueRef = useRef(value)
  valueRef.current = value
  const set = (k: keyof SignatureData, v: string | boolean) => onChange({ ...valueRef.current, [k]: v })
  const html = view === 'system' ? variants.system : variants.email

  // Preview em tempo real (debounce) — render é sempre no servidor (fonte única do template).
  // Nome/e-mail vêm do cadastro (props); cargo/celular são editáveis aqui.
  // Guarda de corrida: só aplica a resposta da ÚLTIMA requisição (evita resposta antiga sem foto sobrescrever).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const id = ++reqId.current
      // Lê o value ATUAL no momento do envio (não o capturado pelo efeito) → nunca manda sem a foto.
      api.post<{ data: { system: string; email: string } }>('/signature/preview', { name, email, signature: valueRef.current, ...(typeof userId === 'number' ? { user_id: userId } : {}), ...(brandProvided ? { is_bizify: brand === 'bizify', home_is_bizify: !!isBizify } : {}) })
        .then(r => { if (id === reqId.current) setVariants({ system: r.data?.system ?? '', email: r.data?.email ?? '' }) })
        .catch(() => {})
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, name, email, userId, isBizify, brandProvided, brand])

  return (
    <div className="space-y-3">
      <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
        Layout fixo da marca ERPSERV. <b>Nome e e-mail</b> vêm do cadastro; <b>telefone fixo, site e cidade</b> são padrão da empresa.
        {lockRole ? <> O <b>cargo</b> é definido pelo seu perfil{hidePhoto ? <> e a <b>foto</b> é a foto de perfil do sistema</> : null}. Você edita só o celular.</> : <> Você edita só o cargo e o celular.</>}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Cargo {lockRole && <span style={{ color: 'var(--text-light)' }}>(definido pelo perfil)</span>}</label>
          {lockRole
            ? <input className={fieldCls} style={{ ...inputStyle, opacity: .7 }} value={value.role ?? ''} readOnly disabled />
            : <input className={fieldCls} style={inputStyle} value={value.role ?? ''} onChange={e => set('role', e.target.value)} placeholder="Diretor de Serviços" />}
        </div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Celular <span style={{ color: 'var(--text-light)' }}>(opcional)</span></label>
          <input className={fieldCls} style={inputStyle} value={value.mobile ?? ''} onChange={e => set('mobile', maskCelular(e.target.value))} inputMode="numeric" maxLength={15} placeholder="(00)00000.0000" />
        </div>
      </div>

      {hidePhoto && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" className="h-4 w-4 cursor-pointer" style={{ accentColor: 'var(--primary)' }}
            checked={!!value.show_photo} onChange={e => set('show_photo', e.target.checked)} />
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Incluir minha <b>foto de perfil</b> na assinatura</span>
        </label>
      )}

      {/* E-mail secundário — só no cadastro; usado na assinatura da OUTRA empresa (não a base).
          Empresa base ERPSERV → este é o e-mail Bizify; base Bizify → este é o e-mail ERPSERV. */}
      {brandProvided && (
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>E-mail {isBizify ? 'ERPSERV' : 'Bizify'} <span style={{ color: 'var(--text-light)' }}>(opcional — usado só na assinatura {isBizify ? 'ERPSERV' : 'Bizify'})</span></label>
          <input className={`${fieldCls} w-full`} style={inputStyle} value={value.alt_email ?? value.bizify_email ?? ''} onChange={e => set('alt_email', e.target.value)} inputMode="email" placeholder={isBizify ? 'nome@erpserv.com.br' : 'nome@bizify.com.br'} />
        </div>
      )}

      {!hidePhoto && (
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Foto (opcional)</label>
          <div className="flex items-center gap-2">
            <input className={`${fieldCls} flex-1`} style={inputStyle} value={(value.photo ?? '').startsWith('data:') ? '' : (value.photo ?? '')} onChange={e => set('photo', e.target.value)} placeholder="URL da foto" />
            <label className="ds-btn-secondary text-xs px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0">
              Upload…
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) photoToDataUrl(f).then(d => d && set('photo', d)) }} />
            </label>
            {value.photo && <img src={value.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />}
            {value.photo && <button type="button" onClick={() => set('photo', '')}><X size={13} style={{ color: 'var(--text-muted)' }} /></button>}
          </div>
        </div>
      )}

      {/* Preview */}
      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
          <span className={lbl} style={{ color: 'var(--text-light)' }}>Pré-visualização</span>
          <div className="flex items-center gap-2">
            {/* Marca — admin valida as DUAS assinaturas (ERPSERV × Bizify) alternando aqui. */}
            {brandProvided && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-sunken)' }}>
                {([['erpserv', 'ERPSERV'], ['bizify', 'Bizify']] as const).map(([b, t]) => (
                  <button key={b} type="button" onClick={() => setBrand(b)} className="text-xs px-2.5 py-1 rounded-md"
                    style={{ background: brand === b ? 'var(--primary-soft)' : 'transparent', color: brand === b ? 'var(--primary)' : 'var(--text-muted)', fontWeight: brand === b ? 600 : 400 }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-sunken)' }}>
              {([['system', Monitor, 'No sistema'], ['email', Mail, 'Como e-mail']] as const).map(([m, Icon, t]) => (
                <button key={m} type="button" onClick={() => setView(m)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md"
                  style={{ background: view === m ? 'var(--primary-soft)' : 'transparent', color: view === m ? 'var(--primary)' : 'var(--text-muted)', fontWeight: view === m ? 600 : 400 }}>
                  <Icon size={13} /> {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {view === 'email'
          ? <EmailFrame key={html.length} html={html} />
          : <div className="rounded-lg p-4 overflow-auto" style={{ background: '#ffffff', border: '1px solid var(--border)' }} dangerouslySetInnerHTML={{ __html: html }} />}
        {!(value.role ?? '').trim() && !(value.mobile ?? '').trim() && <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>Sem cargo/celular, mostramos a assinatura institucional da empresa (fallback).</p>}
      </div>
    </div>
  )
}
