'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { ClipboardList, Users, TrendingUp, TrendingDown, Filter, ChevronRight, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react'

interface SkillRow { skill_id: number; name: string; category: string; avg_weight: number; answers: number; with_knowledge_pct: number }
interface Respondent { id: number; name: string; type: string; classification: string | null; classification_label: string | null; blacklist: boolean; partner_id: string; partner_name: string | null; empresa: string | null; valor: string | null; last_at: string; top_weight: number | null; top_level: string | null; matches: number | null }
interface SkillRowDetail { respondent_id: number; name: string; classification: string | null; classification_label: string | null; blacklist: boolean; valor: string | null; module: string; category: string; level: string; weight: number }
interface Level { id: number; name: string; weight: number }
interface Opt { value: string; label: string; category?: string }
interface Summary {
  surveys: { total: number; open: number }
  response_rate: { invited: number; submitted: number; pending: number; rate: number }
  strongest: SkillRow[]
  weakest: SkillRow[]
  respondents: Respondent[]
  skill_rows: SkillRowDetail[]
  filters: { categories: string[]; levels: Level[]; classifications: Opt[]; modules: Opt[]; names: Opt[]; partners: Opt[] }
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
function classClass(c: string | null) {
  if (c === 'blacklist') return 'ds-status-danger'
  if (c === 'erpserv') return 'ds-status-info'
  if (c === 'candidato') return 'ds-status-success'
  return 'ds-status'
}
const levelColor = (w: number) => w >= 4 ? 'var(--success)' : w >= 3 ? 'var(--primary)' : w >= 2 ? 'var(--warning)' : 'var(--text-muted)'
function numVal(v: string | null): number | null {
  if (!v) return null; const s = String(v); if (!/\d/.test(s)) return null
  const n = s.includes(',') ? parseFloat(s.replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')) : parseFloat(s.replace(/\D/g, ''))
  return isNaN(n) ? null : n
}
function fmtValor(v: string | null): string {
  const n = numVal(v)
  if (n == null) return v ? String(v) : '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR')
}
type Sort = { key: string; dir: 1 | -1 }
function Th({ label, sortKey, sort, onSort, extra }: { label: string; sortKey: string; sort: Sort; onSort: (k: string) => void; extra?: string }) {
  const active = sort.key === sortKey
  return (
    <th className={`py-2 pr-3 ${extra ?? ''}`} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">{label}{active && (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
    </th>
  )
}

export default function DashboardCompetenciasPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [classifications, setClassifications] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [modules, setModules] = useState<string[]>([])
  const [names, setNames] = useState<string[]>([])
  const [levelWeights, setLevelWeights] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (classifications.length) qs.set('classifications', classifications.join(','))
    if (categories.length) qs.set('categories', categories.join(','))
    if (modules.length) qs.set('modules', modules.join(','))
    if (names.length) qs.set('respondent_ids', names.join(','))
    if (levelWeights.length) qs.set('level_weights', levelWeights.join(','))
    try { setData(await api.get<Summary>(`/competencias/dashboard${qs.toString() ? '?' + qs : ''}`)) }
    catch { toast.error('Erro ao carregar indicadores') } finally { setLoading(false) }
  }, [classifications, categories, modules, names, levelWeights])
  useEffect(() => { load() }, [load])

  const toggleCat = (c: string) => setCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  const toggleLevel = (w: string) => setLevelWeights(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])
  const toggleClassif = (c: string) => setClassifications(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  const detailed = categories.length > 0 || modules.length > 0
  const filteredPersons = levelWeights.length > 0

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkValue, setBulkValue] = useState('')
  const [sort, setSort] = useState<Sort>({ key: '', dir: 1 })
  const clickSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: (s.dir === 1 ? -1 : 1) } : { key: k, dir: 1 })

  const sortedRespondents = useMemo(() => {
    const rows = data?.respondents ?? []
    const acc: Record<string, (r: Respondent) => unknown> = { name: r => r.name, classification: r => r.classification_label, partner: r => r.partner_name, valor: r => numVal(r.valor), last: r => r.last_at }
    return sort.key && acc[sort.key] ? [...rows].sort((a, b) => cmp(acc[sort.key](a), acc[sort.key](b)) * sort.dir) : rows
  }, [data, sort])
  const sortedSkillRows = useMemo(() => {
    const rows = data?.skill_rows ?? []
    const acc: Record<string, (r: SkillRowDetail) => unknown> = { name: r => r.name, category: r => r.category, module: r => r.module, level: r => r.weight, classification: r => r.classification_label, valor: r => numVal(r.valor) }
    return sort.key && acc[sort.key] ? [...rows].sort((a, b) => cmp(acc[sort.key](a), acc[sort.key](b)) * sort.dir) : rows
  }, [data, sort])
  const toggleSel = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const labelOf = (v: string) => data?.filters.classifications.find(c => c.value === v)?.label ?? null

  async function setClassificationFor(id: number, value: string) {
    const label = labelOf(value)
    const keep = value === 'parceiro'
    setData(d => d ? {
      ...d,
      respondents: d.respondents.map(r => r.id === id ? { ...r, classification: value || null, blacklist: value === 'blacklist', classification_label: label, partner_id: keep ? r.partner_id : '', partner_name: keep ? r.partner_name : null } : r),
      skill_rows: d.skill_rows.map(r => r.respondent_id === id ? { ...r, classification: value || null, blacklist: value === 'blacklist', classification_label: label } : r),
    } : d)
    try { await api.put(`/competencias/profissionais/${id}/classification`, { classification: value || null }) }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao classificar')); load() }
  }

  async function setPartnerFor(id: number, partnerId: string) {
    const name = data?.filters.partners.find(x => x.value === partnerId)?.label ?? null
    setData(d => d ? { ...d, respondents: d.respondents.map(r => r.id === id ? { ...r, partner_id: partnerId, partner_name: name } : r) } : d)
    try { await api.put(`/competencias/profissionais/${id}/classification`, { classification: 'parceiro', partner_id: partnerId || null }) }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao vincular parceiro')); load() }
  }

  async function applyBulk() {
    const ids = [...selected]
    if (!ids.length) return
    try {
      const res = await api.put<{ updated: number }>('/competencias/profissionais/classification/bulk', { respondent_ids: ids, classification: bulkValue || null })
      toast.success(`${res.updated} classificação(ões) alterada(s)`)
      setSelected(new Set()); setBulkValue(''); load()
    } catch (e: unknown) { toast.error(apiMessage(e, 'Erro na alteração em massa')) }
  }

  const currentListIds = (): number[] => !data ? [] : (detailed ? [...new Set(data.skill_rows.map(r => r.respondent_id))] : data.respondents.map(r => r.id))
  const allSelected = () => { const ids = currentListIds(); return ids.length > 0 && ids.every(id => selected.has(id)) }
  const toggleAll = () => { const ids = currentListIds(); setSelected(prev => { const n = new Set(prev); const all = ids.every(id => n.has(id)); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n }) }

  return (
    <AppLayout title="Consulta de Competências">
      <div className="space-y-4">
        {/* Filtros */}
        <div className="ds-card ds-card-pad space-y-3">
          <div className="flex items-center gap-2"><Filter size={15} style={{ color: 'var(--primary)' }} /><span className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Filtros</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MultiSelect label="Nome" placeholder="Buscar e selecionar nomes…" options={data?.filters.names ?? []} selected={names} onChange={setNames} />
            <MultiSelect label="Módulo (competência)" placeholder="Ex.: Faturamento, Financeiro, ADVPL…" options={data?.filters.modules ?? []} selected={modules} onChange={setModules} />
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Classificação <span style={{ color: 'var(--text-light)' }}>(uma ou mais)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {(data?.filters.classifications ?? []).map(c => {
                const on = classifications.includes(c.value)
                return <button key={c.value} type="button" onClick={() => toggleClassif(c.value)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}>{c.label}</button>
              })}
              {classifications.length > 0 && <button type="button" onClick={() => setClassifications([])} style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>limpar</button>}
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Área de conhecimento <span style={{ color: 'var(--text-light)' }}>(uma ou mais)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {(data?.filters.categories ?? []).map(c => {
                const on = categories.includes(c)
                return <button key={c} type="button" onClick={() => toggleCat(c)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}>{c}</button>
              })}
              {categories.length > 0 && <button type="button" onClick={() => setCategories([])} style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>limpar</button>}
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Nível <span style={{ color: 'var(--text-light)' }}>(um ou mais)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {(data?.filters.levels ?? []).map(l => {
                const on = levelWeights.includes(String(l.weight))
                return <button key={l.weight} type="button" onClick={() => toggleLevel(String(l.weight))} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}>{l.name}</button>
              })}
              {levelWeights.length > 0 && <button type="button" onClick={() => setLevelWeights([])} style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>limpar</button>}
            </div>
          </div>
        </div>

        {loading && !data ? <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div> : data && (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={ClipboardList} label="Pesquisas ativas" value={data.surveys.open} sub={`${data.surveys.total} no total`} />
            <Kpi icon={TrendingUp} label="Taxa de resposta" value={`${data.response_rate.rate}%`} sub={`${data.response_rate.submitted}/${data.response_rate.invited}`} accent />
            <Kpi icon={Users} label="Usuários" value={data.respondents.length} sub="no filtro" />
            <Kpi icon={ClipboardList} label={detailed ? 'Competências' : 'Pendentes'} value={detailed ? data.skill_rows.length : data.response_rate.pending} sub={detailed ? 'no filtro' : 'aguardando'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SkillList title="Mais fortes" icon={TrendingUp} rows={data.strongest} accent="var(--success)" />
            <SkillList title="Menor domínio" icon={TrendingDown} rows={data.weakest} accent="var(--warning)" />
          </div>

          {/* Lista */}
          <div className="ds-card ds-card-pad">
            <div className="flex items-center gap-2 mb-3"><Users size={15} style={{ color: 'var(--primary)' }} /><h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{detailed ? 'Competências por usuário' : 'Usuários'}</h3><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detailed ? data.skill_rows.length : data.respondents.length}</span></div>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 mb-3 flex-wrap" style={{ background: 'var(--primary-soft)', borderRadius: 8, padding: '10px 12px' }}>
                <span className="text-sm" style={{ color: 'var(--primary)', fontWeight: 600 }}>{selected.size} selecionado(s)</span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>→ alterar classificação para:</span>
                <select className="ds-input" style={{ width: 'auto' }} value={bulkValue} onChange={e => setBulkValue(e.target.value)}>
                  <option value="">— (sem classificação)</option>
                  {data.filters.classifications.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button className="ds-btn-primary" onClick={applyBulk}>Aplicar</button>
                <button className="ds-btn-secondary" onClick={() => setSelected(new Set())}>Limpar</button>
              </div>
            )}

            {detailed ? (
              data.skill_rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma competência no filtro atual.</p> : (
                <div style={{ overflowX: 'auto', maxHeight: 620 }}>
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                        <th className="py-2 pr-2"><input type="checkbox" checked={allSelected()} onChange={toggleAll} /></th>
                        <Th label="Nome" sortKey="name" sort={sort} onSort={clickSort} />
                        <Th label="Área de conhecimento" sortKey="category" sort={sort} onSort={clickSort} />
                        <Th label="Módulo" sortKey="module" sort={sort} onSort={clickSort} />
                        <Th label="Nível" sortKey="level" sort={sort} onSort={clickSort} />
                        <Th label="Tipo" sortKey="classification" sort={sort} onSort={clickSort} />
                        <Th label="Valor" sortKey="valor" sort={sort} onSort={clickSort} />
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSkillRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', background: r.blacklist ? 'var(--danger-bg)' : undefined }}>
                          <td className="py-2 pr-2"><input type="checkbox" checked={selected.has(r.respondent_id)} onChange={() => toggleSel(r.respondent_id)} /></td>
                          <td className="py-2 pr-3"><Link href={`/competencias/profissionais/${r.respondent_id}`} className="flex items-center gap-1.5" style={{ color: 'var(--text)', textDecoration: 'none' }}>{r.blacklist && <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />}{r.name}</Link></td>
                          <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{r.category}</td>
                          <td className="py-2 pr-3">{r.module}</td>
                          <td className="py-2 pr-3"><span style={{ fontSize: 12, fontWeight: 600, color: levelColor(r.weight) }}>{r.level}</span></td>
                          <td className="py-2 pr-3">
                            <select value={r.classification ?? ''} onChange={e => setClassificationFor(r.respondent_id, e.target.value)} className={classClass(r.classification)} style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'transparent', cursor: 'pointer' }}>
                              <option value="">—</option>
                              {data.filters.classifications.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{fmtValor(r.valor)}</td>
                          <td className="py-2"><Link href={`/competencias/profissionais/${r.respondent_id}`}><ChevronRight size={15} style={{ color: 'var(--text-muted)' }} /></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              data.respondents.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum usuário no filtro atual.</p> : (
                <div style={{ overflowX: 'auto', maxHeight: 620 }}>
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                        <th className="py-2 pr-2"><input type="checkbox" checked={allSelected()} onChange={toggleAll} /></th>
                        <Th label="Nome" sortKey="name" sort={sort} onSort={clickSort} />
                        <Th label="Tipo" sortKey="classification" sort={sort} onSort={clickSort} />
                        <Th label="Parceiro" sortKey="partner" sort={sort} onSort={clickSort} />
                        <Th label="Valor" sortKey="valor" sort={sort} onSort={clickSort} />
                        {filteredPersons && <th className="py-2 pr-3">Nível</th>}{filteredPersons && <th className="py-2 pr-3">Comp.</th>}
                        <Th label="Última" sortKey="last" sort={sort} onSort={clickSort} /><th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRespondents.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', background: r.blacklist ? 'var(--danger-bg)' : undefined }}>
                          <td className="py-2 pr-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                          <td className="py-2 pr-3"><Link href={`/competencias/profissionais/${r.id}`} className="flex items-center gap-1.5" style={{ color: 'var(--text)', textDecoration: 'none' }}>{r.blacklist && <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />}{r.name}</Link></td>
                          <td className="py-2 pr-3">
                            <select value={r.classification ?? ''} onChange={e => setClassificationFor(r.id, e.target.value)} className={classClass(r.classification)} style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'transparent', cursor: 'pointer' }}>
                              <option value="">—</option>
                              {data.filters.classifications.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            {r.classification === 'parceiro' ? (
                              <select value={r.partner_id ?? ''} onChange={e => setPartnerFor(r.id, e.target.value)} className="ds-status-info" style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'transparent', cursor: 'pointer' }}>
                                <option value="">Parceiro…</option>
                                {data.filters.partners.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                              </select>
                            ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{fmtValor(r.valor)}</td>
                          {filteredPersons && <td className="py-2 pr-3">{r.top_level ? <span className="ds-status-info" style={{ fontSize: 10 }}>{r.top_level}</span> : '—'}</td>}
                          {filteredPersons && <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{r.matches ?? '—'}</td>}
                          <td className="py-2 pr-3" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmt(r.last_at)}</td>
                          <td className="py-2"><Link href={`/competencias/profissionais/${r.id}`}><ChevronRight size={16} style={{ color: 'var(--text-muted)' }} /></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>)}
      </div>
    </AppLayout>
  )
}

