'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { RefreshCw, Save, Upload, Plus, Trash2, EyeOff, RotateCcw, Users, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Th, Tr, Td, Button, SkeletonTable, EmptyState } from '@/components/ds'

// ─── Tipos ──────────────────────────────────────────────────────────────────
// Folha da BIZIFY: lançamentos manuais (avulsos). Identidade (matrícula/nome/
// operação) é da própria linha. Colunas próprias: Produção, Variável, Aj Custo,
// Reemb, Adto (créditos) / Descontos, Adiantamento (débitos). Totais calculados.
interface BizRow {
  row_key: string
  socio_key: string | null // matrícula (chave de merge) — null em linha nova não salva
  carried?: boolean // veio do mês anterior (prefill, ainda não salvo neste mês)
  cancelado: boolean
  matricula: string
  nome: string
  status: string // Operação
  producao: number
  variavel: number
  aj_custo: number
  reemb: number
  adto: number
  descontos: number
  adiantamento: number
  // Linha de diretor: valor vem do Fechamento Diretoria + cadastro. Read-only (não edita/salva).
  from_diretoria?: boolean
  user_id?: number | null
}
type BizEdit = Omit<BizRow, 'row_key' | 'socio_key' | 'cancelado'>

const cellInputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
}
const cellInputClass = 'w-24 rounded-md px-2 py-1 text-xs text-right tabular-nums ds-input focus:outline-none'
const cellInputClassText = 'w-40 rounded-md px-2 py-1 text-xs ds-input focus:outline-none'
const stickyTh = 'sticky top-0 z-20 bg-[var(--surface)]'

// Máscara pt-BR 0.000,00 (centavos; type=text → sem spinner).
function MaskedNum({ value, onChange, className, style }: {
  value: number
  onChange: (v: number) => void
  className?: string
  style?: React.CSSProperties
}) {
  const display = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits ? parseInt(digits, 10) / 100 : 0)
      }}
      onFocus={e => e.target.select()}
      className={className}
      style={style}
    />
  )
}

