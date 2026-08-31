'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Configuração REST AdvPL (RPO) por AMBIENTE — paridade com o configurador do ProSight
// enviado: URL do endpoint AdvPL, Usuário, Senha, Padrões de exclusão do RPO.
// O SERVIDOR Minutor consulta o RPO direto com essas credenciais (senha cifrada, nunca
// retornada). Git (url/branch/token) fica em "Repositórios Git da empresa".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Server, Save, PlugZap, RotateCcw, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Select, Skeleton, TextInput } from '@/components/ds'
import { ApiError } from '@/lib/api'
import { fetchProsightEnvironments, fetchRpoConfig, saveRpoConfig, testRpoConfig, scanRpoInventory, type RpoInvResult, type RpoInvStatus } from '@/lib/prosight/environments'

const INV_STATUS: Record<RpoInvStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  sincronizado:  { label: 'Sincronizado', variant: 'success' },
  recompilar:    { label: 'Recompilar', variant: 'warning' },
  verificar_rpo: { label: 'Verificar RPO', variant: 'default' },
  nao_compilado: { label: 'Não compilado', variant: 'danger' },
  so_rpo:        { label: 'Só no RPO', variant: 'default' },
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }

export function RpoRestConfigPanel({ customerId }: { customerId: number }) {
  const [envs, setEnvs] = useState<{ id: number; name?: string; type?: string }[]>([])
  const [envId, setEnvId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')          // vazio = manter atual
  const [passwordSet, setPasswordSet] = useState(false)
  const [exclusions, setExclusions] = useState('')
  const [insecure, setInsecure] = useState(false)

  const [scanning, setScanning] = useState(false)
  const [inv, setInv] = useState<RpoInvResult | null>(null)

  useEffect(() => {
    void fetchProsightEnvironments(customerId)
      .then((e) => setEnvs(e as { id: number; name?: string; type?: string }[]))
      .catch(() => setEnvs([]))
  }, [customerId])

  const load = useCallback(async (id: number) => {
    setLoading(true)
    try {
      const c = await fetchRpoConfig(id)
      setUrl(c.rpo_api_url ?? ''); setUser(c.rpo_api_user ?? ''); setPassword('')
      setPasswordSet(c.rpo_api_password_set); setExclusions(c.rpo_exclusion_patterns ?? ''); setInsecure(c.allow_insecure_tls)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar a configuração RPO.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (envId) void load(envId) }, [envId, load])

  const currentInput = () => ({
    rpo_api_url: url.trim() || undefined,
    rpo_api_user: user.trim() || undefined,
    rpo_api_password: password || undefined,   // só envia se preenchida
    rpo_exclusion_patterns: exclusions,
    allow_insecure_tls: insecure,
  })

  const save = async () => {
    if (!envId) return
    setSaving(true)
    try {
      const r = await saveRpoConfig(envId, currentInput())
      setPasswordSet(r.rpo_api_password_set); setPassword('')
      toast.success('Configuração RPO salva.')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao salvar.') }
    finally { setSaving(false) }
  }

  const test = async () => {
    if (!envId) return
    setTesting(true)
    try {
      const r = await testRpoConfig(envId, currentInput())
      if (r.ok) toast.success(r.message + (r.sample_count != null ? ` (${r.sample_count} registro[s])` : ''))
      else toast.error(r.message)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao testar o endpoint.') }
    finally { setTesting(false) }
  }

  const scan = async () => {
    if (!envId) return
    setScanning(true); setInv(null)
    try {
      const r = await scanRpoInventory(envId)
      setInv(r)
      if (!r.ok) toast.error(r.error ?? 'Falha no inventário.')
      else toast.success(`Inventário: ${r.summary?.total ?? 0} programas · saúde ${r.summary?.health_pct ?? 0}%`)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao gerar o inventário.') }
    finally { setScanning(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <Select label="Ambiente" value={envId ?? ''} disabled={!envs.length}
        onChange={(e) => setEnvId(Number(e.target.value) || null)}>
        <option value="">{envs.length ? 'Selecione…' : 'Nenhum ambiente cadastrado'}</option>
        {envs.map((en) => <option key={en.id} value={en.id}>{en.name ?? `Ambiente ${en.id}`}{en.type ? ` (${TYPE_LABEL[en.type] ?? en.type})` : ''}</option>)}
      </Select>

      {!envId ? (
        <Card><EmptyState icon={Server} title="Selecione um ambiente"
          description="A integração RPO é por ambiente (cada servidor Protheus tem seu endpoint). Escolha o ambiente para configurar." /></Card>
      ) : loading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <TextInput label="URL do endpoint AdvPL" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://servidor:4050/rest/PROSIGHTREST/prosight/rpo-inventory" />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>O inventário consulta o RPO diretamente via REST AdvPL (PROSIGHTREST).</p>
            </div>
            <TextInput label="Usuário REST AdvPL" value={user} onChange={(e) => setUser(e.target.value)} placeholder="acesso.temp" />
            <div>
              <TextInput label="Senha REST AdvPL" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe em branco para manter a senha atual" />
              {passwordSet && <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>Senha já configurada.</p>}
            </div>
            <div>
              <TextInput label="Padrões de exclusão do RPO" value={exclusions} onChange={(e) => setExclusions(e.target.value)}
                placeholder="GH*,TEMP*,ZTEST" />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Programas a ignorar na comparação. Separados por vírgula, suporta * como curinga. Ex: GH*,TEMP*</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={insecure} onChange={(e) => setInsecure(e.target.checked)} />
              Permitir TLS inseguro (certificado self-signed on-prem)
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={Save} loading={saving} onClick={() => void save()}>Salvar</Button>
              <Button variant="secondary" icon={PlugZap} loading={testing} onClick={() => void test()}>Testar API</Button>
              <Button variant="secondary" icon={ScanSearch} loading={scanning} onClick={() => void scan()}>Gerar inventário</Button>
              <Button variant="ghost" icon={RotateCcw} onClick={() => envId && void load(envId)}>Recarregar</Button>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              <Badge variant="warning">Servidor consulta direto</Badge> A credencial é usada pelo Minutor para consultar o RPO. Fica cifrada em repouso e nunca é devolvida à tela.
            </p>
          </div>
        </Card>
      )}

      {/* Resultado do inventário Git × RPO */}
      {envId && inv?.ok && inv.summary && (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold" style={{ color: 'var(--text)' }}>Inventário Git × RPO</h4>
              <Badge variant={inv.summary.health_pct >= 80 ? 'success' : inv.summary.health_pct >= 60 ? 'default' : inv.summary.health_pct >= 30 ? 'warning' : 'danger'}>
                Saúde {inv.summary.health_pct}% · {inv.summary.health_label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['sincronizado', 'recompilar', 'verificar_rpo', 'nao_compilado', 'so_rpo'] as RpoInvStatus[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <Badge variant={INV_STATUS[k].variant}>{INV_STATUS[k].label}</Badge> <b>{inv.summary!.counts[k] ?? 0}</b>
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {inv.summary.total} programas · {inv.rpo?.count ?? 0} no RPO · {inv.summary.rest_api_count} REST
              </span>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 420 }}>
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    {['Programa', 'Situação', 'Fonte (Git)', 'RPO', 'Status RPO'].map((h) => (
                      <th key={h} style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)', boxShadow: 'inset 0 -1px 0 var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.results!.slice(0, 500).map((r) => (
                    <tr key={r.program}>
                      <td className="text-sm font-mono" style={{ color: 'var(--text)' }}>{r.program}{r.is_rest_api && <Badge variant="default">REST</Badge>}</td>
                      <td><Badge variant={INV_STATUS[r.status].variant}>{INV_STATUS[r.status].label}</Badge></td>
                      <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{fmtDate(r.disk_date)}</td>
                      <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{fmtDate(r.rpo_date)}</td>
                      <td className="text-sm" style={{ color: 'var(--text-light)' }}>{r.rpo_status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inv.results!.length > 500 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mostrando 500 de {inv.results!.length}.</p>}
          </div>
        </Card>
      )}
    </div>
  )
}
