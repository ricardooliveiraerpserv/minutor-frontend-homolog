'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Conexão do Connector (Camada A) — gerar token de enrollment, ver o agente
// conectado, revogar. O token é exibido UMA vez (só o hash é guardado). O enroll
// de fato é feito pelo AGENTE on-prem, fora do Minutor. Nenhum path/INI/secret
// trafega. Perm: prosight.operations.manage.
// Componente compartilhado: usado no Prosight (Configuração por empresa) e no
// detalhe de ambiente de Operações Protheus. `presence` é opcional.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, PlugZap, RefreshCw, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Modal, Skeleton } from '@/components/ds'
import { ApiError } from '@/lib/api'
import {
  fetchAgentStatus, issueEnrollmentToken, presenceLabel, revokeAgent,
  type AgentStatus, type EnrollmentToken, type EnvironmentPresence,
} from '@/lib/prosight/environments'
import { useAuth } from '@/contexts/auth-context'

function Section({ icon: Icon, title, children }: { icon: typeof PlugZap; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} style={{ color: 'var(--text-light)' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export function ConnectorConnection({ environmentId, presence = null }: { environmentId: number; presence?: EnvironmentPresence | null }) {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('prosight.operations.manage')

  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<EnrollmentToken | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setAgent(await fetchAgentStatus(environmentId)) } catch { setAgent(null) } finally { setLoading(false) }
  }, [environmentId])
  useEffect(() => { void load() }, [load])

  const genToken = async () => {
    setBusy(true)
    try { setToken(await issueEnrollmentToken(environmentId)) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao gerar token.') }
    finally { setBusy(false) }
  }
  const doRevoke = async () => {
    if (!agent) return
    setBusy(true)
    try { await revokeAgent(agent.agent_id); toast.success('Acesso do agente revogado.'); setConfirmRevoke(false); await load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao revogar.') }
    finally { setBusy(false) }
  }
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast.success('Token copiado.')) }

  const pres = presenceLabel(presence)
  const connected = !!agent && !agent.revoked_at

  return (
    <Section icon={PlugZap} title="Conexão do Connector">
      {loading ? <Skeleton className="h-16 w-full" /> : (
        <div className="flex flex-col gap-3">
          {connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <span className="inline-flex items-center gap-2">
                  <Badge variant="success">Agente conectado</Badge>
                  <Badge variant={pres.variant}>Presença: {pres.label}</Badge>
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  ID <span className="font-mono">{agent!.agent_id.slice(0, 8)}…</span>
                  {agent!.fingerprint && <> · fingerprint <span className="font-mono">{agent!.fingerprint.slice(0, 12)}…</span></>}
                  {agent!.agent_version && <> · v{agent!.agent_version}</>}
                  {agent!.enrolled_at && <> · desde {new Date(agent!.enrolled_at).toLocaleString('pt-BR')}</>}
                </span>
              </div>
              {canManage && <div className="flex gap-2">
                <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void load()}>Atualizar</Button>
                <Button size="sm" variant="danger" icon={ShieldOff} disabled={busy} onClick={() => setConfirmRevoke(true)}>Revogar acesso</Button>
              </div>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <Badge variant="default">Sem agente conectado</Badge>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Gere um token e cole-o no <b>agente Connector on-prem</b>. O agente se conecta sozinho (outbound); nenhum caminho/INI/segredo trafega para o Minutor.
                </span>
              </div>
              {canManage && <Button size="sm" icon={KeyRound} disabled={busy} onClick={genToken}>Gerar token de conexão</Button>}
            </div>
          )}
          {!canManage && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Gerar/revogar exige permissão de gestão do Connector.</span>}
        </div>
      )}

      {/* Modal: token exibido UMA vez */}
      <Modal open={!!token} onClose={() => setToken(null)} title="Token de conexão do Connector">
        {token && <div className="flex flex-col gap-3 text-sm">
          <p style={{ color: 'var(--text-muted)' }}>Exibido <b>uma única vez</b>. Cole-o na configuração do <b>agente Connector</b> na máquina do ambiente. O Minutor guarda só o hash — não é possível recuperá-lo depois.</p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 px-3 py-2 rounded font-mono text-xs break-all" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>{token.enrollment_token}</code>
            <Button size="sm" icon={Copy} onClick={() => copy(token.enrollment_token)}>Copiar</Button>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>Expira em {new Date(token.expires_at).toLocaleString('pt-BR')}. Após o enroll do agente, atualize esta tela para ver a conexão.</span>
          <div className="flex justify-end"><Button variant="ghost" onClick={() => { setToken(null); void load() }}>Fechar</Button></div>
        </div>}
      </Modal>

      {/* Modal: confirmar revogação */}
      <Modal open={confirmRevoke} onClose={() => setConfirmRevoke(false)} title="Revogar acesso do agente">
        <div className="flex flex-col gap-3 text-sm">
          <p>Revogar o acesso do agente <span className="font-mono">{agent?.agent_id.slice(0, 8)}…</span> deste ambiente? Ele perde a autoridade imediatamente e precisará de um novo token para reconectar.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmRevoke(false)}>Cancelar</Button>
            <Button variant="danger" icon={busy ? RefreshCw : ShieldOff} disabled={busy} onClick={doRevoke}>Revogar</Button></div>
        </div>
      </Modal>
    </Section>
  )
}
