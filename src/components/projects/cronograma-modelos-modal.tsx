'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, LayoutTemplate, Copy, Save, Trash2 } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { HolidayDatePicker } from '@/components/ui/holiday-date-picker'

interface TemplateItem {
  id: number; name: string; description?: string | null
  stages_count: number; activities_count: number; created_by?: string | null
}
interface ProjectOption { id: number; name: string; code?: string | null }

type Tab = 'aplicar' | 'copiar' | 'salvar'

export function CronogramaModelosModal({ open, onClose, projectId, onApplied }: {
  open: boolean
  onClose: () => void
  projectId: number
  onApplied: () => void
}) {
  const [tab, setTab] = useState<Tab>('aplicar')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [busy, setBusy] = useState(false)

  // aplicar
  const [templateId, setTemplateId] = useState('')
  const [applyStart, setApplyStart] = useState<string | null>(null)
  // copiar
  const [sourceId, setSourceId] = useState('')
  const [copyStart, setCopyStart] = useState<string | null>(null)
  // salvar
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const loadTemplates = useCallback(async () => {
    try {
      const r = await api.get<{ items: TemplateItem[] }>('/cronograma-templates')
      setTemplates(r.items ?? [])
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    if (!open) return
    loadTemplates()
    const pick = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    api.get<any>('/projects?pageSize=1000').then(r => {
      setProjects(pick(r).filter((p: any) => p?.id && p.id !== projectId).map((p: any) => ({ id: p.id, name: p.code ? `${p.name} (${p.code})` : p.name })))
    }).catch(() => {})
  }, [open, loadTemplates, projectId])

  if (!open) return null

  async function applyTemplate() {
    if (!templateId || !applyStart) { toast.error('Escolha o modelo e a data de início'); return }
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/cronograma/apply-template`, { template_id: Number(templateId), start_date: applyStart })
      toast.success('Modelo aplicado ao cronograma')
      onApplied(); onClose()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aplicar modelo') }
    finally { setBusy(false) }
  }

  async function copyFromProject() {
    if (!sourceId || !copyStart) { toast.error('Escolha o projeto de origem e a data de início'); return }
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/cronograma/copy-from`, { source_project_id: Number(sourceId), start_date: copyStart })
      toast.success('Cronograma copiado para o projeto')
      onApplied(); onClose()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao copiar cronograma') }
    finally { setBusy(false) }
  }

  async function saveAsTemplate() {
    if (!name.trim()) { toast.error('Informe o nome do modelo'); return }
    setBusy(true)
    try {
      await api.post('/cronograma-templates', { name: name.trim(), description: description.trim() || null, source_project_id: projectId })
      toast.success('Cronograma salvo como modelo')
      setName(''); setDescription('')
      loadTemplates()
      setTab('aplicar')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar modelo') }
    finally { setBusy(false) }
  }

  async function deleteTemplate(id: number) {
    if (!confirm('Excluir este modelo?')) return
    try {
      await api.delete(`/cronograma-templates/${id}`)
      loadTemplates()
      if (String(id) === templateId) setTemplateId('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir modelo') }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'aplicar', label: 'Aplicar modelo', icon: <LayoutTemplate size={13} /> },
    { id: 'copiar', label: 'Copiar de projeto', icon: <Copy size={13} /> },
    { id: 'salvar', label: 'Salvar como modelo', icon: <Save size={13} /> },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Modelos de cronograma</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab === t.id ? 600 : 400,
                borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'aplicar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Cria as etapas/sub-etapas/atividades do modelo neste projeto, reencaixando as datas a partir do início escolhido.</p>
            {templates.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Nenhum modelo salvo ainda. Use a aba “Salvar como modelo”.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {templates.map(t => (
                    <div key={t.id} onClick={() => setTemplateId(String(t.id))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${String(t.id) === templateId ? 'var(--primary)' : 'var(--border)'}`, background: String(t.id) === templateId ? 'var(--primary-soft, var(--surface-hover))' : 'transparent' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.stages_count} etapas · {t.activities_count} atividades{t.created_by ? ` · ${t.created_by}` : ''}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }} title="Excluir modelo" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Início</span>
                <HolidayDatePicker value={applyStart} onChange={setApplyStart} placeholder="Definir início" />
              </div>
              <button onClick={applyTemplate} disabled={busy || !templateId || !applyStart} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px', marginLeft: 'auto' }}>
                {busy ? '…' : 'Aplicar'}
              </button>
            </div>
          </div>
        )}

        {tab === 'copiar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Copia o cronograma de outro projeto para este, reencaixando as datas a partir do início escolhido.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Projeto de origem</span>
              <SearchSelect value={sourceId} onChange={setSourceId} options={projects} placeholder="Buscar projeto…" fullWidth />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Início</span>
                <HolidayDatePicker value={copyStart} onChange={setCopyStart} placeholder="Definir início" />
              </div>
              <button onClick={copyFromProject} disabled={busy || !sourceId || !copyStart} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px', marginLeft: 'auto' }}>
                {busy ? '…' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {tab === 'salvar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Salva o cronograma atual deste projeto como um modelo reutilizável (ex.: “Atualização de Versão”).</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nome do modelo</span>
              <input className="ds-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Atualização de Versão" maxLength={150} style={{ fontSize: 13, padding: '6px 10px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descrição (opcional)</span>
              <input className="ds-input" value={description} onChange={e => setDescription(e.target.value)} maxLength={255} style={{ fontSize: 13, padding: '6px 10px' }} />
            </div>
            <button onClick={saveAsTemplate} disabled={busy || !name.trim()} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px', alignSelf: 'flex-start' }}>
              {busy ? '…' : 'Salvar modelo'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