function fmtYearMonth(ym: string): string {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[Number(m) - 1] ?? m}/${y}`
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function BizifyFolha({ yearMonth, setYearMonth }: { yearMonth: string; setYearMonth: (v: string) => void }) {
  const [rows, setRows] = useState<BizRow[]>([])
  const [edits, setEdits] = useState<Record<string, BizEdit>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [tab, setTab] = useState<'ativos' | 'canceladas'>('ativos')
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!yearMonth) return
    setLoading(true)
    setRows([])
    setEdits({})
    try {
      const res = await api.get<{ data: BizRow[] }>(`/fechamento-folha/${yearMonth}?empresa=bizify`)
      const data = res.data ?? []
      setRows(data)
      const seed: Record<string, BizEdit> = {}
      for (const r of data) {
        seed[r.row_key] = {
          matricula: r.matricula, nome: r.nome, status: r.status,
          producao: r.producao, variavel: r.variavel, aj_custo: r.aj_custo,
          reemb: r.reemb, adto: r.adto, descontos: r.descontos, adiantamento: r.adiantamento,
        }
      }
      setEdits(seed)
    } catch (err: unknown) {
      toast.error(`Erro ao carregar a folha Bizify: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => { load() }, [load])

  function setEdit<K extends keyof BizEdit>(rowKey: string, key: K, value: BizEdit[K]) {
    setEdits(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], [key]: value } }))
  }

  // Créditos/Débitos/Líquido calculados a partir do estado editável.
  function totals(e: BizEdit) {
    const cred = (e.producao || 0) + (e.variavel || 0) + (e.aj_custo || 0) + (e.reemb || 0) + (e.adto || 0)
    const deb = (e.descontos || 0) + (e.adiantamento || 0)
    return { cred, deb, liq: cred - deb }
  }

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(r => r.cancelado === (tab === 'canceladas'))
    // Diretoria (roxo, read-only) no topo; demais mantêm a ordem atual.
    const diretoria = filtered.filter(r => r.from_diretoria)
    const outros = filtered.filter(r => !r.from_diretoria)
    return [...diretoria, ...outros]
  }, [rows, tab])
  const ativosCount = useMemo(() => rows.filter(r => !r.cancelado).length, [rows])
  const canceladasCount = useMemo(() => rows.filter(r => r.cancelado).length, [rows])

  const grand = useMemo(() => {
    let cred = 0, deb = 0, liq = 0
    for (const r of visibleRows) {
      const t = totals(edits[r.row_key] ?? (r as unknown as BizEdit))
      cred += t.cred; deb += t.deb; liq += t.liq
    }
    return { cred, deb, liq }
  }, [visibleRows, edits])

  function addManualRow() {
    const key = `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const empty: BizEdit = {
      matricula: '', nome: '', status: 'Contratado',
      producao: 0, variavel: 0, aj_custo: 0, reemb: 0, adto: 0, descontos: 0, adiantamento: 0,
    }
    setRows(prev => [{ row_key: key, socio_key: null, cancelado: false, ...empty }, ...prev])
    setEdits(prev => ({ ...prev, [key]: empty }))
  }

  async function removeManualRow(r: BizRow) {
    // Linha nova (não salva) → remove só localmente.
    if (!r.socio_key) {
      setRows(prev => prev.filter(x => x.row_key !== r.row_key))
      return
    }
    setRemovingKey(r.row_key)
    try {
      await api.delete(`/fechamento-folha/${yearMonth}/manual/${encodeURIComponent(r.socio_key)}?empresa=bizify`)
      setRows(prev => prev.filter(x => x.row_key !== r.row_key))
      toast.success('Linha removida.')
    } catch (err: unknown) {
      toast.error(`Erro ao remover: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setRemovingKey(null)
    }
  }

  async function setCancelado(r: BizRow, cancelado: boolean) {
    if (!r.socio_key) { toast.error('Salve a linha antes de ocultar.'); return }
    setTogglingKey(r.row_key)
    try {
      await api.post(`/fechamento-folha/${yearMonth}/cancel`, { empresa: 'bizify', socio_key: r.socio_key, cancelado })
      setRows(prev => prev.map(x => x.row_key === r.row_key ? { ...x, cancelado } : x))
    } catch (err: unknown) {
      toast.error(`Erro ao ${cancelado ? 'ocultar' : 'reativar'}: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setTogglingKey(null)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const entries: Array<Record<string, unknown>> = []
      let skipped = 0
      for (const r of rows) {
        if (r.from_diretoria) continue // linha de diretor é read-only (vem do Fechamento Diretoria)
        const e = edits[r.row_key]
        if (!e) continue
        const mat = (e.matricula ?? '').trim()
        if (mat === '') { skipped++; continue } // matrícula é a chave de merge
        entries.push({
          socio_key: mat,
          matricula: mat,
          nome: e.nome ?? '',
          status: e.status ?? '',
          producao: e.producao ?? 0,
          variavel: e.variavel ?? 0,
          aj_custo: e.aj_custo ?? 0,
          reemb: e.reemb ?? 0,
          adto: e.adto ?? 0,
          descontos_diversos: e.descontos ?? 0,
          adiantamento: e.adiantamento ?? 0,
        })
      }
      await api.post(`/fechamento-folha/${yearMonth}`, { empresa: 'bizify', entries })
      if (skipped > 0) toast.warning(`${skipped} linha(s) sem matrícula não foram salvas.`)
      toast.success('Folha Bizify salva.')
      await load()
    } catch (err: unknown) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSaving(false)
    }
  }

  async function exportXls() {
    if (!yearMonth) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/v1/fechamento-folha/${yearMonth}/export?empresa=bizify`,
        { credentials: 'same-origin', headers: { Accept: 'application/vnd.ms-excel' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const filename = match ? decodeURIComponent(match[1]) : `Folha_Bizify_${yearMonth}.xls`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      toast.error(`Erro ao gerar a planilha: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setExporting(false)
    }
  }

  async function onPickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (ev.target) ev.target.value = '' // permite re-selecionar o mesmo arquivo
    if (!file) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<{ imported: number }>(`/fechamento-folha/${yearMonth}/import-bizify`, fd)
      toast.success(`${res.imported} lançamento(s) importado(s) (mesclado por matrícula).`)
      await load()
    } catch (err: unknown) {
      toast.error(`Erro ao importar: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileSpreadsheet}
        title="Folha — Bizify"
        subtitle={`Lançamentos manuais — ${fmtYearMonth(yearMonth)}`}
        actions={
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={yearMonth}
              onChange={e => setYearMonth(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={onPickFile} />
            <Button size="sm" variant="secondary" icon={Upload} loading={importing} disabled={importing}
              onClick={() => fileRef.current?.click()}>
              {importing ? 'Importando…' : 'Importar planilha'}
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} onClick={addManualRow}>Nova linha</Button>
            <Button size="sm" variant="secondary" onClick={load} disabled={loading} icon={RefreshCw} loading={loading}>
              Atualizar
            </Button>
            <Button size="sm" variant="secondary" icon={FileSpreadsheet} loading={exporting}
              disabled={exporting || rows.length === 0} onClick={exportXls}>
              {exporting ? 'Gerando…' : 'Gerar planilha (.xls)'}
            </Button>
            <Button size="sm" variant="primary" icon={Save} loading={saving} disabled={saving || rows.length === 0} onClick={save}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        }
      />

      {/* Abas Ativos / Canceladas */}
      {!loading && (
        <div className="flex gap-1 border-b" role="tablist" style={{ borderColor: 'var(--brand-border)' }}>
          {([
            { key: 'ativos' as const, label: 'Ativos', count: ativosCount },
            { key: 'canceladas' as const, label: 'Canceladas', count: canceladasCount },
          ]).map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                onClick={() => setTab(t.key)}
                className="px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2"
                style={{
                  borderColor: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t.label} <span style={{ color: 'var(--text-light)' }}>({t.count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Cards de totais da folha Bizify */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--ring)' }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total da Folha (Líquido)</p>
            <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--primary)' }}>{formatBRL(grand.liq)}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{visibleRows.length} lançamento{visibleRows.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Créditos</p>
            <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--text)' }}>{formatBRL(grand.cred)}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Débitos</p>
            <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--danger)' }}>{formatBRL(grand.deb)}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>descontos + adiantamentos</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Lançamentos</p>
            <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--text)' }}>{visibleRows.length}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{tab === 'canceladas' ? 'canceladas' : 'ativos'}</p>
          </div>
        </div>
      )}

      {!loading && rows.some(r => r.carried) && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--text)' }}
        >
          <FileSpreadsheet size={15} style={{ color: 'var(--warning)' }} className="shrink-0" />
          Lançamentos carregados do <strong>mês anterior</strong> — ajuste os valores e clique em <strong>Salvar</strong> para gravar este mês. Os meses passados ficam intactos.
        </div>
      )}

      <div className="min-h-[200px]">
        {loading ? (
          <SkeletonTable rows={5} cols={14} />
        ) : visibleRows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={tab === 'canceladas' ? 'Nenhuma linha cancelada' : 'Nenhum lançamento Bizify'}
            description={tab === 'canceladas'
              ? 'Linhas ocultadas neste mês aparecem aqui.'
              : 'Importe a planilha da Bizify ou clique em "Nova linha" para lançar manualmente.'}
          />
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-2xl" style={{ border: '1px solid var(--brand-border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
              <thead>
                <tr>
                  <Th className={stickyTh}>Matrícula</Th>
                  <Th className={stickyTh}>Nome</Th>
                  <Th className={stickyTh}>Operação</Th>
                  <Th right className={stickyTh}>Produção</Th>
                  <Th right className={stickyTh}>Variável</Th>
                  <Th right className={stickyTh}>Aj Custo</Th>
                  <Th right className={stickyTh}>Reemb</Th>
                  <Th right className={stickyTh}>Adto</Th>
                  <Th right className={stickyTh}>Total Créditos</Th>
                  <Th right className={stickyTh}>Descontos</Th>
                  <Th right className={stickyTh}>Adiantamento</Th>
                  <Th right className={stickyTh}>Total Débitos</Th>
                  <Th right className={stickyTh}>Líquido</Th>
                  <Th className={stickyTh}>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => {
                  const e = edits[r.row_key] ?? (r as unknown as BizEdit)
                  const t = totals(e)
                  const busy = togglingKey === r.row_key
                  // Diretor: linha read-only (valor do Fechamento Diretoria + cadastro).
                  const readOnly = !!r.from_diretoria
                  const rowBg = r.cancelado ? 'var(--danger-bg)' : readOnly ? 'rgba(168,85,247,0.13)' : undefined
                  const num = (v: number) => <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatBRL(v)}</span>
                  return (
                    <Tr key={r.row_key} baseBackground={rowBg}
                      className={readOnly ? '[border-left:3px_solid_#a855f7]' : undefined}>
                      <Td mono>
                        {readOnly ? <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{e.matricula || '—'}</span> : (
                          <input type="text" value={e.matricula} onChange={ev => setEdit(r.row_key, 'matricula', ev.target.value)}
                            className={`${cellInputClassText} w-24`} style={cellInputStyle} placeholder="matrícula" />
                        )}
                      </Td>
                      <Td>
                        {readOnly ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text)' }}>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                              style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7' }}
                              title="Diretor — Fechamento Diretoria + cadastro (somente leitura)">Diretoria</span>
                            {e.nome || '—'}
                          </span>
                        ) : (
                          <input type="text" value={e.nome} onChange={ev => setEdit(r.row_key, 'nome', ev.target.value)}
                            className={cellInputClassText} style={cellInputStyle} placeholder="nome" />
                        )}
                      </Td>
                      <Td>
                        {readOnly ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.status || '—'}</span> : (
                          <input type="text" value={e.status} onChange={ev => setEdit(r.row_key, 'status', ev.target.value)}
                            className={`${cellInputClassText} w-28`} style={cellInputStyle} />
                        )}
                      </Td>
                      <Td right>{readOnly ? num(e.producao) : <MaskedNum value={e.producao} onChange={v => setEdit(r.row_key, 'producao', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right>{readOnly ? num(e.variavel) : <MaskedNum value={e.variavel} onChange={v => setEdit(r.row_key, 'variavel', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right>{readOnly ? num(e.aj_custo) : <MaskedNum value={e.aj_custo} onChange={v => setEdit(r.row_key, 'aj_custo', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right>{readOnly ? num(e.reemb) : <MaskedNum value={e.reemb} onChange={v => setEdit(r.row_key, 'reemb', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right>{readOnly ? num(e.adto) : <MaskedNum value={e.adto} onChange={v => setEdit(r.row_key, 'adto', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right mono className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatBRL(t.cred)}</Td>
                      <Td right>{readOnly ? num(e.descontos) : <MaskedNum value={e.descontos} onChange={v => setEdit(r.row_key, 'descontos', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right>{readOnly ? num(e.adiantamento) : <MaskedNum value={e.adiantamento} onChange={v => setEdit(r.row_key, 'adiantamento', v)} className={cellInputClass} style={cellInputStyle} />}</Td>
                      <Td right mono className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatBRL(t.deb)}</Td>
                      <Td right mono className="tabular-nums font-semibold">{formatBRL(t.liq)}</Td>
                      <Td>
                        {readOnly ? (
                          <span className="text-[11px] italic" style={{ color: 'var(--text-light)' }}>somente leitura</span>
                        ) : (
                        <div className="inline-flex items-center gap-1">
                          {r.cancelado ? (
                            <button type="button" onClick={() => setCancelado(r, false)} disabled={busy}
                              title="Reativar linha"
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ds-row-hover"
                              style={{ color: 'var(--success)' }}>
                              <RotateCcw size={14} /> Reativar
                            </button>
                          ) : (
                            <button type="button" onClick={() => setCancelado(r, true)} disabled={busy || !r.socio_key}
                              title={r.socio_key ? 'Ocultar linha' : 'Salve antes de ocultar'}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ds-row-hover"
                              style={{ color: 'var(--text-muted)' }}>
                              <EyeOff size={14} /> Ocultar
                            </button>
                          )}
                          <button type="button" onClick={() => removeManualRow(r)} disabled={removingKey === r.row_key}
                            title="Excluir linha"
                            className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-40 ds-row-hover"
                            style={{ color: 'var(--danger)' }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
              {visibleRows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--brand-border)' }}>
                    <Td className="font-semibold" >Total ({visibleRows.length})</Td>
                    <Td /><Td /><Td /><Td /><Td /><Td /><Td />
                    <Td right mono className="tabular-nums font-semibold">{formatBRL(grand.cred)}</Td>
                    <Td /><Td />
                    <Td right mono className="tabular-nums font-semibold">{formatBRL(grand.deb)}</Td>
                    <Td right mono className="tabular-nums font-semibold">{formatBRL(grand.liq)}</Td>
                    <Td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
