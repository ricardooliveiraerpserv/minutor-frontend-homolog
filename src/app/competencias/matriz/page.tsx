'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { useState, useEffect, useCallback } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, GitBranch, Star, Check, X, FolderPlus } from 'lucide-react'
import { CompetenciasConfigTabs } from '@/components/competencias/config-tabs'
import { useConfirm } from '@/components/ui/use-confirm'

interface Version { id: number; number: number; label: string | null; status: string; skills_count: number; items_count: number; published_at: string | null }
interface SkillItem { id: number; name: string; type: string }
interface Section { category: string; count: number; items: SkillItem[] }

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Ativa', cls: 'ds-status-success' }, draft: { label: 'Rascunho', cls: 'ds-status' }, archived: { label: 'Arquivada', cls: 'ds-status-info' },
}
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export default function MatrizPage() {
  const [versions, setVersions] = useState<Version[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ id?: number; name: string; category: string; type: string } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [renamingCat, setRenamingCat] = useState<{ from: string; value: string } | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [v, s] = await Promise.all([
        api.get<{ versions: Version[] }>('/competencias/matriz/versions'),
        api.get<{ sections: Section[]; total: number; categories: string[] }>('/competencias/matriz/skills'),
      ])
      setVersions(v.versions ?? [])
      setSections(s.sections ?? [])
      setCategories(s.categories ?? [])
      setTotal(s.total ?? 0)
    } catch { toast.error('Erro ao carregar a matriz') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function saveSkill() {
    if (!editing || !editing.name.trim() || !editing.category.trim()) { toast.error('Preencha nome e categoria'); return }
    try {
      if (editing.id) await api.put(`/competencias/matriz/skills/${editing.id}`, editing)
      else await api.post('/competencias/matriz/skills', editing)
      toast.success('Competência salva')
      setEditing(null); load()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar') }
  }
  async function removeSkill(id: number, name: string) {
    if (!(await confirm({ title: 'Remover competência', message: <>Remover <strong>{name}</strong> da matriz atual? As versões publicadas mantêm o histórico.</>, danger: true, confirmLabel: 'Remover' }))) return
    try { await api.delete(`/competencias/matriz/skills/${id}`); toast.success('Removida'); load() }
    catch { toast.error('Erro ao remover') }
  }
  async function renameCategory(from: string, to: string) {
    if (!to.trim() || to.trim() === from) { setRenamingCat(null); return }
    try { await api.put('/competencias/matriz/categories', { from, to: to.trim() }); toast.success('Categoria renomeada'); setRenamingCat(null); load() }
    catch { toast.error('Erro ao renomear categoria') }
  }
  async function deleteCategory(name: string, count: number) {
    if (!(await confirm({ title: 'Excluir categoria', message: <>Excluir a categoria <strong>{name}</strong> e suas {count} competência(s)? As versões publicadas mantêm o histórico.</>, danger: true, confirmLabel: 'Excluir' }))) return
    try { await api.delete(`/competencias/matriz/categories/${encodeURIComponent(name)}`); toast.success('Categoria excluída'); load() }
    catch { toast.error('Erro ao excluir categoria') }
  }
  async function deleteVersion(v: Version) {
    if (versions.length <= 1) { toast.error('Não é possível excluir a única versão.'); return }
    if (!(await confirm({ title: 'Excluir versão', message: <>Excluir a versão <strong>v{v.number}</strong>? Só é possível se não houver pesquisas ou respostas ligadas a ela.</>, danger: true, confirmLabel: 'Excluir' }))) return
    try { await api.delete(`/competencias/matriz/versions/${v.id}`); toast.success('Versão excluída'); load() }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao excluir versão')) }
  }
  async function publish(label: string) {
    setPublishing(true)
    try {
      const v = await api.post<Version>('/competencias/matriz/versions/publish', { label: label || null })
      toast.success(`Versão v${v.number} publicada`)
      load()
    } catch { toast.error('Erro ao publicar versão') } finally { setPublishing(false) }
  }

  return (
    <AppLayout title="Matriz & Formulários">
      <div className="space-y-4">
        <CompetenciasConfigTabs />
        {/* Versões */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GitBranch size={16} style={{ color: 'var(--primary)' }} />
              <h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Versões da matriz</h3>
            </div>
            <PublishButton onPublish={publish} disabled={publishing} />
          </div>
          {versions.length === 0 && !loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma versão publicada.</p>}
          <div className="divide-y">
            {versions.map(v => (
              <div key={v.id} className="flex items-center justify-between py-2 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>v{v.number}</span>
                  <span className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{v.label}</span>
                  <span className={STATUS[v.status]?.cls ?? 'ds-status'} style={{ fontSize: 10 }}>{STATUS[v.status]?.label ?? v.status}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.items_count} competências · {fmt(v.published_at)}</span>
                  {versions.length > 1 && (
                    <button className="ds-btn-secondary" style={{ padding: '4px 8px', color: 'var(--danger)' }} title="Excluir versão" onClick={() => deleteVersion(v)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
            Publicar uma nova versão congela as competências atuais. As respostas já enviadas continuam ligadas à versão que usaram.
          </p>
        </div>

        {/* Competências / Perguntas */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} competências (perguntas) na matriz viva</p>
          <div className="flex items-center gap-2">
            <button className="ds-btn-secondary flex items-center gap-2" onClick={() => setEditing({ name: '', category: '', type: 'technology' })}>
              <FolderPlus size={16} /> Nova categoria
            </button>
            <button className="ds-btn-primary flex items-center gap-2" onClick={() => setEditing({ name: '', category: categories[0] ?? '', type: 'technology' })}>
              <Plus size={16} /> Nova pergunta
            </button>
          </div>
        </div>

        {loading && <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div>}

        {!loading && sections.map(sec => (
          <div key={sec.category} className="ds-card ds-card-pad">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Star size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                {renamingCat?.from === sec.category ? (
                  <input className="ds-input" autoFocus style={{ height: 30, fontSize: 13 }} value={renamingCat.value}
                    onChange={e => setRenamingCat({ from: sec.category, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') renameCategory(sec.category, renamingCat.value); if (e.key === 'Escape') setRenamingCat(null) }} />
                ) : (
                  <h3 className="text-sm truncate" style={{ fontWeight: 600, color: 'var(--text)' }}>{sec.category}</h3>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{sec.count}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {renamingCat?.from === sec.category ? (
                  <>
                    <button className="ds-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => renameCategory(sec.category, renamingCat.value)}><Check size={13} /></button>
                    <button className="ds-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setRenamingCat(null)}><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <button className="ds-btn-secondary" style={{ padding: '4px 8px' }} title="Adicionar pergunta" onClick={() => setEditing({ name: '', category: sec.category, type: 'technology' })}><Plus size={13} /></button>
                    <button className="ds-btn-secondary" style={{ padding: '4px 8px' }} title="Renomear categoria" onClick={() => setRenamingCat({ from: sec.category, value: sec.category })}><Pencil size={13} /></button>
                    <button className="ds-btn-secondary" style={{ padding: '4px 8px', color: 'var(--danger)' }} title="Excluir categoria" onClick={() => deleteCategory(sec.category, sec.count)}><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="divide-y">
              {sec.items.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{s.name}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing({ id: s.id, name: s.name, category: sec.category, type: s.type })} className="ds-btn-secondary" style={{ padding: '4px 8px' }}><Pencil size={13} /></button>
                    <button onClick={() => removeSkill(s.id, s.name)} className="ds-btn-secondary" style={{ padding: '4px 8px', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} size="sm">
          <ModalHeader title={editing.id ? 'Editar competência' : editing.category ? 'Nova pergunta' : 'Nova categoria'} icon={Star} onClose={() => setEditing(null)} />
          <ModalBody className="space-y-3">
            <div>
              <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Nome</div>
              <input className="ds-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Categoria</div>
              <input className="ds-input" list="cat-list" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Tipo</div>
              <select className="ds-input" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
                <option value="technology">Tecnologia</option>
                <option value="module">Módulo</option>
                <option value="process">Processo</option>
              </select>
            </div>
          </ModalBody>
          <ModalFooter>
            <button className="ds-btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="ds-btn-primary" onClick={saveSkill}>Salvar</button>
          </ModalFooter>
        </Modal>
      )}
      {confirmDialog}
    </AppLayout>
  )
}

function PublishButton({ onPublish, disabled }: { onPublish: (label: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  return (
    <>
      <button className="ds-btn-secondary flex items-center gap-2" disabled={disabled} onClick={() => setOpen(true)}><GitBranch size={14} /> Publicar versão</button>
      {open && (
        <Modal open onClose={() => setOpen(false)} size="sm">
          <ModalHeader title="Publicar nova versão" icon={GitBranch} onClose={() => setOpen(false)} />
          <ModalBody className="space-y-2">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Congela as competências atuais numa nova versão. A versão ativa anterior é arquivada.</p>
            <div>
              <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Rótulo (opcional)</div>
              <input className="ds-input" placeholder="Ex.: Matriz 2027" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
          </ModalBody>
          <ModalFooter>
            <button className="ds-btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="ds-btn-primary" onClick={() => { onPublish(label); setOpen(false) }}>Publicar</button>
          </ModalFooter>
        </Modal>
      )}
    </>
  )
}
