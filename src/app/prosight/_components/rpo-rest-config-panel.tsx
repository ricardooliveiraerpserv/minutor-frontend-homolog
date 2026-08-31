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

// Cores por status (para donut/cards) — hex fixos p/ SVG, alinhados aos badges.
const INV_COLOR: Record<RpoInvStatus, string> = {
  sincronizado: '#22c55e', recompilar: '#f59e0b', verificar_rpo: '#a855f7', nao_compilado: '#06b6d4', so_rpo: '#ef4444',
}
const INV_SUB: Record<RpoInvStatus, string> = {
  sincronizado: 'em dia', recompilar: 'disco mais novo', verificar_rpo: 'RPO mais novo', nao_compilado: 'só no disco', so_rpo: 'sem fonte local',
}
const INV_ORDER: RpoInvStatus[] = ['sincronizado', 'recompilar', 'verificar_rpo', 'nao_compilado', 'so_rpo']
type InvFilter = RpoInvStatus | 'all' | 'rest_api'

function healthColor(pct: number) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444'
}

// Gauge circular de saúde (SVG).
function HealthGauge({ pct, label, sync, total }: { pct: number; label: string; sync: number; total: number }) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  const col = healthColor(pct)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Índice de saúde</div>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 70 70)" />
        <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill={col}>{pct}%</text>
        <text x="70" y="88" textAnchor="middle" fontSize="12" fill="var(--text-muted)">{label}</text>
      </svg>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{sync} sincronizados de {total} fontes</div>
    </div>
  )
}

// Donut de distribuição (SVG) — segmentos por status.
function StatusDonut({ counts, total }: { counts: Record<RpoInvStatus, number>; total: number }) {
  const r = 52, sw = 22, c = 2 * Math.PI * r
  const fracs = INV_ORDER.map((k) => ({ k, v: counts[k] || 0, frac: total > 0 ? (counts[k] || 0) / total : 0 }))
  const segs = fracs.map((f, i) => {
    const prev = fracs.slice(0, i).reduce((a, x) => a + x.frac, 0)
    return { k: f.k, v: f.v, dash: f.frac * c, off: c * (1 - prev) }
  }).filter((s) => s.v > 0)
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
      {segs.map((s) => (
        <circle key={s.k} cx="70" cy="70" r={r} fill="none" stroke={INV_COLOR[s.k]} strokeWidth={sw}
          strokeDasharray={`${s.dash} ${c - s.dash}`} strokeDashoffset={s.off} transform="rotate(-90 70 70)" />
      ))}
    </svg>
  )
}

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
  const [invFilter, setInvFilter] = useState<InvFilter>('all')
  const [invSearch, setInvSearch] = useState('')

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
    setScanning(true); setInv(null); setInvFilter('all'); setInvSearch('')
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

      {/* Dashboard do inventário Git × RPO */}
      {envId && inv?.ok && inv.summary && (() => {
        const s = inv.summary!
        const pick = (f: InvFilter) => setInvFilter((cur) => (cur === f ? 'all' : f))
        const q = invSearch.trim().toLowerCase()
        const results = (inv.results ?? []).filter((r) => {
          if (invFilter === 'rest_api') { if (!r.is_rest_api) return false }
          else if (invFilter !== 'all') { if (r.status !== invFilter) return false }
          if (q && !r.program.toLowerCase().includes(q)) return false
          return true
        })
        const kpis: { key: InvFilter; label: string; value: number; sub: string; color: string }[] = [
          { key: 'all', label: 'Total de fontes', value: s.total, sub: 'disco + RPO', color: 'var(--text)' },
          ...INV_ORDER.map((k) => ({ key: k as InvFilter, label: INV_STATUS[k].label, value: s.counts[k] ?? 0, sub: INV_SUB[k], color: INV_COLOR[k] })),
          { key: 'rest_api', label: 'APIs REST', value: s.rest_api_count, sub: 'programas', color: '#06b6d4' },
        ]
        return (
          <Card>
            <div className="flex flex-col gap-4">
              {/* Gauge + Donut + legenda clicável */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl p-4 flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <HealthGauge pct={s.health_pct} label={s.health_label} sync={s.counts.sincronizado} total={s.total} />
                </div>
                <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <StatusDonut counts={s.counts} total={s.total} />
                  <div className="flex flex-col gap-1.5 flex-1">
                    {INV_ORDER.map((k) => {
                      const v = s.counts[k] ?? 0, pct = s.total ? Math.round((v / s.total) * 1000) / 10 : 0
                      return (
                        <button key={k} onClick={() => pick(k)} className="flex items-center gap-2 text-sm rounded-md px-2 py-1 text-left"
                          style={{ background: invFilter === k ? 'var(--surface-hover)' : 'transparent' }}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: INV_COLOR[k] }} />
                          <span className="flex-1" style={{ color: 'var(--text)' }}>{INV_STATUS[k].label}</span>
                          <b style={{ color: INV_COLOR[k] }}>{v}</b>
                          <span className="text-xs w-12 text-right" style={{ color: 'var(--text-light)' }}>{pct}%</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Cards clicáveis (KPIs) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {kpis.map((k) => (
                  <button key={k.key} onClick={() => k.key === 'all' ? setInvFilter('all') : pick(k.key)}
                    className="rounded-xl p-3 text-left transition"
                    style={{ background: 'var(--surface)', border: `1px solid ${invFilter === k.key ? k.color : 'var(--border)'}`, outline: invFilter === k.key ? `1px solid ${k.color}` : 'none' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>{k.label}</div>
                    <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{k.sub}</div>
                  </button>
                ))}
              </div>

              {/* Busca + filtro ativo */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <TextInput label="" placeholder="Buscar programa…" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
                </div>
                {invFilter !== 'all' && (
                  <Button variant="ghost" size="sm" onClick={() => setInvFilter('all')}>
                    Filtro: {invFilter === 'rest_api' ? 'APIs REST' : INV_STATUS[invFilter].label} ✕
                  </Button>
                )}
                <span className="text-xs" style={{ color: 'var(--text-light)' }}>{results.length} de {s.total}</span>
              </div>

              {/* Tabela filtrada */}
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
                    {results.slice(0, 500).map((r) => (
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
              {results.length > 500 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mostrando 500 de {results.length}.</p>}
              <p className="text-[11px] text-center" style={{ color: 'var(--text-light)' }}>Clique em qualquer status ou card para filtrar a lista.</p>
            </div>
          </Card>
        )
      })()}
    </div>
  )
}
