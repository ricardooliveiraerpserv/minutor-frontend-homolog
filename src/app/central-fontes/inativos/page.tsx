'use client'

// Central de Fontes — aba Inativos: repositórios DESABILITADOS (source_doc_repo_settings.hidden).
// Somem das consultas (Acervo/Impacto/Busca/Catálogo/Cobertura) mas mantêm a ingestão. Aqui ficam
// listados para consulta e reativação. Só leitura + reativar (perm inventory).

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { EyeOff, FolderGit2, RotateCcw, ExternalLink } from 'lucide-react'
import { Badge, Card, EmptyState, PageHeader, Select, SkeletonTable, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

interface HiddenRepo {
  customer_id: number
  customer_name: string | null
  repository: string
  fontes: number
  updated_at: string | null
  updated_by_name: string | null
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function InativosPage() {
  const [rows, setRows] = useState<HiddenRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customer, setCustomer] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setRows(null); setError(null)
    api.get<{ data: HiddenRepo[] }>('/source-docs/repos/hidden')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar repositórios inativos.'))
  }, [])
  useEffect(() => { load() }, [load])

  const empresas = useMemo(() => {
    const map = new Map<number, string>()
    ;(rows ?? []).forEach((r) => map.set(r.customer_id, r.customer_name ?? `#${r.customer_id}`))
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => !customer || String(r.customer_id) === customer),
    [rows, customer],
  )

  const reactivate = async (r: HiddenRepo) => {
    const key = `${r.customer_id}:${r.repository}`
    setBusy(key)
    try {
      await api.put('/source-docs/repos/settings', { customer_id: r.customer_id, repository: r.repository, hidden: false })
      toast.success(`Repositório "${r.repository}" reativado — volta a aparecer nas consultas.`)
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao reativar.') }
    finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader icon={EyeOff} title="Repositórios inativos" subtitle="Repositórios desabilitados na Central — não aparecem nas consultas, mas seguem sendo ingeridos. Consulte aqui e reative quando precisar." />

      <Card padding="none">
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
            {filtered.length} {filtered.length === 1 ? 'repositório' : 'repositórios'}
          </div>
          <Select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">Todas as empresas</option>
            {empresas.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </Select>
        </div>

        {error ? <EmptyState icon={FolderGit2} title="Erro" description={error} />
          : rows === null ? <SkeletonTable rows={6} cols={6} />
            : filtered.length === 0 ? <EmptyState icon={EyeOff} title="Nenhum repositório inativo" description="Não há repositórios desabilitados neste filtro. Desabilite um repositório no Acervo (painel da empresa)." />
              : (
                <div className="overflow-x-auto">
                  <Table>
                    <Thead><Tr><Th>Empresa</Th><Th>Repositório</Th><Th right>Fontes</Th><Th>Desabilitado em</Th><Th>Por</Th><Th></Th></Tr></Thead>
                    <Tbody>
                      {filtered.map((r) => {
                        const key = `${r.customer_id}:${r.repository}`
                        return (
                          <Tr key={key} className="opacity-90">
                            <Td className="text-sm">{r.customer_name ?? `#${r.customer_id}`}</Td>
                            <Td><div className="flex items-center gap-2 font-medium"><FolderGit2 size={14} className="text-[color:var(--muted-fg)]" /> {r.repository} <Badge variant="default">inativo</Badge></div></Td>
                            <Td right className="tabular-nums">{r.fontes}</Td>
                            <Td className="text-xs">{fmtDate(r.updated_at)}</Td>
                            <Td className="text-xs">{r.updated_by_name ?? '—'}</Td>
                            <Td right>
                              <div className="flex items-center justify-end gap-2">
                                <Link href={`/central-fontes/acervo?customer_id=${r.customer_id}`} className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--primary)' }}>
                                  Ver empresa <ExternalLink size={11} />
                                </Link>
                                <button disabled={busy === key} onClick={() => reactivate(r)} title="Reativar (volta a aparecer nas consultas)" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--primary,#157582)] hover:bg-[color:var(--muted-bg,#f1f5f9)] disabled:opacity-40">
                                  <RotateCcw size={13} /> Reativar
                                </button>
                              </div>
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              )}
      </Card>
    </>
  )
}
