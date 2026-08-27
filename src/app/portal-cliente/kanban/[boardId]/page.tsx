'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { ArrowLeft, Plus, Trash2, X, Tag, MessageSquare, CheckSquare, Calendar, AlertTriangle, SlidersHorizontal, LayoutGrid, List, Filter, Download, Search, BarChart3, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import { ApiError } from '@/lib/api'
import { kanbanApi, PRIORITY_META, type KBoardFull, type KColumn, type KCardSummary, type KUserRef, type KLabel, type KField, type KReport } from '@/lib/client-kanban'
import { KanbanCardModal } from '@/components/kanban/kanban-card-modal'
import { KanbanFieldsManager } from '@/components/kanban/kanban-fields-manager'

const COLUMN_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export default function ClientKanbanBoardPage() {
  const params = useParams()
  const boardId = Number(params?.boardId)
  const [board, setBoard] = useState<KBoardFull | null>(null)
  const [users, setUsers] = useState<KUserRef[]>([])
  const [loading, setLoading] = useState(true)
  const [openCardId, setOpenCardId] = useState<number | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [addingCardCol, setAddingCardCol] = useState<number | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  // Fase 3: view lista/kanban, busca e filtros
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [search, setSearch] = useState('')
  const [fResp, setFResp] = useState('')
  const [fPrio, setFPrio] = useState('')
  const [fLabel, setFLabel] = useState('')
  const [fCol, setFCol] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const hasFilters = !!(search || fResp || fPrio || fLabel || fCol || dueFrom || dueTo)
  function matchCard(c: KCardSummary): boolean {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (!c.title.toLowerCase().includes(q) && !(c.responsible?.name?.toLowerCase().includes(q))) return false
    }
    if (fResp && String(c.responsible?.id ?? '') !== fResp) return false
    if (fPrio && (c.priority ?? '') !== fPrio) return false
    if (fLabel && !c.labels.some(l => String(l.id) === fLabel)) return false
    if (fCol && String(c.column_id) !== fCol) return false
    if (dueFrom && (!c.due_date || c.due_date < dueFrom)) return false
    if (dueTo && (!c.due_date || c.due_date > dueTo)) return false
    return true
  }
  function clearFilters() { setSearch(''); setFResp(''); setFPrio(''); setFLabel(''); setFCol(''); setDueFrom(''); setDueTo('') }

  // Responsáveis presentes nos cards (pro filtro)
  const respOptions = useMemo(() => {
    const m = new Map<number, string>()
    board?.columns.forEach(c => c.cards.forEach(cd => { if (cd.responsible) m.set(cd.responsible.id, cd.responsible.name) }))
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [board])

  function exportExcel() {
    if (!board) return
    const colName = new Map(board.columns.map(c => [c.id, c.name]))
    const rows: Record<string, string>[] = []
    board.columns.forEach(col => col.cards.filter(matchCard).forEach(card => {
      const row: Record<string, string> = {
        'Título': card.title,
        'Coluna': colName.get(card.column_id) ?? '',
        'Responsável': card.responsible?.name ?? '',
        'Prioridade': card.priority ? (PRIORITY_META[card.priority]?.label ?? card.priority) : '',
        'Etiquetas': card.labels.map(l => l.name).join(', '),
        'Início': card.start_date ?? '',
        'Vencimento': card.due_date ?? '',
        'Checklist': card.checklist_total ? `${card.checklist_done}/${card.checklist_total}` : '',
      }
      board.fields.forEach(f => { row[f.name] = fmtFieldValue(f, card.field_values?.[String(f.id)]) })
      rows.push(row)
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kanban')
    XLSX.writeFile(wb, `${(board.name || 'kanban').replace(/[^\w-]+/g, '_')}.xlsx`)
  }

  function load() {
    setLoading(true)
    kanbanApi.board(boardId).then(setBoard).catch(() => toast.error('Erro ao carregar o quadro')).finally(() => setLoading(false))
  }
  useEffect(() => { if (boardId) { load(); kanbanApi.assignableUsers().then(r => setUsers(r.items ?? [])).catch(() => {}) } }, [boardId])

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination || !board) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    const cardId = Number(draggableId)
    const destColId = Number(destination.droppableId)

    // Otimista: reordena localmente.
    setBoard(prev => {
      if (!prev) return prev
      const cols = prev.columns.map(c => ({ ...c, cards: [...c.cards] }))
      const src = cols.find(c => c.id === Number(source.droppableId))!
      const dst = cols.find(c => c.id === destColId)!
      const [moved] = src.cards.splice(source.index, 1)
      moved.column_id = destColId
      dst.cards.splice(destination.index, 0, moved)
      return { ...prev, columns: cols }
    })
    try { await kanbanApi.moveCard(cardId, destColId, destination.index) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao mover'); load() }
  }

  async function addColumn() {
    const name = newColName.trim(); if (!name) return
    try {
      await kanbanApi.addColumn(boardId, { name, color: COLUMN_COLORS[(board?.columns.length ?? 0) % COLUMN_COLORS.length] })
      setNewColName(''); setAddingColumn(false); load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function delColumn(id: number) {
    if (!confirm('Excluir esta coluna e seus cards?')) return
    try { await kanbanApi.deleteColumn(id); load() } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function renameColumn(col: KColumn) {
    const name = prompt('Nome da coluna:', col.name)?.trim()
    if (!name || name === col.name) return
    try { await kanbanApi.updateColumn(col.id, { name }); load() } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function addCard(colId: number) {
    const title = newCardTitle.trim(); if (!title) { setAddingCardCol(null); return }
    try { await kanbanApi.addCard(colId, { title }); setNewCardTitle(''); setAddingCardCol(null); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }

  return (
    <AppLayout title={board?.name ?? 'Kanban'}>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--env-banner-h, 0px) - 56px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Link href="/portal-cliente/kanban" style={{ color: 'var(--text-muted)', display: 'inline-flex' }}><ArrowLeft size={18} /></Link>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: board?.color ?? 'var(--primary)', flexShrink: 0 }} />
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board?.name ?? '…'}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setReportOpen(true)} className="ds-btn-ghost" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} /> Relatório</button>
            <button onClick={() => setMembersOpen(true)} className="ds-btn-ghost" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} /> Membros</button>
            <button onClick={() => setFieldsOpen(true)} className="ds-btn-ghost" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><SlidersHorizontal size={14} /> Campos</button>
            <button onClick={() => setLabelsOpen(true)} className="ds-btn-ghost" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Tag size={14} /> Etiquetas</button>
            <button onClick={() => setAddingColumn(true)} className="ds-btn-secondary" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Nova coluna</button>
          </div>
        </div>

        {loading || !board ? (
          <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>
        ) : (
          <>
          {/* Toolbar: view · busca · filtros · export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setView('kanban')} title="Kanban" style={{ ...toggleBtn, background: view === 'kanban' ? 'var(--primary)' : 'transparent', color: view === 'kanban' ? '#fff' : 'var(--text-muted)' }}><LayoutGrid size={15} /></button>
              <button onClick={() => setView('list')} title="Lista" style={{ ...toggleBtn, background: view === 'list' ? 'var(--primary)' : 'transparent', color: view === 'list' ? '#fff' : 'var(--text-muted)' }}><List size={15} /></button>
            </div>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input className="ds-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título ou responsável…" style={{ width: '100%', fontSize: 13, padding: '7px 8px 7px 30px' }} />
            </div>
            <button onClick={() => setShowFilters(s => !s)} className="ds-btn-ghost" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, color: hasFilters ? 'var(--primary)' : undefined }}><Filter size={14} /> Filtros{hasFilters ? ' •' : ''}</button>
            <button onClick={exportExcel} className="ds-btn-ghost" style={{ fontSize: 12.5, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Excel</button>
          </div>
          {showFilters && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <select className="ds-input" value={fCol} onChange={e => setFCol(e.target.value)} style={fsel}><option value="">Todas colunas</option>{board.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select className="ds-input" value={fResp} onChange={e => setFResp(e.target.value)} style={fsel}><option value="">Todos responsáveis</option>{respOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <select className="ds-input" value={fPrio} onChange={e => setFPrio(e.target.value)} style={fsel}><option value="">Toda prioridade</option>{Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
              <select className="ds-input" value={fLabel} onChange={e => setFLabel(e.target.value)} style={fsel}><option value="">Toda etiqueta</option>{board.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vencimento:</span>
              <input type="date" className="ds-input" value={dueFrom} onChange={e => setDueFrom(e.target.value)} style={fsel} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>a</span>
              <input type="date" className="ds-input" value={dueTo} onChange={e => setDueTo(e.target.value)} style={fsel} />
              {hasFilters && <button onClick={clearFilters} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }}>Limpar</button>}
            </div>
          )}

          {view === 'list' ? (
            <KanbanListView board={board} match={matchCard} onOpen={setOpenCardId} />
          ) : (
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
            <DragDropContext onDragEnd={onDragEnd}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', height: '100%', paddingBottom: 8 }}>
                {board.columns.map(col => (
                  <div key={col.id} style={{ width: 288, flexShrink: 0, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color ?? 'var(--text-light)', flexShrink: 0 }} />
                      <button onClick={() => renameColumn(col)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</button>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--field)', borderRadius: 10, padding: '1px 7px' }}>{hasFilters ? `${col.cards.filter(matchCard).length}/${col.cards.length}` : col.cards.length}</span>
                      <button onClick={() => delColumn(col.id)} title="Excluir coluna" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 2, display: 'inline-flex' }}><Trash2 size={13} /></button>
                    </div>
                    <Droppable droppableId={String(col.id)}>
                      {(prov, snap) => (
                        <div ref={prov.innerRef} {...prov.droppableProps} style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, background: snap.isDraggingOver ? 'var(--surface-hover)' : 'transparent', minHeight: 40 }}>
                          {col.cards.filter(matchCard).map((card, idx) => (
                            <Draggable key={card.id} draggableId={String(card.id)} index={idx} isDragDisabled={hasFilters}>
                              {(dp, ds) => (
                                <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} onClick={() => setOpenCardId(card.id)} style={{ ...dp.draggableProps.style, ...cardStyle(ds.isDragging) }}>
                                  <CardFace card={card} fields={board.fields} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {prov.placeholder}
                          {addingCardCol === col.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <textarea autoFocus className="ds-input" value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(col.id) } if (e.key === 'Escape') setAddingCardCol(null) }} placeholder="Título do card…" rows={2} style={{ fontSize: 13, padding: 8, resize: 'none', fontFamily: 'inherit' }} />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => addCard(col.id)} className="ds-btn-primary" style={{ fontSize: 12, padding: '5px 10px' }}>Adicionar</button>
                                <button onClick={() => { setAddingCardCol(null); setNewCardTitle('') }} className="ds-btn-ghost" style={{ fontSize: 12, padding: '5px 8px' }}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setAddingCardCol(col.id); setNewCardTitle('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12.5, padding: '6px 4px', textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Adicionar card</button>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}

                {addingColumn && (
                  <div style={{ width: 288, flexShrink: 0, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 10 }}>
                    <input autoFocus className="ds-input" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') setAddingColumn(false) }} placeholder="Nome da coluna…" style={{ width: '100%', fontSize: 13, padding: '8px 10px', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={addColumn} className="ds-btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>Criar</button>
                      <button onClick={() => setAddingColumn(false)} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 8px' }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            </DragDropContext>
          </div>
          )}
          </>
        )}
      </div>

      {openCardId && board && (
        <KanbanCardModal cardId={openCardId} boardLabels={board.labels} fields={board.fields} users={users} onClose={() => setOpenCardId(null)} onSaved={load} />
      )}
      {labelsOpen && board && (
        <LabelsManager boardId={boardId} labels={board.labels} onClose={() => setLabelsOpen(false)} onChanged={load} />
      )}
      {fieldsOpen && board && (
        <KanbanFieldsManager boardId={boardId} fields={board.fields} onClose={() => setFieldsOpen(false)} onChanged={load} />
      )}
      {membersOpen && board && (
        <BoardMembersManager boardId={boardId} users={users} onClose={() => setMembersOpen(false)} />
      )}
      {reportOpen && board && (
        <ReportModal boardId={boardId} onClose={() => setReportOpen(false)} />
      )}
    </AppLayout>
  )
}

function KanbanListView({ board, match, onOpen }: { board: KBoardFull; match: (c: KCardSummary) => boolean; onOpen: (id: number) => void }) {
  const rows = board.columns.flatMap(col => col.cards.filter(match).map(card => ({ card, colName: col.name, colColor: col.color })))
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>Nenhum card encontrado.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
              <th style={th}>Título</th><th style={th}>Coluna</th><th style={th}>Responsável</th><th style={th}>Prioridade</th><th style={th}>Etiquetas</th><th style={th}>Vencimento</th><th style={th}>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ card, colName, colColor }) => {
              const overdue = card.due_date && new Date(card.due_date + 'T23:59:59') < new Date()
              return (
                <tr key={card.id} onClick={() => onOpen(card.id)} className="ds-row-hover" style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 500, color: 'var(--text)' }}>{card.title}</td>
                  <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: colColor ?? 'var(--text-light)' }} />{colName}</span></td>
                  <td style={td}>{card.responsible?.name ?? '—'}</td>
                  <td style={td}>{card.priority ? <span style={{ color: PRIORITY_META[card.priority]?.color }}>{PRIORITY_META[card.priority]?.label}</span> : '—'}</td>
                  <td style={td}>{card.labels.length ? <span style={{ display: 'inline-flex', gap: 3 }}>{card.labels.map(l => <span key={l.id} title={l.name} style={{ width: 22, height: 6, borderRadius: 3, background: l.color ?? 'var(--primary)' }} />)}</span> : '—'}</td>
                  <td style={{ ...td, color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>{card.due_date ? card.due_date.slice(8, 10) + '/' + card.due_date.slice(5, 7) + '/' + card.due_date.slice(0, 4) : '—'}</td>
                  <td style={td}>{card.checklist_total ? `${card.checklist_done}/${card.checklist_total}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CardFace({ card, fields }: { card: KCardSummary; fields: KField[] }) {
  const overdue = card.due_date && new Date(card.due_date + 'T23:59:59') < new Date()
  const frontFields = fields.filter(f => f.show_on_front).map(f => ({ f, v: fmtFieldValue(f, card.field_values?.[String(f.id)]) })).filter(x => x.v)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {card.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {card.labels.map(l => <span key={l.id} style={{ height: 6, width: 28, borderRadius: 4, background: l.color ?? 'var(--primary)' }} title={l.name} />)}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{card.title}</div>
      {frontFields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {frontFields.map(({ f, v }) => (
            <div key={f.id} style={{ fontSize: 11, color: 'var(--text-muted)' }}><span style={{ fontWeight: 600 }}>{f.name}:</span> {v}</div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
        {card.priority && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: PRIORITY_META[card.priority]?.color }}>● {PRIORITY_META[card.priority]?.label}</span>}
        {card.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>{overdue ? <AlertTriangle size={11} /> : <Calendar size={11} />}{fmtDDMM(card.due_date)}</span>}
        {card.checklist_total > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><CheckSquare size={11} />{card.checklist_done}/{card.checklist_total}</span>}
        {card.comments_count > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MessageSquare size={11} />{card.comments_count}</span>}
      </div>
      {card.responsible && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{card.responsible.name}</div>}
    </div>
  )
}

function LabelsManager({ boardId, labels, onClose, onChanged }: { boardId: number; labels: KLabel[]; onClose: () => void; onChanged: () => void }) {
  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  async function add() {
    if (!name.trim()) return
    try { await kanbanApi.addLabel(boardId, { name: name.trim(), color }); setName(''); onChanged() } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function del(id: number) { try { await kanbanApi.deleteLabel(id); onChanged() } catch { /* ignore */ } }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Etiquetas do quadro</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {labels.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Nenhuma etiqueta ainda.</span>}
          {labels.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 28, height: 14, borderRadius: 4, background: l.color ?? 'var(--primary)' }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{l.name}</span>
              <button onClick={() => del(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="ds-input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Nova etiqueta…" style={{ flex: 1, fontSize: 13, padding: '7px 10px' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {COLORS.slice(0, 5).map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />)}
          </div>
          <button onClick={add} className="ds-btn-primary" style={{ fontSize: 12, padding: '7px 12px' }}>Add</button>
        </div>
      </div>
    </div>
  )
}

function BoardMembersManager({ boardId, users, onClose }: { boardId: number; users: KUserRef[]; onClose: () => void }) {
  const [sel, setSel] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { kanbanApi.boardMembers(boardId).then(r => setSel(r.user_ids ?? [])).catch(() => {}).finally(() => setLoading(false)) }, [boardId])
  function toggle(id: number) { setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  async function save() {
    setSaving(true)
    try { await kanbanApi.setBoardMembers(boardId, sel); toast.success('Acesso atualizado'); onClose() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') } finally { setSaving(false) }
  }
  return (
    <div onClick={onClose} style={mOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...mBox, maxWidth: 440 }}>
        <div style={mHead}><h3 style={mTitle}>Acesso ao quadro</h3><button onClick={onClose} style={mX}><X size={18} /></button></div>
        <div style={{ padding: 18, overflowY: 'auto' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>Selecione quem pode ver e usar este quadro. <b>Sem ninguém marcado, todos os usuários da sua empresa têm acesso.</b></p>
          {loading ? <span style={{ color: 'var(--text-muted)' }}>Carregando…</span> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {users.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '4px 0' }}>
                  <input type="checkbox" checked={sel.includes(u.id)} onChange={() => toggle(u.id)} /> {u.name}
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={onClose} className="ds-btn-ghost" style={{ fontSize: 13, padding: '8px 14px' }}>Cancelar</button>
            <button onClick={save} disabled={saving} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>{saving ? 'Salvando…' : 'Salvar acesso'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportModal({ boardId, onClose }: { boardId: number; onClose: () => void }) {
  const [rep, setRep] = useState<KReport | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { kanbanApi.report(boardId).then(setRep).catch(() => toast.error('Erro ao carregar relatório')).finally(() => setLoading(false)) }, [boardId])
  const colName = new Map((rep?.by_column ?? []).map(c => [c.column_id, c.name]))
  return (
    <div onClick={onClose} style={mOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...mBox, maxWidth: 560 }}>
        <div style={mHead}><h3 style={mTitle}>Relatório do quadro</h3><button onClick={onClose} style={mX}><X size={18} /></button></div>
        <div style={{ padding: 18, overflowY: 'auto' }}>
          {loading || !rep ? <span style={{ color: 'var(--text-muted)' }}>Carregando…</span> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <Kpi label="Cards" value={rep.totals.cards} />
                <Kpi label="Em aberto" value={rep.totals.open} />
                <Kpi label="Concluídos" value={rep.totals.done} tone="var(--success)" />
                <Kpi label="Atrasados" value={rep.totals.overdue} tone={rep.totals.overdue ? 'var(--danger)' : undefined} />
              </div>
              <RepSection title="Cards por coluna">
                {rep.by_column.map(c => (
                  <div key={c.column_id} style={repRow}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color ?? 'var(--text-light)' }} />{c.name}</span><b>{c.count}</b></div>
                ))}
              </RepSection>
              <RepSection title="Por responsável">
                {rep.by_responsible.length === 0 ? <span style={repEmpty}>—</span> : rep.by_responsible.map(r => (
                  <div key={r.user_id} style={repRow}><span>{r.name}</span><b>{r.count}</b></div>
                ))}
              </RepSection>
              <RepSection title="Tempo médio por coluna">
                {rep.avg_days_per_column.length === 0 ? <span style={repEmpty}>Sem movimentações suficientes ainda.</span> : rep.avg_days_per_column.map(a => (
                  <div key={a.column_id} style={repRow}><span>{colName.get(a.column_id) ?? `Coluna ${a.column_id}`}</span><b>{a.avg_days} {a.avg_days === 1 ? 'dia' : 'dias'}</b></div>
                ))}
              </RepSection>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: tone ?? 'var(--text)' }}>{value}</div><div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div></div>
}
function RepSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div></div>
}

const mOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const mBox: React.CSSProperties = { width: '100%', maxHeight: '88vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const mHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }
const mTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }
const mX: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }
const repRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)' }
const repEmpty: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)' }
const fmtDDMM = (s: string) => { const [, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}` }
function fmtFieldValue(f: KField, raw: string | null | undefined): string {
  if (raw == null || raw === '') return ''
  switch (f.type) {
    case 'multiselect': { try { const a = JSON.parse(raw); return Array.isArray(a) ? a.join(', ') : '' } catch { return '' } }
    case 'checkbox': return raw === '1' ? 'Sim' : ''
    case 'money': { const n = Number(raw); return isNaN(n) ? raw : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
    case 'date': return raw.length >= 10 ? fmtDDMM(raw) : raw
    case 'link_user': return ''
    default: return raw
  }
}
function cardStyle(dragging: boolean): React.CSSProperties {
  return { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', boxShadow: dragging ? '0 8px 20px rgba(0,0,0,.18)' : 'none' }
}
const toggleBtn: React.CSSProperties = { border: 'none', cursor: 'pointer', padding: '7px 12px', display: 'inline-flex', alignItems: 'center' }
const fsel: React.CSSProperties = { fontSize: 12.5, padding: '6px 8px' }
const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 12px', color: 'var(--text-muted)', verticalAlign: 'middle' }
