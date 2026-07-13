'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Trash2, Save, Pencil, Plug, ShieldCheck } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

interface Settings {
  accept_from?: string; import_as?: string; append_existing?: boolean; associate_existing?: string
  import_from?: string; delete_after_days?: number; mark_read?: boolean
  smtp_auth?: boolean; smtp_use_incoming_auth?: boolean; send_single?: boolean; show_in_ticket_sender?: boolean
}
interface Account {
  id: number; name: string; email: string; brand: string | null; provider: string; enabled: boolean; receive_enabled: boolean
  protocol: string; host: string | null; port: number | null; encryption: string; username: string | null; inbox: string
  smtp_host: string | null; smtp_port: number | null; smtp_encryption: string | null
  default_team_id: number | null; settings: Settings | null; has_password: boolean; connection_status: string
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  connected: { label: 'Conectado', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  failed: { label: 'Falha na Conexão', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
  inactive: { label: 'Inativo', color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
  untested: { label: 'Não testado', color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
}

export function EmailAccounts() {
  const [rows, setRows] = useState<Account[]>([])
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const load = useCallback(() => { api.get<{ data: Account[] }>('/help-desk/email-accounts').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const del = async (a: Account) => { if (!confirm(`Excluir "${a.name}"?`)) return; try { await api.delete(`/help-desk/email-accounts/${a.id}`); load() } catch { toast.error('Erro') } }
  const test = async (a: Account) => {
    toast.info('Testando conexão…')
    try {
      const r = await api.post<{ data: { connection_status: string; error: string | null } }>(`/help-desk/email-accounts/${a.id}/test`, {})
      if (r?.data?.connection_status === 'connected') toast.success('Conectado!')
      else toast.error('Falha na conexão' + (r?.data?.error ? `: ${r.data.error}` : ''))
      load()
    } catch { toast.error('Erro no teste') }
  }

  if (editing) return <EmailAccountForm account={editing} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Contas de e-mail de recebimento — solicitações que chegam por e-mail viram chamado.</p>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing('new')}><Plus size={15} /> Nova conta</button>
      </div>
      <div className="ds-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
            <th className="px-3 py-2">Nome</th><th className="px-3 py-2">Endereço</th><th className="px-3 py-2">Status de Conexão</th><th className="px-3 py-2">E-mails na fila</th><th className="px-3 py-2">Habilitado</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhuma conta.</td></tr>}
            {rows.map(a => { const s = STATUS[a.connection_status] ?? STATUS.untested; return (
              <tr key={a.id} className="border-t ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-2"><button className="text-left" style={{ color: 'var(--text)' }} onClick={() => setEditing(a)}>{a.name}</button></td>
                <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{a.email}</td>
                <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span></td>
                <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-light)' }}>0</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: a.enabled ? 'var(--success-border)' : 'var(--text-muted)' }}>{a.enabled ? 'Sim' : 'Não'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button className="mr-2" title="Testar conexão" onClick={() => test(a)}><Plug size={14} style={{ color: 'var(--primary)' }} /></button>
                  <button className="mr-2" title="Editar" onClick={() => setEditing(a)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button>
                  <button title="Excluir" onClick={() => del(a)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
                </td>
              </tr>
            ) })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm text-left">
      <span className="w-9 h-5 rounded-full p-0.5 transition-colors shrink-0" style={{ background: on ? 'var(--primary)' : 'var(--surface-sunken)' }}>
        <span className="block w-4 h-4 rounded-full transition-transform" style={{ background: 'var(--surface)', transform: on ? 'translateX(16px)' : 'none' }} />
      </span>
      <span style={{ color: 'var(--text)' }}>{label}</span>
    </button>
  )
}

function EmailAccountForm({ account, onBack, onSaved }: { account: Account | 'new'; onBack: () => void; onSaved: () => void }) {
  const a = account === 'new' ? null : account
  const [tab, setTab] = useState<'principal' | 'recebimento' | 'envio'>('principal')
  const [name, setName] = useState(a?.name ?? ''); const [email, setEmail] = useState(a?.email ?? ''); const [brand, setBrand] = useState(a?.brand ?? '')
  const [enabled, setEnabled] = useState(a?.enabled ?? true)
  const [provider, setProvider] = useState(a?.provider ?? 'imap')
  const [receive, setReceive] = useState(a?.receive_enabled ?? true)
  const [protocol, setProtocol] = useState(a?.protocol ?? 'imap'); const [host, setHost] = useState(a?.host ?? ''); const [port, setPort] = useState(a?.port ? String(a.port) : '993'); const [enc, setEnc] = useState(a?.encryption ?? 'ssl')
  const [username, setUsername] = useState(a?.username ?? ''); const [password, setPassword] = useState(''); const [inbox, setInbox] = useState(a?.inbox ?? 'INBOX')
  const [smtpHost, setSmtpHost] = useState(a?.smtp_host ?? ''); const [smtpPort, setSmtpPort] = useState(a?.smtp_port ? String(a.smtp_port) : '587'); const [smtpEnc, setSmtpEnc] = useState(a?.smtp_encryption ?? 'tls')
  const [s, setS] = useState<Settings>(a?.settings ?? { accept_from: 'any', import_as: 'ticket', append_existing: true, associate_existing: 'customer', delete_after_days: 30, mark_read: true, smtp_auth: true, smtp_use_incoming_auth: true, send_single: true, show_in_ticket_sender: true })
  const [saving, setSaving] = useState(false)
  const setOpt = (k: keyof Settings, v: unknown) => setS(o => ({ ...o, [k]: v }))

  // Persiste a conta (cria/atualiza) e devolve o registro salvo — sem navegar.
  const persist = async (): Promise<Account | null> => {
    if (!name.trim() || !email.trim()) { toast.error('Informe nome e e-mail.'); return null }
    setSaving(true)
    const body: Record<string, unknown> = {
      name: name.trim(), email: email.trim(), brand: brand.trim() || null, provider, enabled, receive_enabled: receive,
      protocol, host: host.trim() || null, port: port ? Number(port) : null, encryption: enc, username: username.trim() || null, inbox: inbox.trim() || 'INBOX',
      smtp_host: smtpHost.trim() || null, smtp_port: smtpPort ? Number(smtpPort) : null, smtp_encryption: smtpEnc, settings: s,
    }
    if (password) body.password = password
    try {
      const r = a
        ? await api.put<{ data: Account }>(`/help-desk/email-accounts/${a.id}`, body)
        : await api.post<{ data: Account }>('/help-desk/email-accounts', body)
      return r?.data ?? null
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar'); return null }
    finally { setSaving(false) }
  }

  const save = async () => { const saved = await persist(); if (saved) { toast.success('Conta salva'); onSaved() } }

  // Conecta via Microsoft 365: salva e valida a caixa pelo Graph (app-only, sem senha).
  const connectMs = async () => {
    const saved = await persist()
    if (!saved) return
    toast.info('Conectando via Microsoft 365…')
    try {
      const r = await api.post<{ data: { connection_status: string; error: string | null } }>(`/help-desk/email-accounts/${saved.id}/test`, {})
      if (r?.data?.connection_status === 'connected') toast.success('Conectado!')
      else toast.error('Falha na conexão' + (r?.data?.error ? `: ${r.data.error}` : ''))
    } catch { toast.error('Erro no teste') }
    onSaved()
  }

  const Radio = ({ name: g, value, cur, set, label }: { name: string; value: string; cur?: string; set: (v: string) => void; label: string }) => (
    <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}><input type="radio" name={g} checked={cur === value} onChange={() => set(value)} /> {label}</label>
  )

  return (
    <div className="space-y-3 max-w-3xl">
      <button onClick={onBack} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Voltar</button>
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {([['principal', 'Principal'], ['recebimento', 'Recebimento'], ['envio', 'Envio']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="px-3 py-2 text-sm font-medium" style={{ color: tab === id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent' }}>{label}</button>
        ))}
      </div>

      <div className="ds-card p-4 space-y-3">
        {tab === 'principal' && <>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome</label><input className={`${fieldCls} w-full`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Endereço de e-mail</label><input className={`${fieldCls} w-full`} style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Marca (remetente)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={brand} onChange={e => setBrand(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text)' }}>
            <label className="flex items-center gap-1.5"><input type="radio" checked={enabled} onChange={() => setEnabled(true)} /> Habilitado</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={!enabled} onChange={() => setEnabled(false)} /> Desabilitado</label>
          </div>
          <Toggle on={!!s.show_in_ticket_sender} onChange={v => setOpt('show_in_ticket_sender', v)} label="Exibir esta conta como remetente no envio de e-mails do ticket" />
        </>}

        {tab === 'recebimento' && <>
          <Toggle on={receive} onChange={setReceive} label="Habilitar recebimento de e-mails" />
          <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Provedor / Autenticação</label>
            <select className={`${fieldCls} w-full`} style={inputStyle} value={provider} onChange={e => setProvider(e.target.value)}>
              <option value="microsoft365">Microsoft 365 / Exchange Online (OAuth · Graph)</option>
              <option value="imap">IMAP / POP3 (servidor próprio · usuário e senha)</option>
            </select>
          </div>

          {provider === 'microsoft365' && (
            <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                <ShieldCheck size={16} style={{ color: 'var(--primary)' }} /> Autenticação segura via OAuth2 (Microsoft Graph)
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                A Microsoft desativou o login por senha (Basic Auth) no Exchange Online. Esta conta conecta pelo
                app corporativo já autorizado (permissão <b>Mail.Read</b>), sem precisar de senha. Use <b>Testar conexão</b> para validar a caixa <b>{email || '(informe o e-mail)'}</b>.
              </p>
              <button type="button" onClick={connectMs} disabled={saving}
                className="ds-btn-primary inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg disabled:opacity-60">
                <Plug size={15} /> {saving ? 'Conectando…' : (a?.connection_status === 'connected' ? 'Reconectar / Testar' : 'Conectar com Microsoft 365')}
              </button>
              <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                Caixas fora do tenant corporativo exigiriam o fluxo delegado &quot;Reautorizar com Outlook&quot; (consentimento por conta) — ainda não habilitado.
              </p>
            </div>
          )}

          {provider === 'imap' && <>
          <div className="grid grid-cols-2 gap-3 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Protocolo</label><select className={`${fieldCls} w-full`} style={inputStyle} value={protocol} onChange={e => setProtocol(e.target.value)}><option value="imap">IMAP</option><option value="pop3">POP3</option></select></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Caixa (INBOX)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={inbox} onChange={e => setInbox(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Servidor (host)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={host} onChange={e => setHost(e.target.value)} placeholder="outlook.office365.com" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Porta</label><input className={`${fieldCls} w-full`} style={inputStyle} value={port} onChange={e => setPort(e.target.value)} /></div>
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Criptografia</label><select className={`${fieldCls} w-full`} style={inputStyle} value={enc} onChange={e => setEnc(e.target.value)}><option value="ssl">SSL</option><option value="tls">TLS</option><option value="none">Nenhuma</option></select></div>
            </div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Usuário</label><input className={`${fieldCls} w-full`} style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Senha {a && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>(em branco = mantém)</span>}</label><input type="password" className={`${fieldCls} w-full`} style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} placeholder={a?.has_password ? '••••••••' : ''} /></div>
          </div>
          </>}
          <div className="border-t pt-2 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Importar somente a partir de</label><input type="date" className={`${fieldCls}`} style={inputStyle} value={s.import_from ?? ''} onChange={e => setOpt('import_from', e.target.value)} /></div>
            <Toggle on={!!s.mark_read} onChange={v => setOpt('mark_read', v)} label="Marcar e-mail como lido ao importá-lo" />
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}><Toggle on={s.delete_after_days != null} onChange={v => setOpt('delete_after_days', v ? 30 : null)} label="Apagar mensagens processadas depois de" /><input className={`${fieldCls} w-16`} style={inputStyle} value={s.delete_after_days ?? ''} onChange={e => setOpt('delete_after_days', e.target.value ? Number(e.target.value) : null)} disabled={s.delete_after_days == null} /><span className="text-xs" style={{ color: 'var(--text-light)' }}>dias</span></div>
          </div>
          <div className="border-t pt-2 space-y-1" style={{ borderColor: 'var(--border)' }}>
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Abrir novos tickets a partir de e-mails:</div>
            <Radio name="acc" value="any" cur={s.accept_from} set={v => setOpt('accept_from', v)} label="De qualquer remetente" />
            <Radio name="acc" value="customer" cur={s.accept_from} set={v => setOpt('accept_from', v)} label="Somente se o remetente for cliente cadastrado" />
            <Radio name="acc" value="customer_or_rule" cur={s.accept_from} set={v => setOpt('accept_from', v)} label="Cliente, ou domínio nas Regras de Associação" />
            <Radio name="acc" value="none" cur={s.accept_from} set={v => setOpt('accept_from', v)} label="Não habilitar" />
          </div>
          <Toggle on={!!s.append_existing} onChange={v => setOpt('append_existing', v)} label="Incluir ações em tickets existentes (respostas)" />
          <div className="border-t pt-2 space-y-1" style={{ borderColor: 'var(--border)' }}>
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>E-mail com mesmo assunto de ticket existente:</div>
            <Radio name="ass" value="any" cur={s.associate_existing} set={v => setOpt('associate_existing', v)} label="Associar mesmo que não seja cliente/CC" />
            <Radio name="ass" value="customer" cur={s.associate_existing} set={v => setOpt('associate_existing', v)} label="Associar só se cliente ou CC do ticket" />
            <Radio name="ass" value="new" cur={s.associate_existing} set={v => setOpt('associate_existing', v)} label="Não associar e criar novo ticket" />
          </div>
        </>}

        {tab === 'envio' && <>
          {provider === 'microsoft365' ? (
            <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                <ShieldCheck size={16} style={{ color: 'var(--primary)' }} /> Envio pela mesma autenticação (Microsoft Graph · Mail.Send)
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                As respostas saem <b>como {email || 'esta caixa'}</b> pelo mesmo app OAuth do recebimento — sem SMTP, sem senha. Nada a configurar aqui.
              </p>
            </div>
          ) : <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1"><label className={lbl} style={{ color: 'var(--text-light)' }}>Servidor SMTP</label><input className={`${fieldCls} w-full`} style={inputStyle} value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.office365.com" /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Porta</label><input className={`${fieldCls} w-full`} style={inputStyle} value={smtpPort} onChange={e => setSmtpPort(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Criptografia</label><select className={`${fieldCls} w-full`} style={inputStyle} value={smtpEnc ?? 'tls'} onChange={e => setSmtpEnc(e.target.value)}><option value="ssl">SSL</option><option value="tls">TLS</option><option value="none">Nenhuma</option></select></div>
          </div>
          <Toggle on={!!s.smtp_auth} onChange={v => setOpt('smtp_auth', v)} label="Servidor requer autenticação" />
          <Toggle on={!!s.smtp_use_incoming_auth} onChange={v => setOpt('smtp_use_incoming_auth', v)} label="Usar as credenciais do recebimento" />
          <Toggle on={!!s.send_single} onChange={v => setOpt('send_single', v)} label="Enviar um único e-mail para todos os destinatários" />
          </>}
        </>}
      </div>

      <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar conta</button></div>
    </div>
  )
}
