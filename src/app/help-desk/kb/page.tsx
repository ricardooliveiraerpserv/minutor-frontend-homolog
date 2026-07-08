'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { BookOpen, Plus, Eye, Trash2, ArrowLeft, Globe, Lock, Paperclip, Upload } from 'lucide-react'

/** Gestão da KB (criar/editar/publicar/excluir) só p/ quem pode; consultor lê. */
function useCanManageKb(): boolean {
  const { user } = useAuth()
  const perms = (user as { permissions?: string[] } | null)?.permissions ?? []
  return user?.type === 'admin' || user?.type === 'coordenador' || perms.includes('help_desk.kb.manage')
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'

interface KbCategory { id: number; name: string; visibility: string; articles_count?: number }
interface Article {
  id: number; title: string; excerpt: string | null; body: string | null
  status: string; visibility: string; kb_category_id: number | null
  views_count: number; helpful_count: number; not_helpful_count: number
  category?: { id: number; name: string } | null; updated_at: string; published_at: string | null
}

const STATUS_PILL: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Rascunho',  color: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  published: { label: 'Publicado', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  archived:  { label: 'Arquivado', color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
}

export default function HelpDeskKbPage() {
  const canManage = useCanManageKb()
  const [cats, setCats] = useState<KbCategory[]>([])
  const [arts, setArts] = useState<Article[]>([])
  const [filterCat, setFilterCat] = useState(''); const [filterStatus, setFilterStatus] = useState('')
  const [editing, setEditing] = useState<Article | 'new' | null>(null)
  const [newCat, setNewCat] = useState('')

  const loadCats = useCallback(() => { api.get<{ data: KbCategory[] }>('/help-desk/kb/categories?all=1').then(r => setCats(r?.data ?? [])).catch(() => {}) }, [])
  const loadArts = useCallback(() => {
    const p = new URLSearchParams()
    if (filterCat) p.set('kb_category_id', filterCat); if (filterStatus) p.set('status', filterStatus)
    api.get<{ data: Article[] }>(`/help-desk/kb/articles${p.toString() ? `?${p}` : ''}`).then(r => setArts(r?.data ?? [])).catch(() => {})
  }, [filterCat, filterStatus])
  useEffect(() => { loadCats() }, [loadCats])
  useEffect(() => { loadArts() }, [loadArts])

  const addCat = async () => { if (!newCat.trim()) return; try { await api.post('/help-desk/kb/categories', { name: newCat.trim() }); setNewCat(''); loadCats() } catch { toast.error('Erro') } }
  const delArt = async (a: Article) => { if (!confirm(`Excluir "${a.title}"?`)) return; try { await api.delete(`/help-desk/kb/articles/${a.id}`); loadArts() } catch { toast.error('Erro') } }

  if (editing) return <Editor article={editing} cats={cats} canManage={canManage} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); loadArts(); loadCats() }} />

  return (
    <AppLayout title="Base de Conhecimento">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen size={20} style={{ color: 'var(--primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Base de Conhecimento</h1>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>({arts.length})</span>
          </div>
          {canManage && <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing('new')}><Plus size={16} /> Novo artigo</button>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Categorias */}
          <div className="ds-card p-3 space-y-2 h-fit">
            <div className={lbl} style={{ color: 'var(--text-light)' }}>Categorias</div>
            <button onClick={() => setFilterCat('')} className="block text-sm text-left w-full px-2 py-1 rounded" style={{ background: !filterCat ? 'var(--primary-soft)' : 'transparent', color: !filterCat ? 'var(--primary)' : 'var(--text)' }}>Todas</button>
            {cats.map(c => (
              <button key={c.id} onClick={() => setFilterCat(String(c.id))} className="flex items-center justify-between text-sm text-left w-full px-2 py-1 rounded"
                style={{ background: filterCat === String(c.id) ? 'var(--primary-soft)' : 'transparent', color: filterCat === String(c.id) ? 'var(--primary)' : 'var(--text)' }}>
                <span className="inline-flex items-center gap-1">{c.visibility === 'internal' ? <Lock size={11} /> : <Globe size={11} />}{c.name}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{c.articles_count ?? 0}</span>
              </button>
            ))}
            {canManage && <div className="flex gap-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <input className={`${fieldCls} flex-1`} style={inputStyle} placeholder="Nova categoria" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
              <button className="ds-btn-secondary px-2 rounded-lg" onClick={addCat}><Plus size={14} /></button>
            </div>}
          </div>

          {/* Artigos */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex gap-2">
              <select className={fieldCls} style={inputStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Status (todos)</option><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option>
              </select>
            </div>
            <div className="ds-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
                  <th className="px-3 py-2">Título</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Visib.</th><th className="px-3 py-2">Views</th><th className="px-3 py-2">Atualizado</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {arts.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum artigo.</td></tr> : arts.map(a => {
                    const sp = STATUS_PILL[a.status] ?? STATUS_PILL.draft
                    return (
                      <tr key={a.id} className="ds-row-hover cursor-pointer border-t" style={{ borderColor: 'var(--border)' }} onClick={() => setEditing(a)}>
                        <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{a.title}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{a.category?.name ?? '—'}</td>
                        <td className="px-3 py-2"><span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: sp.color, background: sp.bg }}>{sp.label}</span></td>
                        <td className="px-3 py-2">{a.visibility === 'customer' ? <Globe size={14} style={{ color: 'var(--info-border)' }} /> : <Lock size={14} style={{ color: 'var(--text-muted)' }} />}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}><Eye size={12} className="inline -mt-0.5 mr-1" />{a.views_count}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>{fmtDate(a.updated_at)}</td>
                        <td className="px-3 py-2 text-right">{canManage && <button onClick={e => { e.stopPropagation(); delArt(a) }}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function Editor({ article, cats, canManage, onBack, onSaved }: { article: Article | 'new'; cats: KbCategory[]; canManage: boolean; onBack: () => void; onSaved: () => void }) {
  const a = article === 'new' ? null : article
  const [title, setTitle] = useState(a?.title ?? '')
  const [catId, setCatId] = useState(a?.kb_category_id ? String(a.kb_category_id) : '')
  const [visibility, setVisibility] = useState(a?.visibility ?? 'customer')
  const [excerpt, setExcerpt] = useState(a?.excerpt ?? '')
  const [body, setBody] = useState(a?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [atts, setAtts] = useState<{ id: number; original_name?: string; file_name?: string; human_size?: string }[]>([])

  const loadAtts = useCallback(() => { if (a) api.get<{ data: typeof atts }>(`/help-desk/kb/articles/${a.id}/attachments`).then(r => setAtts(r?.data ?? [])).catch(() => {}) }, [a])
  useEffect(() => { loadAtts() }, [loadAtts])
  const upload = async (file: File) => { if (!a) return; const fd = new FormData(); fd.append('file', file); try { await api.post(`/help-desk/kb/articles/${a.id}/attachments`, fd); toast.success('Anexo enviado'); loadAtts() } catch { toast.error('Erro ao anexar') } }
  const delAtt = async (attId: number) => { if (!a) return; try { await api.delete(`/help-desk/kb/articles/${a.id}/attachments/${attId}`); loadAtts() } catch { toast.error('Erro') } }

  const payload = () => ({ title: title.trim(), kb_category_id: catId || null, visibility, excerpt: excerpt.trim() || null, body })
  const save = async (publish: boolean) => {
    if (!title.trim()) return toast.error('Informe o título.')
    setSaving(true)
    try {
      if (a) {
        await api.put(`/help-desk/kb/articles/${a.id}`, payload())
        if (publish) await api.post(`/help-desk/kb/articles/${a.id}/publish`, {})
      } else {
        const r = await api.post<{ data: { id: number } }>('/help-desk/kb/articles', { ...payload(), status: publish ? 'published' : 'draft' })
        if (publish && r?.data?.id) { /* já criado publicado */ }
      }
      toast.success(publish ? 'Artigo publicado' : 'Rascunho salvo'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  // Leitura (consultor/sem gestão): leitor de artigo limpo, sem controles de edição.
  if (!canManage) {
    return (
      <AppLayout title="Artigo">
        <div className="space-y-3 max-w-3xl">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={16} /> Voltar</button>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{title}</h1>
          {catId && <div className="text-xs" style={{ color: 'var(--text-light)' }}>Categoria: {cats.find(c => String(c.id) === catId)?.name ?? '—'}</div>}
          {excerpt && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{excerpt}</p>}
          <div className="ds-card p-4"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{body || '—'}</p></div>
          {atts.length > 0 && (
            <div className="ds-card p-3 space-y-1">
              <div className={lbl} style={{ color: 'var(--text-light)' }}><Paperclip size={12} className="inline -mt-0.5 mr-1" />Anexos</div>
              {atts.map(at => (
                <a key={at.id} href={`/api/v1/help-desk/kb/articles/${a?.id}/attachments/${at.id}/download`} className="block text-xs ds-link truncate" style={{ color: 'var(--primary)' }}>{at.original_name ?? at.file_name ?? `Anexo #${at.id}`}</a>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title={a ? 'Editar artigo' : 'Novo artigo'}>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2">
          <button onClick={onBack}><ArrowLeft size={18} style={{ color: 'var(--text-muted)' }} /></button>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{a ? 'Editar artigo' : 'Novo artigo'}</h1>
          {a && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: (STATUS_PILL[a.status] ?? STATUS_PILL.draft).bg, color: (STATUS_PILL[a.status] ?? STATUS_PILL.draft).color }}>{(STATUS_PILL[a.status] ?? STATUS_PILL.draft).label}</span>}
        </div>
        <div className="ds-card p-4 space-y-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Título</label><input className={`${fieldCls} w-full`} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Categoria</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={catId} onChange={e => setCatId(e.target.value)}><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Visibilidade</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={visibility} onChange={e => setVisibility(e.target.value)}><option value="customer">Cliente (Portal)</option><option value="internal">Interno</option></select></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Resumo</label><input className={`${fieldCls} w-full`} style={inputStyle} value={excerpt} onChange={e => setExcerpt(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Conteúdo</label><textarea className={`${fieldCls} w-full font-mono`} style={inputStyle} rows={14} value={body} onChange={e => setBody(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={() => save(false)} disabled={saving}>Salvar rascunho</button>
            <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={() => save(true)} disabled={saving}>Publicar</button>
          </div>
        </div>

        {a && (
          <div className="ds-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className={lbl} style={{ color: 'var(--text-light)' }}><Paperclip size={12} className="inline -mt-0.5 mr-1" />Imagens / anexos ({atts.length})</div>
              <label className="inline-flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--primary)' }}>
                <Upload size={13} /> Enviar
                <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = '' }} />
              </label>
            </div>
            {atts.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum anexo.</p> : atts.map(at => (
              <div key={at.id} className="flex items-center justify-between text-xs">
                <a href={`/api/v1/help-desk/kb/articles/${a.id}/attachments/${at.id}/download`} className="ds-link truncate" style={{ color: 'var(--primary)' }}>{at.original_name ?? at.file_name ?? `Anexo #${at.id}`} {at.human_size ? `· ${at.human_size}` : ''}</a>
                <button onClick={() => delAtt(at.id)}><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
