'use client'

// Central de Fontes — gestão das solicitações de fonte (empresa, escopo, chamado,
// prioridade, solicitante). Ações: atender / rejeitar / reabrir. Só leitura do acervo.

import { useCallback, useEffect, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Select, SkeletonTable, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

interface Req {
  id: number
  customer_id: number | null
  customer_name: string | null
  repository: string | null
  ticket: string | null
  priority: 'baixa' | 'media' | 'alta' | string
  scope_type: 'source' | 'folder' | 'repository' | string
  paths: string[] | null
  note: string | null
  status: 'open' | 'provisioned' | 'rejected' | string
  requester_name: string | null
  created_at: string | null
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR') : '—')
const prioBadge = (p: string) => p === 'alta' ? <Badge variant="danger">Alta</Badge> : p === 'baixa' ? <Badge variant="default">Baixa</Badge> : <Badge variant="warning">Média</Badge>
const statusBadge = (s: string) => s === 'provisioned' ? <Badge variant="success">Atendida</Badge> : s === 'rejected' ? <Badge variant="default">Rejeitada</Badge> : <Badge variant="warning">Aberta</Badge>
const scopeLabel = (r: Req) => r.scope_type === 'folder' ? `Pasta${r.paths?.[0] ? ` · ${r.paths[0]}` : ''}` : r.scope_type === 'source' ? `${r.paths?.length ?? 0} fonte${(r.paths?.length ?? 0) === 1 ? '' : 's'}` : 'Repositório'

export default function SolicitacoesPage() {
  const [rows, setRows] = useState<Req[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('open')
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(() => {
    setRows(null); setError(null)
    api.get<{ data: Req[] }>(`/source-docs/source-requests?status=${status}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar as solicitações.'))
  }, [status])
  useEffect(() => { load() }, [load])

  const setReqStatus = async (id: number, s: string) => {
    setBusy(id)
    try { await api.patch(`/source-docs/source-requests/${id}`, { status: s }); toast.success('Solicitação atualizada.'); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao atualizar.') }
    finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader icon={FilePlus2} title="Solicitações de fonte" subtitle="Pedidos de provisionamento de fontes na Central — empresa, escopo, chamado e prioridade." />

      <Card padding="none">
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Solicitações</div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Abertas</option>
            <option value="provisioned">Atendidas</option>
            <option value="rejected">Rejeitadas</option>
            <option value="all">Todas</option>
          </Select>
        </div>

        {error ? <EmptyState icon={FilePlus2} title="Erro" description={error} />
          : rows === null ? <SkeletonTable rows={6} cols={7} />
            : rows.length === 0 ? <EmptyState icon={FilePlus2} title="Nenhuma solicitação" description="Não há solicitações neste filtro." />
              : (
                <div className="overflow-x-auto">
                  <Table>
                    <Thead><Tr><Th>Empresa</Th><Th>Escopo</Th><Th>Chamado</Th><Th>Prioridade</Th><Th>Solicitante</Th><Th>Data</Th><Th>Status</Th><Th></Th></Tr></Thead>
                    <Tbody>
                      {rows.map((r) => (
                        <Tr key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="cursor-pointer">
                          <Td><div className="font-medium">{r.customer_name ?? (r.customer_id ? `#${r.customer_id}` : '—')}</div><div className="text-xs" style={{ color: 'var(--text-light)' }}>{r.repository ?? '—'}</div></Td>
                          <Td><div className="text-sm">{scopeLabel(r)}</div>{expanded === r.id && r.paths && r.paths.length > 0 && <div className="mt-1 max-w-md text-xs" style={{ color: 'var(--text-light)' }}>{r.paths.slice(0, 20).join(', ')}{r.paths.length > 20 ? '…' : ''}</div>}{expanded === r.id && r.note && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Obs.: {r.note}</div>}</Td>
                          <Td>{r.ticket ? <Badge variant="default">#{r.ticket}</Badge> : '—'}</Td>
                          <Td>{prioBadge(r.priority)}</Td>
                          <Td className="text-sm">{r.requester_name ?? '—'}</Td>
                          <Td className="text-xs">{dt(r.created_at)}</Td>
                          <Td>{statusBadge(r.status)}</Td>
                          <Td>
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-1">
                              {r.status !== 'provisioned' && <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setReqStatus(r.id, 'provisioned')}>Atender</Button>}
                              {r.status === 'open' && <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setReqStatus(r.id, 'rejected')}>Rejeitar</Button>}
                              {r.status !== 'open' && <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setReqStatus(r.id, 'open')}>Reabrir</Button>}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
      </Card>
    </>
  )
}
