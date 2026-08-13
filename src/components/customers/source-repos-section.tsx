'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Pencil, Zap } from 'lucide-react'

/** Fonte Git autorizada de um cliente (Fase 0 — Solicitação de código-fonte). */
interface Repo {
  id: number; owner: string; repository: string; full_name: string
  branch: string; base_path: string; tipo: string; descricao: string | null
  active: boolean; created_by: string | null; updated_by: string | null; updated_at: string | null
}
const TIPOS: [string, string][] = [['protheus', 'Protheus'], ['fluig', 'Fluig'], ['integracoes', 'Integrações'], ['outros', 'Outros']]
const BLANK = { owner: '', repository: '', branch: '', base_path: '', tipo: 'protheus', descricao: '', active: true }
type FormState = typeof BLANK

/**
 * Seção "Repositórios de Código-Fonte" no cadastro do cliente. READ-ONLY no GitHub.
 * "Remover" = desativar (preserva rastreabilidade). Só renderiza p/ quem tem source_code.manage.
 */
export function SourceReposSection({ customerId }: { customerId: number }) {
  const [rows, setRows] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Repo[] }>(`/customers/${customerId}/source-repos`)
      .then(r => setRows(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [customerId])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditId(null); setForm({ ...BLANK }) }
  const openEdit = (r: Repo) => {
    setEditId(r.id)
    setForm({ owner: r.owner, repository: r.repository, branch: r.branch, base_path: r.base_path ?? '', tipo: r.tipo, descricao: r.descricao ?? '', active: r.active })
  }

  const save = async () => {
    if (!form) return
    if (!form.owner.trim() || !form.repository.trim() || !form.branch.trim()) { toast.error('Owner, repositório e branch são obrigatórios'); return }
    setSaving(true)
    try {
      const body = {
        owner: form.owner.trim(), repository: form.repository.trim(), branch: form.branch.trim(),
        base_path: form.base_path.trim(), tipo: form.tipo, descricao: form.descricao.trim() || null, active: form.active,
      }
      if (editId) await api.put(`/source-repos/${editId}`, body)
      else await api.post(`/customers/${customerId}/source-repos`, body)
      toast.success(editId ? 'Repositório atualizado' : 'Repositório adicionado')
      setForm(null); setEditId(null); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') } finally { setSaving(false) }
  }

  const deactivate = async (r: Repo) => {
    if (!window.confirm(`Desativar ${r.full_name}? Não exclui — preserva o histórico.`)) return
    try { await api.delete(`/source-repos/${r.id}`); toast.success('Repositório desativado'); load() } catch { toast.error('Erro ao desativar') }
  }

  const test = async (r: Repo) => {
    setTesting(r.id)
    try {
      const res = await api.post<{ ok: boolean; message: string; code?: string }>(`/source-repos/${r.id}/test`, {})
      if (res.ok) toast.success(res.message)
      else toast.error(res.message, { duration: 6000 })
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Falha ao testar acesso') } finally { setTesting(null) }
  }

  const tipoLabel = (t: string) => TIPOS.find(x => x[0] === t)?.[1] ?? t

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-semibold text-[var(--text)]">Repositórios de Código-Fonte</Label>
        {!form && <button type="button" onClick={openNew} className="text-[11px] inline-flex items-center gap-1 text-[var(--primary)]"><Plus size={12} /> Adicionar repositório</button>}
      </div>

      {loading ? (
        <p className="text-[11px] text-[var(--text-light)]">Carregando…</p>
      ) : rows.length === 0 && !form ? (
        <p className="text-[11px] text-[var(--text-light)]">Nenhum repositório autorizado. Cadastre owner/repositório/branch — a busca de fontes fica restrita a eles.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', opacity: r.active ? 1 : 0.55 }}>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{tipoLabel(r.tipo)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-[var(--text)]">{r.full_name} <span className="text-[var(--text-light)]">· {r.branch}</span></div>
                <div className="truncate text-[var(--text-light)]">{r.base_path || '/'}{r.descricao ? ` · ${r.descricao}` : ''}{!r.active ? ' · inativo' : ''}</div>
              </div>
              <button type="button" onClick={() => test(r)} disabled={testing === r.id} title="Testar acesso (read-only)" className="text-[var(--text-muted)] hover:text-[var(--primary)] shrink-0"><Zap size={13} /></button>
              <button type="button" onClick={() => openEdit(r)} title="Editar" className="text-[var(--primary)] shrink-0"><Pencil size={12} /></button>
              {r.active && <button type="button" onClick={() => deactivate(r)} title="Desativar" className="text-[var(--danger-border)] shrink-0"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px] text-[var(--text-light)]">Owner/Org *</Label><Input value={form.owner} onChange={e => setForm(f => f && ({ ...f, owner: e.target.value }))} placeholder="ex.: erpserv-clientes" className="h-7 text-xs" /></div>
            <div><Label className="text-[10px] text-[var(--text-light)]">Repositório *</Label><Input value={form.repository} onChange={e => setForm(f => f && ({ ...f, repository: e.target.value }))} placeholder="ex.: promax" className="h-7 text-xs" /></div>
            <div><Label className="text-[10px] text-[var(--text-light)]">Branch *</Label><Input value={form.branch} onChange={e => setForm(f => f && ({ ...f, branch: e.target.value }))} placeholder="ex.: main" className="h-7 text-xs" /></div>
            <div><Label className="text-[10px] text-[var(--text-light)]">Base path (opcional)</Label><Input value={form.base_path} onChange={e => setForm(f => f && ({ ...f, base_path: e.target.value }))} placeholder="(raiz do repo)" className="h-7 text-xs" /></div>
            <div><Label className="text-[10px] text-[var(--text-light)]">Tipo</Label>
              <select value={form.tipo} onChange={e => setForm(f => f && ({ ...f, tipo: e.target.value }))} className="w-full h-7 text-xs rounded-md px-2 outline-none" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><Label className="text-[10px] text-[var(--text-light)]">Descrição (opcional)</Label><Input value={form.descricao} onChange={e => setForm(f => f && ({ ...f, descricao: e.target.value }))} className="h-7 text-xs" /></div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer"><input type="checkbox" checked={form.active} onChange={e => setForm(f => f && ({ ...f, active: e.target.checked }))} /> Ativo</label>
            <div className="flex gap-1.5">
              <Button variant="outline" onClick={() => { setForm(null); setEditId(null) }} className="h-7 text-[11px] border-[var(--border)] text-[var(--text)]">Cancelar</Button>
              <Button onClick={save} disabled={saving} className="h-7 text-[11px] bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">{saving ? 'Salvando…' : (editId ? 'Salvar' : 'Adicionar')}</Button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] text-[var(--text-light)]">Read-only via GitHub App (Contents: Read-only). Preencha os campos (o texto cinza é só exemplo); "Remover" desativa (não exclui).</p>
    </div>
  )
}
