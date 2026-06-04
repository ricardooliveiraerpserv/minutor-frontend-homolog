'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { CheckSquare, FolderOpen, Info } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Executive { id: number; name: string }

interface ProjectRow {
  id: number
  name: string
  code: string
  status: string
  base_hours: number
  contribution_hours: number
  sold_hours: number
  start_date: string | null
  in_month: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(1) }

// ─── Components ──────────────────────────────────────────────────────────────

function NoTrackingNotice() {
  return (
    <div className="flex items-start gap-3 px-5 py-4 rounded-2xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.20)' }}>
      <Info size={16} color="#8B5CF6" className="shrink-0 mt-0.5" />
      <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
        Projetos com contrato <strong style={{ color: 'var(--brand-text)' }}>Fechado</strong> não possuem controle de saldo ou consumo de horas.<br />
        O acompanhamento é feito apenas pelo valor total contratado e seus aportes.
      </p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FechadoPage() {
  const { user } = useAuth()
  const isAdmin   = user?.type === 'admin'
  const isCliente = user?.type === 'cliente'

  const now = new Date()
  const [customers,   setCustomers]   = useState<Customer[]>([])
  const [executives,  setExecutives]  = useState<Executive[]>([])
  const [selectedCustomer,  setSelectedCustomer]  = useState<number | ''>('')
  const [selectedExecutive, setSelectedExecutive] = useState<number | ''>('')
  // Fechado é atemporal (sem controle de saldo/consumo) → sem filtro de data.
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<number | ''>('')

  const [projectRows,     setProjectRows]     = useState<ProjectRow[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  // Load customers & executives (admin only)
  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=100&has_contract_type_name=Fechado')
      .then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=100')
      .then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams()
    if (selectedCustomer)                    p.set('customer_id',  String(selectedCustomer))
    else if (isCliente && user?.customer_id) p.set('customer_id',  String(user.customer_id))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    return p
  }, [selectedCustomer, selectedExecutive, isCliente, user?.customer_id])

  const fetchProjects = useCallback(() => {
    if (!user) return
    setLoadingProjects(true)
    api.get<any>(`/dashboards/fechado/projects?${buildParams()}`)
      .then(r => setProjectRows(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectRows([]))
      .finally(() => setLoadingProjects(false))
  }, [buildParams, user])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Filtro de projeto (client-side sobre a lista já carregada).
  const displayedRows = selectedProjectFilter
    ? projectRows.filter(r => r.id === selectedProjectFilter)
    : projectRows

  return (
    <AppLayout title="Dashboard — Fechado">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.10)' }}>
            <CheckSquare size={16} color="#8B5CF6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>Fechado</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>Projetos com contrato fechado — horas vendidas por projeto e período de início</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-5 rounded-2xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {isAdmin && (
            <SearchSelect
              label="Executivo"
              value={String(selectedExecutive)}
              onChange={v => { setSelectedExecutive(v === '' ? '' : Number(v)); setSelectedCustomer('') }}
              options={executives}
              placeholder="Todos os executivos"
              wide
            />
          )}
          {isAdmin && (
            <SearchSelect
              label="Cliente"
              value={String(selectedCustomer)}
              onChange={v => { setSelectedCustomer(v === '' ? '' : Number(v)); setSelectedExecutive('') }}
              options={customers}
              placeholder="Todos os clientes"
              wide
            />
          )}
          <SearchSelect
            label="Projeto"
            value={String(selectedProjectFilter)}
            onChange={v => setSelectedProjectFilter(v === '' ? '' : Number(v))}
            options={projectRows.map(p => ({ id: p.id, name: `${p.code} — ${p.name}` }))}
            placeholder="Todos os projetos"
            wide
          />
        </div>

        <NoTrackingNotice />

        {/* Projetos fechados — sempre visível (sem seleção de projeto). */}
        <div className="rounded-2xl overflow-x-auto" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {loadingProjects ? (
            <div className="p-10 text-center">
              <div className="animate-pulse h-4 w-32 mx-auto rounded" style={{ background: 'var(--brand-border)' }} />
            </div>
          ) : displayedRows.length === 0 ? (
            <div className="p-10 text-center">
              <FolderOpen size={32} className="mx-auto mb-3" style={{ color: 'var(--brand-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto fechado encontrado.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                  {['Código', 'Projeto', 'Status', 'Horas Base', 'Aportes', 'Total', 'Início'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: idx < displayedRows.length - 1 ? '1px solid var(--brand-border)' : undefined }}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--brand-muted)' }}>{row.code}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--brand-text)' }}>{row.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{
                        background: row.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                        color: row.status === 'active' ? '#10B981' : 'var(--brand-muted)',
                      }}>
                        {row.status === 'active' ? 'Ativo' : row.status === 'closed' ? 'Encerrado' : row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtH(row.base_hours)} h</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: '#8B5CF6' }}>{fmtH(row.contribution_hours)} h</td>
                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#00F5FF' }}>{fmtH(row.sold_hours)} h</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                      {row.start_date ? new Date(row.start_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </AppLayout>
  )
}