function MultiSelect({ label, options, selected, onChange, placeholder }: { label: string; options: Opt[]; selected: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const norm = (s: string) => s.toLowerCase()
  const filtered = q ? options.filter(o => norm(o.label).includes(norm(q))).slice(0, 200) : options.slice(0, 200)
  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  return (
    <div style={{ position: 'relative' }}>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}{selected.length > 0 && ` (${selected.length})`}</div>
      <div className="ds-input" style={{ minHeight: 38, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', cursor: 'text' }} onClick={() => setOpen(true)}>
        {selected.map(v => (
          <span key={v} style={{ fontSize: 11, background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 4, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {labelFor(v)}<X size={11} style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); toggle(v) }} />
          </span>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={selected.length ? '' : (placeholder ?? '')} style={{ flex: 1, minWidth: 80, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text)' }} />
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      {open && (<>
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setOpen(false); setQ('') }} />
        <div style={{ position: 'absolute', zIndex: 41, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 260, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)' }}>
          {filtered.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>Nada encontrado</div>}
          {filtered.map(o => {
            const on = selected.includes(o.value)
            return (
              <div key={o.value} onClick={() => toggle(o.value)} className="flex items-center gap-2" style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', background: on ? 'var(--primary-soft)' : 'transparent' }}>
                <input type="checkbox" checked={on} readOnly />
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.category && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{o.category}</span>}
              </div>
            )
          })}
        </div>
      </>)}
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <select className="ds-input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className="ds-card ds-card-pad">
      <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Icon size={14} /><span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span></div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ? 'var(--primary)' : 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{sub}</div>}
    </div>
  )
}

function SkillList({ title, icon: Icon, rows, accent }: { title: string; icon: React.ElementType; rows: SkillRow[]; accent: string }) {
  return (
    <div className="ds-card ds-card-pad">
      <div className="flex items-center gap-2 mb-3"><Icon size={15} style={{ color: accent }} /><h3 className="text-sm truncate" style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</h3></div>
      {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Dados insuficientes.</p>}
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.skill_id}>
            <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
              <span className="truncate" style={{ color: 'var(--text)', maxWidth: '70%' }}>{r.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.avg_weight.toFixed(1)} · {r.with_knowledge_pct}%</span>
            </div>
            <div style={{ height: 5, background: 'var(--surface-hover)', borderRadius: 999, overflow: 'hidden', marginTop: 3 }}>
              <div style={{ width: `${r.avg_weight / 4 * 100}%`, height: '100%', background: accent }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
