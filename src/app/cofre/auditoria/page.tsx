'use client'

// Auditoria do Cofre — quem viu/copiou/alterou o quê e quando.
// O log NUNCA contém conteúdo: só metadados (ação, item_name, ip, user agent).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Search } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, TextInput } from '@/components/ds'
import { api } from '@/lib/api'

interface LogRow {
  id: number
  action: string
  item_name: string | null
  created_at: string
  user: { id: number; name: string } | null
  vault: { id: number; name: string } | null
  meta: { ip?: string; user_agent?: string; target_user_id?: number } | null
}

interface Paginated { data: LogRow[]; current_page: number; last_page: number; total: number }

const ACTION_LABEL: Record<string, { label: string; variant: string }> = {
  profile_setup:          { label: 'Setup do perfil', variant: 'default' },
  unlock_success:         { label: 'Unlock', variant: 'success' },
  unlock_failed:          { label: 'Unlock FALHOU', variant: 'danger' },
  recovery_used:          { label: 'Recovery usada', variant: 'warning' },
  master_password_change: { label: 'Troca de master password', variant: 'warning' },
  vault_create:           { label: 'Cofre criado', variant: 'default' },
  vault_update:           { label: 'Cofre renomeado', variant: 'default' },
  vault_delete:           { label: 'Cofre excluído', variant: 'danger' },
  member_add:             { label: 'Membro adicionado', variant: 'default' },
  member_remove:          { label: 'Membro removido', variant: 'warning' },
  key_rotate:             { label: 'Chave rotacionada', variant: 'success' },
  item_create:            { label: 'Item criado', variant: 'default' },
  item_update:            { label: 'Item editado', variant: 'default' },
  item_delete:            { label: 'Item excluído', variant: 'danger' },
  item_restore:           { label: 'Item restaurado', variant: 'default' },
  item_reveal:            { label: 'Senha revelada', variant: 'warning' },
  item_copy:              { label: 'Copiado', variant: 'warning' },
}

export default function CofreAuditoriaPage() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (action) params.set('action', action)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await api.get<Paginated>(`/vault/logs?${params.toString()}`)
      setRows(res.data)
      setLastPage(res.last_page)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, action, from, to])

  useEffect(() => { void load() }, [load])

  return (
    <AppLayout>
      <PageHeader
        icon={FileText}
        title="Auditoria do Cofre"
        subtitle={`${total} evento(s)`}
        actions={<Link href="/cofre"><Button icon={ArrowLeft}>Voltar ao cofre</Button></Link>}
      />

      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Ação</label>
          <select className="ds-input" value={action} onChange={e => { setPage(1); setAction(e.target.value) }}>
            <option value="">Todas</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <TextInput label="De" type="date" value={from} onChange={e => { setPage(1); setFrom(e.target.value) }} />
        <TextInput label="Até" type="date" value={to} onChange={e => { setPage(1); setTo(e.target.value) }} />
        <Button icon={Search} onClick={() => void load()}>Filtrar</Button>
      </div>

      <Card padding="none" className="overflow-x-auto">
        {loading ? (
          <div className="p-6"><Skeleton className="h-40" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6"><EmptyState icon={FileText} title="Sem eventos" description="Nenhum registro para os filtros escolhidos." /></div>
        ) : (
          <table className="ds-table w-full">
            <thead>
              <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Cofre</th><th>Item</th><th>IP</th></tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const a = ACTION_LABEL[r.action] ?? { label: r.action, variant: 'default' }
                return (
                  <tr key={r.id}>
                    <td className="text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {new Date(r.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{r.user?.name ?? '—'}</td>
                    <td><Badge variant={a.variant}>{a.label}</Badge></td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{r.vault?.name ?? '—'}</td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{r.item_name ?? '—'}</td>
                    <td className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{r.meta?.ip ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{page} / {lastPage}</span>
          <Button size="sm" disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      )}
    </AppLayout>
  )
}
