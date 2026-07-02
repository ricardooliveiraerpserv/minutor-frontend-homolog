'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader, InlineLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Star, Users as UsersIcon, Save, AlertTriangle, ChevronRight, ChevronDown, Edit3 } from 'lucide-react'

// ── Tipos locais (mantemos aqui pra não acoplar types globais ainda) ─────────
interface Skill {
  id: number
  name: string
  category: string
  parent_id: number | null
  type: 'module' | 'technology' | 'process'
}
interface SkillLevel {
  id: number
  name: string
  weight: number
}
interface ConsultantSkill {
  id: number
  consultant_id: number
  skill_id: number
  level_id: number
  years_experience: number | null
  last_used_at: string | null
  source: 'forms_import' | 'user_input' | 'validated'
  confidence: 'low' | 'medium' | 'high'
  notes: string | null
}
interface ConsultantOption {
  id: number
  name: string
}
interface Gap {
  skill: { id: number; name: string; category: string }
  context: string | null
  required_level: { id: number; name: string; weight: number }
  actual_level: { id: number; name: string; weight: number } | null
  type: 'missing' | 'below'
}
interface GapsResponse {
  consultant_id: number
  total: number
  gaps: Gap[]
}
interface Holder {
  consultant_id: number
  name: string
  level: string
  level_weight: number
  consultant_type: 'internal' | 'candidate' | null
}
interface HoldersResponse {
  skill: { id: number; name: string; category: string }
  min_weight: number | null
  total: number
  holders: Holder[]
}

// ── Helpers de apresentação ──────────────────────────────────────────────────
function gapKey(g: Gap): string {
  return `${g.skill.id}::${g.context ?? ''}`
}

function distanceLabel(actualWeight: number | null | undefined, requiredWeight: number): string {
  if (actualWeight == null) return ''
  const diff = requiredWeight - actualWeight
  if (diff <= 0) return ''
  return ` (-${diff} ${diff === 1 ? 'nível' : 'níveis'})`
}

/** Reduz redundância entre category e context, anexa tag de impacto se detectável. */
function contextLabel(context: string | null, category: string): string {
  if (!context) return category
  let label = context.trim()
  // Remove palavras da category embutidas no context (ex: "Implementação Protheus" + cat "Protheus" → "Implementação")
  const catWords = category.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  catWords.forEach(w => {
    label = label.replace(new RegExp(`\\b${w}\\b`, 'gi'), '').trim()
  })
  label = label.replace(/\s{2,}/g, ' ').replace(/^[-·\s]+|[-·\s]+$/g, '').trim()
  if (!label) label = context
  const c = context.toLowerCase()
  if (/impleme|implant/.test(c)) return `${label} (crítico)`
  if (/suporte|manuten/.test(c))  return `${label} (baixo impacto)`
  return label
}

function actionSuggestion(g: Gap): string {
  if (g.type === 'missing') {
    return `Alocar consultor com nível ${g.required_level.name} · ou treinar (estimativa: alta)`
  }
  const diff = g.required_level.weight - (g.actual_level?.weight ?? 0)
  if (diff >= 2) return `Treinar — gap de ${diff} níveis · ou atuar somente com apoio`
  return 'Pode executar com apoio'
}


