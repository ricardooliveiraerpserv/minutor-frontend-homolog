'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LayoutGrid, Plus, Trash2, Copy, ArrowRight, X } from 'lucide-react'
import { kanbanApi, type KBoardListItem } from '@/lib/client-kanban'
import { ApiError } from '@/lib/api'

const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']

export default function ClientKanbanBoardsPage() {
  const [boards, setBoards] = useState<KBoardListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(BOARD_COLORS[0])
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    kanbanApi.boards().then(r => setBoards(r.items ?? [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function create() {
    if (!name.trim()) { toast.error('Dê um nome ao quadro.'); return }
    setSaving(true)
    try {
      await kanbanApi.createBoard({ name: name.trim(), description: description.trim() || undefined, color })
      setName(''); setDescription(''); setColor(BOARD_COLORS[0]); setCreating(false)
      load()
      toast.success('Quadro criado')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao criar quadro') }
    finally { setSaving(false) }
  }

  async function remove(id: number) {
    if (!confirm('Excluir este quadro e todos os seus cards?')) return
    try { await kanbanApi.deleteBoard(id); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
  }

  async function duplicate(id: number) {
    try { await kanbanApi.duplicateBoard(id); load(); toast.success('Quadro duplicado') }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao duplicar') }
  }

  return (
    <AppLayout title="Meus Processos">
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LayoutGrid size={20} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Meus Processos</h1>
          </div>
          <button onClick={() => setCreating(true)} className="ds-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px' }}>
            <Plus size={15} /> Novo quadro
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 }}>
          Crie quadros Kanban para acompanhar e controlar os seus processos.
        </p>

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>
        ) : boards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>
            <LayoutGrid size={26} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>Nenhum quadro ainda</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Clique em “Novo quadro” para começar.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {boards.map(b => (
              <div key={b.id} className="ds-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 6, background: b.color ?? 'var(--primary)' }} />
                <Link href={`/portal-cliente/kanban/${b.id}`} style={{ padding: 14, textDecoration: 'none', color: 'inherit', flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{b.name}</div>
                  {b.description && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.description}</div>}
                  <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 10 }}>{b.columns_count} colunas · {b.cards_count} cards</div>
                </Link>
                <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                  <button onClick={() => duplicate(b.id)} title="Duplicar" style={iconBtn}><Copy size={14} /></button>
                  <button onClick={() => remove(b.id)} title="Excluir" style={iconBtn}><Trash2 size={14} /></button>
                  <Link href={`/portal-cliente/kanban/${b.id}`} title="Abrir" style={{ ...iconBtn, color: 'var(--primary)' }}><ArrowRight size={15} /></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div onClick={() => setCreating(false)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Novo quadro</h3>
              <button onClick={() => setCreating(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <label style={lbl}>Nome</label>
            <input className="ds-input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ex.: Processos financeiros" style={{ width: '100%', marginBottom: 12 }} />
            <label style={lbl}>Descrição (opcional)</label>
            <textarea className="ds-input" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: '100%', marginBottom: 12, resize: 'vertical', fontFamily: 'inherit' }} />
            <label style={lbl}>Cor</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {BOARD_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setCreating(false)} className="ds-btn-ghost" style={{ fontSize: 13, padding: '8px 14px' }}>Cancelar</button>
              <button onClick={create} disabled={saving} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>{saving ? 'Criando…' : 'Criar quadro'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 5, display: 'inline-flex', borderRadius: 6 }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 5 }
