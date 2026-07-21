'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { useState, useEffect, useCallback } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronUp, ChevronDown, Save, RotateCcw, Eye, Paperclip } from 'lucide-react'
import { CompetenciasConfigTabs } from '@/components/competencias/config-tabs'
import { useConfirm } from '@/components/ui/use-confirm'

interface Field { key: string; label: string; type: string; required?: boolean; options?: string[]; require_unless?: string; auto?: boolean }
interface FieldType { value: string; label: string }
interface TypeOpt { value: string; label: string }
interface ConfigData { configs: Record<string, Field[]>; field_types: FieldType[]; types: TypeOpt[] }

export default function FormulariosPage() {
  const [data, setData] = useState<ConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState('candidate')
  const [saving, setSaving] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.get<ConfigData>('/competencias/form-configs')) }
    catch { toast.error('Erro ao carregar configurações') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const fields = data?.configs[active] ?? []
  const setFields = (next: Field[]) => setData(d => d ? { ...d, configs: { ...d.configs, [active]: next } } : d)

  const update = (i: number, patch: Partial<Field>) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  // Campos que o CEP preenche automaticamente + número/complemento.
  const ADDRESS_COMPANIONS: Field[] = [
    { key: 'logradouro', label: 'Endereço', type: 'text', required: true, auto: true },
    { key: 'bairro', label: 'Bairro', type: 'text', required: true, auto: true },
    { key: 'cidade', label: 'Cidade', type: 'text', required: true, auto: true },
    { key: 'estado', label: 'Estado (UF)', type: 'text', required: true, auto: true },
    { key: 'numero', label: 'Número', type: 'text', required: true },
    { key: 'complemento', label: 'Complemento', type: 'text', require_unless: 'sem_complemento' },
    { key: 'sem_complemento', label: 'Sem complemento', type: 'boolean' },
  ]
  // Ao escolher o tipo CEP, cria os campos de endereço logo após (se ainda não existirem).
  const setType = (i: number, type: string) => {
    let next = fields.map((f, idx) => idx === i ? { ...f, type } : f)
    if (type === 'cep') {
      const existing = new Set(next.map(f => f.key))
      const toAdd = ADDRESS_COMPANIONS.filter(c => !existing.has(c.key))
      if (toAdd.length) {
        next = [...next.slice(0, i + 1), ...toAdd, ...next.slice(i + 1)]
        toast.success('Campos de endereço adicionados automaticamente')
      }
    }
    setFields(next)
  }
  const remove = (i: number) => setFields(fields.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= fields.length) return
    const next = fields.slice();[next[i], next[j]] = [next[j], next[i]]; setFields(next)
  }
  const add = () => setFields([...fields, { key: '', label: 'Novo campo', type: 'text' }])

  async function save() {
    setSaving(true)
    try {
      const res = await api.put<{ fields: Field[] }>(`/competencias/form-configs/${active}`, { fields })
      setFields(res.fields)
      toast.success('Formulário salvo')
    } catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao salvar')) } finally { setSaving(false) }
  }
  async function reset() {
    if (!(await confirm({ title: 'Restaurar padrão', message: 'Restaurar este formulário para o padrão do sistema? As alterações atuais serão perdidas.', danger: true, confirmLabel: 'Restaurar' }))) return
    try {
      const res = await api.post<{ fields: Field[] }>(`/competencias/form-configs/${active}/reset`, {})
      setFields(res.fields); toast.success('Restaurado ao padrão')
    } catch { toast.error('Erro ao restaurar') }
  }

  if (loading || !data) return <AppLayout title="Configuração de Formulários"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>

  return (
    <AppLayout title="Matriz & Formulários">
      <div className="space-y-4">
        <CompetenciasConfigTabs />
        {/* Abas de tipo */}
        <div className="ds-card ds-card-pad flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1">
            {data.types.map(t => (
              <button key={t.value} onClick={() => setActive(t.value)} className={active === t.value ? 'ds-filter-active' : ''}
                style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: active === t.value ? 'var(--primary-soft)' : 'transparent', color: active === t.value ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: active === t.value ? 600 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="ds-btn-secondary flex items-center gap-1.5" onClick={reset}><RotateCcw size={14} /> Padrão</button>
            <button className="ds-btn-primary flex items-center gap-1.5" disabled={saving} onClick={save}><Save size={15} /> Salvar</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="ds-card ds-card-pad space-y-2">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>{f.key || '(novo)'}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="ds-btn-secondary" style={{ padding: '3px 6px' }}><ChevronUp size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="ds-btn-secondary" style={{ padding: '3px 6px' }}><ChevronDown size={13} /></button>
                    <button onClick={() => remove(i)} className="ds-btn-secondary" style={{ padding: '3px 6px', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Rótulo</div>
                    <input className="ds-input" value={f.label} onChange={e => update(i, { label: e.target.value })} />
                  </div>
                  <div>
                    <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Tipo</div>
                    <select className="ds-input" value={f.type} onChange={e => setType(i, e.target.value)}>
                      {data.field_types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                {f.type === 'select' && (
                  <div>
                    <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Opções (separe por vírgula)</div>
                    <input className="ds-input" value={(f.options ?? []).join(', ')}
                      onChange={e => update(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                  </div>
                )}
                {f.type === 'cep' && <p style={{ fontSize: 11, color: 'var(--primary)' }}>Preenche Endereço, Bairro, Cidade e UF automaticamente pelo CEP.</p>}
                {f.auto && <p style={{ fontSize: 11, color: 'var(--text-light)' }}>Preenchido automaticamente pelo CEP.</p>}
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.required} onChange={e => update(i, { required: e.target.checked })} /> Obrigatório
                </label>
              </div>
            ))}
            <button className="ds-btn-secondary w-full flex items-center justify-center gap-2" onClick={add}><Plus size={15} /> Adicionar campo</button>
          </div>

          {/* Prévia */}
          <div>
            <div className="ds-card ds-card-pad" style={{ position: 'sticky', top: 12 }}>
              <div className="flex items-center gap-2 mb-3"><Eye size={15} style={{ color: 'var(--primary)' }} /><h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Prévia</h3></div>
              <div className="space-y-3">
                <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Seus dados</div>
                {fields.map((f, i) => <PreviewField key={i} field={f} />)}
                <button className="ds-btn-primary w-full" style={{ marginTop: 8, opacity: 0.9, pointerEvents: 'none' }}>Iniciar avaliação</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </AppLayout>
  )
}

function PreviewField({ field: f }: { field: Field }) {
  const req = f.required || !!f.require_unless
  const label = <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}{req ? ' *' : ''}</div>
  const ph: Record<string, string> = { phone: '(00) 00000-0000', cpf: '000.000.000-00', cep: '00000-000', money: 'R$ 0,00', email: 'nome@email.com' }

  if (f.type === 'boolean') return (
    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" disabled /> {f.label}</label>
  )
  if (f.type === 'select') return (
    <div>{label}<select className="ds-input" disabled><option>— selecione —</option>{(f.options ?? []).map(o => <option key={o}>{o}</option>)}</select></div>
  )
  if (f.type === 'file') return (
    <div>{label}<div className="ds-input flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Paperclip size={14} /> Anexar arquivo (PDF, DOC, DOCX)</div></div>
  )
  if (f.type === 'textarea') return (
    <div>{label}<textarea className="ds-input" rows={3} disabled placeholder="Texto…" /></div>
  )
  return <div>{label}<input className="ds-input" disabled placeholder={ph[f.type] ?? ''} /></div>
}
