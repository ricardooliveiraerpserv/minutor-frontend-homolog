'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Target, Plus, FileDown, Copy, History, Upload, X, Pencil } from 'lucide-react'
import { MetaModal, tipoLabel, META_TIPOS } from '@/components/crm/meta-modal'

interface Row { user_id: number; name: string; cargo: string | null; meta: number; tipo: string; observacao: string | null; realizado: number; qtd: number; pct: number | null; ultima_alteracao: string | null }
interface Data { competencia: string; can_edit: boolean; total_meta: number; total_realizado: number; rows: Row[] }
interface Hist { id: number; responsavel: string; periodo: string; tipo: string; valor_anterior: number | null; valor_novo: number; observacao: string | null; por: string | null; em: string | null }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const curMonth = () => new Date().toISOString().slice(0, 7)
const isQtd = (t: string) => META_TIPOS.find(x => x.v === t)?.qtd
const fmtVal = (n: number, tipo: string) => isQtd(tipo) ? String(n) : fmtBRL(n)
const fmtDt = (s: string | null) => s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const pctColor = (p: number | null) => p == null ? 'var(--text-light)' : p >= 100 ? '#17914e' : p >= 70 ? 'var(--warning-border)' : 'var(--danger-border)'

export default function CrmMetasAdminPage() {
  const [comp, setComp] = useState(curMonth())
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [modal, setModal] = useState<{ userId?: number } | null>(null)
  const [hist, setHist] = useState(false)
  const [imp, setImp] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Data }>(`/crm/metas?competencia=${comp}`)
      .then(r => setD(r?.data ?? null))
      .catch((e: any) => { if (String(e?.message || '').match(/permite|403/)) setDenied(true); else toast.error('Erro ao carregar metas') })
      .finally(() => setLoading(false))
  }, [comp])
  useEffect(() => { load() }, [load])

  const duplicar = async () => {
    try { const r = await api.post<{ data: { copiadas: number } }>(`/crm/metas/duplicate?competencia=${comp}`, {}); toast.success(`${r.data.copiadas} meta(s) copiada(s)`); load() }
    catch { toast.error('Erro ao duplicar') }
  }
  const exportCsv = () => {
    if (!d) return
    const rows = d.rows.map(r => [r.name, tipoLabel(r.tipo), r.meta, r.realizado, r.pct ?? '', r.observacao ?? ''])
    const csv = [['Responsável', 'Tipo', 'Meta', 'Realizado', '%', 'Observação'], ...rows].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `metas-${comp}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const respList = d?.rows.map(r => ({ id: r.user_id, name: r.name, cargo: r.cargo, meta: r.meta })) ?? []

  return (
    <AppLayout title="Administração de Metas (CRM)">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Target size={20} style={{ color: 'var(--primary)' }} /> Administração de Metas</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>Manutenção completa: tipo de meta, observação, histórico de alterações e importação.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button onClick={() => setHist(true)} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><History size={14} /> Histórico</button>
          <button onClick={exportCsv} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><FileDown size={14} /> Exportar</button>
          {d?.can_edit && <>
            <button onClick={duplicar} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Copy size={14} /> Duplicar mês ant.</button>
            <button onClick={() => setImp(true)} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Upload size={14} /> Importar</button>
            <button onClick={() => setModal({})} className="text-sm rounded-lg px-4 py-2 font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova Meta</button>
          </>}
        </div>
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Seu perfil não permite ver metas.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : d && (
        <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ color: 'var(--text-light)' }}>
              {['Responsável', 'Tipo', 'Meta', 'Realizado', 'Atingimento', 'Última alteração', ''].map((h, i) => <th key={i} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide ${i >= 2 && i <= 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.rows.map(r => (
                <tr key={r.user_id} className="transition hover:brightness-110" style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{r.name}{r.observacao && <span title={r.observacao} className="ml-1.5 text-[10px]" style={{ color: 'var(--text-light)' }}>💬</span>}</td>
                  <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{tipoLabel(r.tipo)}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{r.meta > 0 ? fmtVal(r.meta, r.tipo) : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtVal(r.realizado, r.tipo)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2" style={{ minWidth: 120 }}>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}><div style={{ width: `${Math.min(100, r.pct ?? 0)}%`, height: '100%', background: pctColor(r.pct) }} /></div>
                      <span className="text-[11px] font-bold tabular-nums w-9 text-right" style={{ color: pctColor(r.pct) }}>{r.pct == null ? '—' : `${Math.round(r.pct)}%`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums" style={{ color: 'var(--text-light)' }}>{fmtDt(r.ultima_alteracao)}</td>
                  <td className="px-4 py-2.5 text-right">{d.can_edit && <button onClick={() => setModal({ userId: r.user_id })} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}><Pencil size={13} /></button>}</td>
                </tr>
              ))}
              {d.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum responsável no escopo.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal && d && <MetaModal comp={comp} responsaveis={respList} initialUserId={modal.userId} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {hist && <HistoricoModal comp={comp} onClose={() => setHist(false)} />}
      {imp && d && <ImportModal comp={comp} responsaveis={respList} onClose={() => setImp(false)} onSaved={() => { setImp(false); load() }} />}
    </AppLayout>
  )
}

function HistoricoModal({ comp, onClose }: { comp: string; onClose: () => void }) {
  const [rows, setRows] = useState<Hist[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get<{ data: Hist[] }>(`/crm/metas/historico`).then(r => setRows(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false)) }, [])
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl h-full overflow-y-auto p-5" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: 'var(--text)' }}>Histórico de alterações</h3><button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button></div>
        {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Sem alterações registradas.</p>
        : <div className="space-y-2">
            {rows.map(h => (
              <div key={h.id} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between"><span className="font-medium" style={{ color: 'var(--text)' }}>{h.responsavel} · {h.periodo}</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDt(h.em)}</span></div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{tipoLabel(h.tipo)}: {h.valor_anterior != null ? fmtVal(h.valor_anterior, h.tipo) : '—'} → <b style={{ color: 'var(--text)' }}>{fmtVal(h.valor_novo, h.tipo)}</b>{h.por && <span> · por {h.por}</span>}</p>
                {h.observacao && <p className="text-[11px] mt-1 italic" style={{ color: 'var(--text-light)' }}>“{h.observacao}”</p>}
              </div>
            ))}
          </div>}
      </div>
    </div>
  )
}

function ImportModal({ comp, responsaveis, onClose, onSaved }: { comp: string; responsaveis: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [tipo, setTipo] = useState('receita')
  const [saving, setSaving] = useState(false)
  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }

  const parse = () => {
    const rows: { user_id: number; valor_meta: number }[] = []
    const skipped: string[] = []
    text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const [nome, val] = line.split(/[;,\t]/).map(s => s?.trim())
      if (!nome || val == null) return
      const r = responsaveis.find(x => x.name.toLowerCase() === nome.toLowerCase()) || responsaveis.find(x => x.name.toLowerCase().includes(nome.toLowerCase()))
      const v = Number(String(val).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
      if (r && !isNaN(v)) rows.push({ user_id: r.id, valor_meta: v }); else skipped.push(nome)
    })
    return { rows, skipped }
  }

  const importar = async () => {
    const { rows, skipped } = parse()
    if (rows.length === 0) { toast.error('Nenhuma linha reconhecida (formato: Nome;Valor)'); return }
    setSaving(true)
    try { const r = await api.post<{ data: { importadas: number } }>('/crm/metas/importar', { competencia: comp, tipo, rows }); toast.success(`${r.data.importadas} meta(s) importada(s)${skipped.length ? ` · ${skipped.length} não reconhecida(s)` : ''}`); onSaved() }
    catch { toast.error('Erro ao importar') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Importar metas · {comp}</h3><button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button></div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de meta</label>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={inp}>{META_TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Cole do Excel — uma linha por vendedor: <b>Nome;Valor</b></label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder={'Ricardo Oliveira;250000\nPedro Ferreira;180000'} className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono resize-none" style={inp} />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={importar} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Importando…' : 'Importar'}</button>
        </div>
      </div>
    </div>
  )
}