export default function MatrizConhecimentoPage() {
  const [consultants, setConsultants]               = useState<ConsultantOption[]>([])
  const [skills, setSkills]                         = useState<Skill[]>([])
  const [levels, setLevels]                         = useState<SkillLevel[]>([])
  const [selectedConsultant, setSelectedConsultant] = useState<number | null>(null)
  const [consultantSkills, setConsultantSkills]     = useState<ConsultantSkill[]>([])
  const [loadingMeta, setLoadingMeta]               = useState(true)
  const [loadingSkills, setLoadingSkills]           = useState(false)
  const [savingSkillId, setSavingSkillId]           = useState<number | null>(null)
  const [gaps, setGaps]                             = useState<Gap[]>([])
  const [loadingGaps, setLoadingGaps]               = useState(false)
  const [expandedGapKey, setExpandedGapKey]         = useState<string | null>(null)
  const [holdersByKey, setHoldersByKey]             = useState<Record<string, Holder[]>>({})
  const [loadingHoldersKey, setLoadingHoldersKey]   = useState<string | null>(null)

  // ── Carrega skills + levels + lista de consultores ──────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingMeta(true)
      try {
        const [meta, users] = await Promise.all([
          api.get<{ skills: Skill[]; levels: SkillLevel[] }>('/skills'),
          api.get<{ items?: ConsultantOption[]; data?: ConsultantOption[] }>('/users?pageSize=500'),
        ])
        setSkills(meta.skills ?? [])
        setLevels(meta.levels ?? [])
        const rawUsers: any[] = Array.isArray((users as any)?.items)
          ? (users as any).items
          : Array.isArray((users as any)?.data)
          ? (users as any).data
          : []
        // Filtra só consultores (type === 'consultor' OU consultant_type setado)
        const filtered = rawUsers
          .filter(u => u?.type === 'consultor' || u?.consultant_type)
          .map(u => ({ id: u.id, name: u.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        setConsultants(filtered)
      } catch (err) {
        toast.error('Erro ao carregar dados iniciais')
      } finally {
        setLoadingMeta(false)
      }
    })()
  }, [])

  // Deep-link: ?consultor=N auto-seleciona o consultor (window.location pra evitar Suspense boundary)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const consultorParam = params.get('consultor')
    if (consultorParam) {
      const n = Number(consultorParam)
      if (!isNaN(n)) setSelectedConsultant(n)
    }
  }, [])

  // ── Carrega skills do consultor selecionado ────────────────────────────────
  const loadConsultantSkills = useCallback(async (consultantId: number) => {
    setLoadingSkills(true)
    setLoadingGaps(true)
    try {
      const [data, gapsData] = await Promise.all([
        api.get<ConsultantSkill[]>(`/consultants/${consultantId}/skills`),
        api.get<GapsResponse>(`/consultants/${consultantId}/gaps`).catch(() => null),
      ])
      setConsultantSkills(Array.isArray(data) ? data : [])
      setGaps(gapsData?.gaps ?? [])
    } catch {
      toast.error('Erro ao carregar skills do consultor')
      setConsultantSkills([])
      setGaps([])
    } finally {
      setLoadingSkills(false)
      setLoadingGaps(false)
    }
  }, [])

  useEffect(() => {
    setExpandedGapKey(null)
    setHoldersByKey({})
    if (selectedConsultant != null) {
      loadConsultantSkills(selectedConsultant)
    } else {
      setConsultantSkills([])
      setGaps([])
    }
  }, [selectedConsultant, loadConsultantSkills])

  const toggleHolders = useCallback(async (g: Gap) => {
    const key = gapKey(g)
    if (expandedGapKey === key) {
      setExpandedGapKey(null)
      return
    }
    setExpandedGapKey(key)
    if (holdersByKey[key]) return // cache
    setLoadingHoldersKey(key)
    try {
      const data = await api.get<HoldersResponse>(
        `/skills/${g.skill.id}/holders?min_level_id=${g.required_level.id}`
      )
      setHoldersByKey(prev => ({ ...prev, [key]: data.holders ?? [] }))
    } catch {
      toast.error('Erro ao carregar quem possui essa skill')
      setHoldersByKey(prev => ({ ...prev, [key]: [] }))
    } finally {
      setLoadingHoldersKey(null)
    }
  }, [expandedGapKey, holdersByKey])

  // ── Mapa skill_id → consultant_skill pra lookup rápido ──────────────────────
  const csBySkill = useMemo(() => {
    const m = new Map<number, ConsultantSkill>()
    consultantSkills.forEach(cs => m.set(cs.skill_id, cs))
    return m
  }, [consultantSkills])

  // ── Skills agrupadas por categoria ──────────────────────────────────────────
  const skillsByCategory = useMemo(() => {
    const groups = new Map<string, Skill[]>()
    skills.forEach(s => {
      const arr = groups.get(s.category) ?? []
      arr.push(s)
      groups.set(s.category, arr)
    })
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([cat, arr]) => [cat, arr.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))] as const)
  }, [skills])

  // ── Edita nível inline (salva automaticamente) ──────────────────────────────
  async function handleLevelChange(skill: Skill, newLevelId: number | '') {
    if (!selectedConsultant) return
    if (newLevelId === '') {
      // Limpar nível: por simplicidade, não excluímos — pulamos
      // (delete não está no spec; sobrescrever nível é a única operação suportada)
      return
    }
    setSavingSkillId(skill.id)
    try {
      const saved = await api.post<ConsultantSkill>(
        `/consultants/${selectedConsultant}/skills`,
        { skill_id: skill.id, level_id: newLevelId, source: 'user_input', confidence: 'medium' }
      )
      // Atualiza otimista do state — sem refetch (eventual consistency segura aqui pois é uma só linha)
      setConsultantSkills(prev => {
        const idx = prev.findIndex(cs => cs.skill_id === skill.id)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = { ...next[idx], ...saved }
          return next
        }
        return [...prev, saved]
      })
      toast.success(`Nível salvo: ${skill.name}`)
    } catch {
      toast.error(`Erro ao salvar ${skill.name}`)
    } finally {
      setSavingSkillId(null)
    }
  }

  return (
    <AppLayout title="Matriz de Conhecimento">
      <div className="space-y-4">

        {/* ── Seletor de consultor ──────────────────────────────────────────── */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center gap-3 mb-3">
            <UsersIcon size={18} style={{ color: 'var(--text-muted)' }} />
            <h2 className="ds-card-title" style={{ fontSize: 14, margin: 0 }}>Consultor</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="ds-input"
              style={{ flex: 1 }}
              value={selectedConsultant ?? ''}
              onChange={(e) => setSelectedConsultant(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingMeta}
            >
              <option value="">— Selecione um consultor —</option>
              {consultants.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedConsultant && (
              <Link
                href={`/perfil-skills/${selectedConsultant}`}
                style={{
                  fontSize: 12, padding: '7px 12px',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent',
                  color: 'var(--primary)',
                  border: '1px solid var(--primary)',
                  borderRadius: 4, fontWeight: 600,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                <Edit3 size={12} />
                Editar perfil
              </Link>
            )}
          </div>
          {loadingMeta && (
            <InlineLoader label="Carregando consultores…" className="mt-2" />
          )}
        </div>

        {/* ── Gaps críticos ──────────────────────────────────────────────── */}
        {selectedConsultant && !loadingGaps && gaps.length > 0 && (() => {
          // Sort: missing por required_level desc; below por (req - actual) desc.
          const missingGaps = gaps
            .filter(g => g.type === 'missing')
            .slice()
            .sort((a, b) => b.required_level.weight - a.required_level.weight
                          || a.skill.name.localeCompare(b.skill.name, 'pt-BR'))
          const belowGaps = gaps
            .filter(g => g.type === 'below')
            .slice()
            .sort((a, b) => {
              const da = a.required_level.weight - (a.actual_level?.weight ?? 0)
              const db = b.required_level.weight - (b.actual_level?.weight ?? 0)
              return db - da
                  || b.required_level.weight - a.required_level.weight
                  || a.skill.name.localeCompare(b.skill.name, 'pt-BR')
            })

          const renderHoldersInline = (g: Gap) => {
            const key = gapKey(g)
            const expanded = expandedGapKey === key
            const list = holdersByKey[key]
            const loading = loadingHoldersKey === key
            return (
              <>
                <button
                  type="button"
                  onClick={() => toggleHolders(g)}
                  className="flex items-center gap-1"
                  style={{
                    marginTop: 10, fontSize: 11, color: 'var(--text-muted)',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                    fontWeight: 500,
                  }}
                >
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    {expanded ? 'Ocultar quem possui' : 'Ver quem possui'}
                  </span>
                </button>
                {expanded && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    {loading && (
                      <InlineLoader />
                    )}
                    {!loading && list && list.length === 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Ninguém alcança {g.required_level.name} ainda.
                      </p>
                    )}
                    {!loading && list && list.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {list.map(h => (
                          <span
                            key={h.consultant_id}
                            title={`${h.level}${h.consultant_type === 'candidate' ? ' · candidato' : ''}`}
                            style={{
                              fontSize: 11, color: 'var(--text)',
                              border: '1px solid var(--border)', borderRadius: 4,
                              padding: '2px 8px', fontWeight: 500,
                              background: h.consultant_type === 'candidate'
                                ? 'transparent' : 'var(--surface-hover, transparent)',
                            }}
                          >
                            {h.name} <span style={{ color: 'var(--text-muted)' }}>· {h.level}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          }

          return (
          <div className="ds-card ds-card-pad ds-card-highlight-danger">
            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
              <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
              <h3 style={{ fontSize: 14, margin: 0, color: 'var(--danger)', fontWeight: 600 }}>Gaps críticos</h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              {gaps.length} {gaps.length === 1 ? 'skill abaixo' : 'skills abaixo'} do requerido
            </p>

            {missingGaps.length > 0 && (
              <div style={{ marginBottom: belowGaps.length > 0 ? 28 : 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Crítico — {missingGaps.length} {missingGaps.length === 1 ? 'skill' : 'skills'} sem cobertura
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {missingGaps.map(g => (
                    <div
                      key={`m-${gapKey(g)}`}
                      style={{ background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)', borderRadius: 8, padding: '14px' }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span style={{
                            fontSize: 11, background: 'var(--primary-soft)', color: 'var(--primary)',
                            padding: '4px 10px', borderRadius: 4, fontWeight: 600,
                            letterSpacing: '0.02em', textTransform: 'uppercase', flexShrink: 0,
                          }}>
                            {g.required_level.name}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm truncate" style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {g.skill.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                              Contexto: {contextLabel(g.context, g.skill.category)}
                            </div>
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, color: 'var(--danger)',
                          border: '1px dashed var(--danger-border)',
                          padding: '6px 12px', borderRadius: 4, fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.02em', flexShrink: 0,
                        }}>
                          não possui
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                        ↪ {actionSuggestion(g)}
                      </p>
                      {renderHoldersInline(g)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {belowGaps.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Moderado — {belowGaps.length} abaixo do requerido
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {belowGaps.map(g => (
                    <div
                      key={`b-${gapKey(g)}`}
                      style={{
                        borderLeft: '3px solid var(--warning-border)',
                        borderRadius: 4,
                        padding: '12px 14px 12px 12px',
                      }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span style={{
                            fontSize: 11, background: 'var(--primary-soft)', color: 'var(--primary)',
                            padding: '4px 10px', borderRadius: 4, fontWeight: 600,
                            letterSpacing: '0.02em', textTransform: 'uppercase', flexShrink: 0,
                          }}>
                            {g.required_level.name}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm truncate" style={{ color: 'var(--text)', fontWeight: 500 }}>
                              {g.skill.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                              Contexto: {contextLabel(g.context, g.skill.category)}
                            </div>
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, color: 'var(--warning)',
                          border: '1px solid var(--warning-border)', background: 'transparent',
                          padding: '6px 12px', borderRadius: 4, fontWeight: 600, flexShrink: 0,
                        }}>
                          {g.actual_level?.name}{distanceLabel(g.actual_level?.weight, g.required_level.weight)}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                        ↪ {actionSuggestion(g)}
                      </p>
                      {renderHoldersInline(g)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {selectedConsultant && !loadingGaps && gaps.length === 0 && (
          <div className="ds-card ds-card-pad ds-card-highlight-success">
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              ✓ Sem gaps críticos.
            </p>
          </div>
        )}

        {/* ── Skills agrupadas ──────────────────────────────────────────────── */}
        {selectedConsultant && (
          <>
            {loadingSkills && (
              <div className="ds-card ds-card-pad">
                <SectionLoader label="Carregando skills…" />
              </div>
            )}

            {!loadingSkills && skills.length === 0 && (
              <div className="ds-card ds-card-pad">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nenhuma skill cadastrada ainda. Skills serão importadas posteriormente.
                </p>
              </div>
            )}

            {!loadingSkills && skillsByCategory.map(([category, items]) => (
              <div key={category} className="ds-card ds-card-pad">
                <div className="ds-card-header" style={{ paddingBottom: 8 }}>
                  <div className="flex items-center gap-2">
                    <Star size={14} style={{ color: 'var(--primary)' }} />
                    <h3 className="ds-card-title" style={{ fontSize: 13, margin: 0 }}>{category}</h3>
                    <span className="ds-card-sub" style={{ marginLeft: 8 }}>{items.length} skill{items.length === 1 ? '' : 's'}</span>
                  </div>
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {items.map(skill => {
                    const cs = csBySkill.get(skill.id)
                    const currentLevelId = cs?.level_id ?? ''
                    const saving = savingSkillId === skill.id
                    return (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between gap-4 py-2.5"
                        style={{ borderTop: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm truncate" style={{ color: 'var(--text)' }}>{skill.name}</span>
                          {cs?.source === 'forms_import' && (
                            <span className="ds-status ds-status-info" style={{ fontSize: 10 }}>forms</span>
                          )}
                          {cs?.source === 'validated' && (
                            <span className="ds-status ds-status-success" style={{ fontSize: 10 }}>validado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {saving && <Save size={12} className="animate-pulse" style={{ color: 'var(--text-muted)' }} />}
                          <select
                            className="ds-input"
                            style={{ minWidth: 160 }}
                            value={currentLevelId}
                            onChange={(e) => handleLevelChange(skill, e.target.value ? Number(e.target.value) : '')}
                            disabled={saving}
                          >
                            <option value="">— sem nível —</option>
                            {levels.map(l => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {!selectedConsultant && !loadingMeta && (
          <div className="ds-card ds-card-pad">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Selecione um consultor acima para editar suas skills.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
