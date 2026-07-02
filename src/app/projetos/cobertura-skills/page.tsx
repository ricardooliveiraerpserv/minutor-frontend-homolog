'use client'

import { AppLayout } from '@/components/layout/app-layout'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { UserCheck, FolderOpen, AlertTriangle, CheckCircle2, Sparkles, Plus, AlertOctagon, Users, Flame, Check } from 'lucide-react'
import { SectionLoader, InlineLoader } from '@/components/ui/loading'

interface ProjectOption {
  id: number
  name: string
  code?: string
}

interface CoverageMissing {
  consultant_id: number
  name: string
  actual_level: string | null
  type: 'missing' | 'below'
}
interface CoverageCovering {
  consultant_id: number
  name: string
  level: string
}
interface RequiredSkillCoverage {
  skill: { id: number; name: string; category: string }
  required_level: { id: number; name: string; weight: number }
  consultants_total: number
  consultants_covering: number
  covering: CoverageCovering[]
  missing: CoverageMissing[]
}
interface CoverageResponse {
  project: { id: number; name: string; consultants_count: number }
  required_skills: RequiredSkillCoverage[]
}

interface RecommendationGap {
  skill: { id: number; name: string; category: string }
  required_level: string
  actual_level: string | null
  type: 'missing' | 'below'
}
interface Recommendation {
  consultant_id: number
  name: string
  score: number
  base_score?: number
  bonus?: number
  availability: number
  capacity_hours?: number
  allocated_hours?: number
  coverage: 'Completo' | 'Parcial' | 'Insuficiente'
  skills_match: number
  skills_total: number
  type: 'internal' | 'partner' | 'candidate'
  pending?: boolean
  gaps: RecommendationGap[]
}
interface RecommendationsResponse {
  project: { id: number; name: string }
  required_count?: number
  recommendations: Recommendation[]
  message?: string
}

interface MatchRow {
  consultant_id: number
  name: string
  email: string
  status: 'new' | 'screening' | 'approved' | 'rejected' | 'hired' | 'allocated'
  is_pending: boolean
  triage_score: number
  availability: number
  match_score: number
  fit: 'Alto' | 'Médio' | 'Baixo'
  coverage: { covered: number; total: number; ratio: number }
  skill_score: number
  avg_skill_weight: number
  protheus_years_experience: number | null
  penalties: string[]
  missing_critical: boolean
  gaps: RecommendationGap[]
}
interface CandidateMatchResponse {
  project: { id: number; name: string }
  required_count?: number
  matches: MatchRow[]
  message?: string
}

interface TeamMember {
  consultant_id: number
  name: string
  type: 'internal' | 'partner' | 'candidate'
  availability: number
  score: number
  skills_covered_count: number
  skills_covered: Array<{ id: number; name: string; category: string; required_level: string }>
}
interface TeamRecoResponse {
  project: { id: number; name: string }
  team: TeamMember[]
  coverage: { total: number; covered: number; missing: number }
  team_score: number
  gaps_remaining: Array<{ id: number; name: string; category: string; required_level: string }>
  message?: string
}

export default function CoberturaSkillsPage() {
  const [projects, setProjects]                 = useState<ProjectOption[]>([])
  const [loadingProjects, setLoadingProjects]   = useState(true)
  const [selectedProject, setSelectedProject]   = useState<number | null>(null)
  const [coverage, setCoverage]                 = useState<CoverageResponse | null>(null)
  const [loadingCoverage, setLoadingCoverage]   = useState(false)
  const [recos, setRecos]                       = useState<Recommendation[]>([])
  const [loadingRecos, setLoadingRecos]         = useState(false)
  const [allocatingId, setAllocatingId]         = useState<number | null>(null)
  const [team, setTeam]                         = useState<TeamRecoResponse | null>(null)
  const [loadingTeam, setLoadingTeam]           = useState(false)
  const [allocatingTeam, setAllocatingTeam]     = useState(false)
  const [triageQueueCount, setTriageQueueCount] = useState(0)
  const [matchRows, setMatchRows]               = useState<MatchRow[]>([])
  const [loadingMatch, setLoadingMatch]         = useState(false)

  useEffect(() => {
    (async () => {
      setLoadingProjects(true)
      try {
        const r = await api.get<{ items?: ProjectOption[]; data?: ProjectOption[] }>('/projects?pageSize=500')
        const arr: any[] = Array.isArray((r as any)?.items)
          ? (r as any).items
          : Array.isArray((r as any)?.data)
          ? (r as any).data
          : []
        const opts = arr
          .map(p => ({ id: p.id, name: p.name, code: p.code }))
          .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, 'pt-BR'))
        setProjects(opts)
      } catch {
        toast.error('Erro ao carregar projetos')
      } finally {
        setLoadingProjects(false)
      }
    })()
  }, [])

  const loadCoverage = useCallback(async (projectId: number) => {
    setLoadingCoverage(true)
    try {
      const data = await api.get<CoverageResponse>(`/projects/${projectId}/gaps`)
      setCoverage(data)
    } catch {
      toast.error('Erro ao carregar cobertura')
      setCoverage(null)
    } finally {
      setLoadingCoverage(false)
    }
  }, [])

  const loadRecos = useCallback(async (projectId: number) => {
    setLoadingRecos(true)
    try {
      const data = await api.get<RecommendationsResponse>(`/projects/${projectId}/recommendations`)
      setRecos(data.recommendations ?? [])
    } catch {
      toast.error('Erro ao carregar recomendações')
      setRecos([])
    } finally {
      setLoadingRecos(false)
    }
  }, [])

  const loadTeam = useCallback(async (projectId: number) => {
    setLoadingTeam(true)
    try {
      const data = await api.get<TeamRecoResponse>(`/projects/${projectId}/team-recommendation`)
      setTeam(data)
    } catch {
      toast.error('Erro ao carregar equipe sugerida')
      setTeam(null)
    } finally {
      setLoadingTeam(false)
    }
  }, [])

  const allocateTeamFn = useCallback(async () => {
    if (selectedProject == null || !team || team.team.length === 0) return
    const beforeCovered = countCovered(coverage)
    const totalRequired = coverage?.required_skills.length ?? 0
    setAllocatingTeam(true)
    try {
      const consultant_ids = team.team.map(m => m.consultant_id)
      const risk_flags     = team.team.map(m => m.score < 0.9)
      const risk_reasons   = team.team.map(m =>
        m.score < 0.9 ? `Time auto · score ${Math.round(m.score * 100)}%` : null
      )
      const r = await api.post<{ allocated_count: number }>(
        `/projects/${selectedProject}/allocate-team`,
        { consultant_ids, risk_flags, risk_reasons }
      )
      // Refetch tudo
      const [refreshedCov] = await Promise.all([
        api.get<CoverageResponse>(`/projects/${selectedProject}/gaps`),
        loadRecos(selectedProject),
        loadTeam(selectedProject),
      ])
      setCoverage(refreshedCov)
      const afterCovered = countCovered(refreshedCov)
      const delta = afterCovered - beforeCovered
      toast.success(
        `✓ ${r.allocated_count} consultor${r.allocated_count === 1 ? '' : 'es'} alocado${r.allocated_count === 1 ? '' : 's'}` +
        (totalRequired > 0
          ? ` · cobertura ${beforeCovered}/${totalRequired} → ${afterCovered}/${totalRequired}`
          : '')
      )
    } catch {
      toast.error('Erro ao alocar equipe')
    } finally {
      setAllocatingTeam(false)
    }
  }, [selectedProject, team, coverage, loadRecos, loadTeam])

  const loadCandidateMatch = useCallback(async (projectId: number) => {
    setLoadingMatch(true)
    try {
      const r = await api.get<CandidateMatchResponse>(`/projects/${projectId}/candidate-match`)
      setMatchRows(r.matches ?? [])
    } catch {
      setMatchRows([])
    } finally {
      setLoadingMatch(false)
    }
  }, [])

  const approveCandidate = useCallback(async (m: MatchRow) => {
    setAllocatingId(m.consultant_id)
    try {
      await api.patch(`/candidates/${m.consultant_id}/status`, { status: 'approved' })
      toast.success(`✓ ${m.name} aprovado — clique em Alocar pra adicionar ao projeto`)
      // Otimisticamente: marca essa row como não-pending; libera botão Alocar
      setMatchRows(prev => prev.map(x =>
        x.consultant_id === m.consultant_id
          ? { ...x, is_pending: false, status: 'approved' as const }
          : x
      ))
      // Atualiza também triage queue count
      api.get<{ total: number }>('/candidates/triage-queue?limit=10')
        .then(r => setTriageQueueCount(r.total ?? 0))
        .catch(() => {})
    } catch {
      toast.error(`Erro ao aprovar ${m.name}`)
    } finally {
      setAllocatingId(null)
    }
  }, [])

  const allocateCandidate = useCallback(async (m: MatchRow) => {
    if (selectedProject == null) return
    if (m.is_pending) {
      toast.error('Aprove o candidato antes de alocar.')
      return
    }
    const beforeCovered = countCovered(coverage)
    const totalRequired = coverage?.required_skills.length ?? 0
    setAllocatingId(m.consultant_id)
    try {
      await api.post(`/projects/${selectedProject}/allocate`, {
        consultant_id: m.consultant_id,
        score: m.match_score,
        with_caveat: m.match_score < 0.9,
        risk_reason: m.match_score < 0.9
          ? `Candidato · match ${Math.round(m.match_score * 100)}% · ${m.coverage.covered}/${m.coverage.total} skills`
          : null,
      })
      setMatchRows(prev => prev.filter(x => x.consultant_id !== m.consultant_id))
      const refreshedCov = await api.get<CoverageResponse>(`/projects/${selectedProject}/gaps`)
      setCoverage(refreshedCov)
      // Atualiza recommendations/team/triage também
      loadRecos(selectedProject)
      loadTeam(selectedProject)
      loadCandidateMatch(selectedProject)
      const afterCovered = countCovered(refreshedCov)
      const tag = totalRequired > 0
        ? ` · cobertura ${beforeCovered}/${totalRequired} → ${afterCovered}/${totalRequired}`
        : ''
      toast.success(`✓ ${m.name} alocado${tag}`)
    } catch {
      toast.error(`Erro ao alocar ${m.name}`)
    } finally {
      setAllocatingId(null)
    }
  }, [selectedProject, coverage, loadRecos, loadTeam, loadCandidateMatch])

  const countCovered = (cov: CoverageResponse | null): number =>
    cov?.required_skills.filter(s => s.consultants_covering > 0).length ?? 0

  const allocate = useCallback(async (r: Recommendation, withCaveat: boolean) => {
    if (selectedProject == null) return
    const beforeCovered = countCovered(coverage)
    const totalRequired = coverage?.required_skills.length ?? 0
    setAllocatingId(r.consultant_id)
    try {
      await api.post(`/projects/${selectedProject}/allocate`, {
        consultant_id: r.consultant_id,
        score: r.score,
        with_caveat: withCaveat,
        risk_reason: withCaveat
          ? `Score ${Math.round(r.score * 100)}% · ${r.skills_match}/${r.skills_total} skills cobertas`
          : null,
      })
      // Atualização otimista: remove o consultor da lista local
      setRecos(prev => prev.filter(x => x.consultant_id !== r.consultant_id))
      // Refetch coverage e usa o RESULT pra calcular delta
      const refreshed = await api.get<CoverageResponse>(`/projects/${selectedProject}/gaps`)
      setCoverage(refreshed)
      const afterCovered = countCovered(refreshed)
      const delta = afterCovered - beforeCovered
      const tag = withCaveat ? ' com ressalva' : ''
      if (totalRequired > 0 && delta > 0) {
        toast.success(`✓ ${r.name} alocado${tag} · cobertura ${beforeCovered}/${totalRequired} → ${afterCovered}/${totalRequired}`)
      } else if (totalRequired > 0) {
        toast.success(`✓ ${r.name} alocado${tag} · cobertura mantida em ${afterCovered}/${totalRequired}`)
      } else {
        toast.success(`✓ ${r.name} alocado${tag}`)
      }
    } catch {
      toast.error(`Erro ao alocar ${r.name}`)
    } finally {
      setAllocatingId(null)
    }
  }, [selectedProject, coverage])

  useEffect(() => {
    // Triage queue é independente do projeto selecionado
    api.get<{ triage_queue: any[]; total: number }>('/candidates/triage-queue?limit=10')
      .then(r => setTriageQueueCount(r.total ?? 0))
      .catch(() => setTriageQueueCount(0))
  }, [])

  // Deep-link: ?project=N seleciona projeto (window.location pra evitar Suspense boundary)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const projectParam = params.get('project')
    if (projectParam) {
      const n = Number(projectParam)
      if (!isNaN(n)) setSelectedProject(n)
    }
  }, [])

  useEffect(() => {
    if (selectedProject != null) {
      loadCoverage(selectedProject)
      loadRecos(selectedProject)
      loadTeam(selectedProject)
      loadCandidateMatch(selectedProject)
    } else {
      setCoverage(null)
      setRecos([])
      setTeam(null)
      setMatchRows([])
    }
  }, [selectedProject, loadCoverage, loadRecos, loadTeam, loadCandidateMatch])

  const summary = useMemo(() => {
    if (!coverage) return null
    const total = coverage.required_skills.length
    if (total === 0) return null
    const fullyCovered = coverage.required_skills.filter(
      s => s.consultants_total > 0 && s.consultants_covering === s.consultants_total
    ).length
    const noCoverage = coverage.required_skills.filter(s => s.consultants_covering === 0).length
    return { total, fullyCovered, noCoverage }
  }, [coverage])

  return (
    <AppLayout title="Cobertura de Skills">
      <div className="space-y-4">

        {/* Seletor de projeto */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center gap-3 mb-3">
            <FolderOpen size={18} style={{ color: 'var(--text-muted)' }} />
            <h2 className="ds-card-title" style={{ fontSize: 14, margin: 0 }}>Projeto</h2>
          </div>
          <select
            className="ds-input w-full"
            value={selectedProject ?? ''}
            onChange={(e) => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingProjects}
          >
            <option value="">— Selecione um projeto —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} — ${p.name}` : p.name}
              </option>
            ))}
          </select>
          {loadingProjects && (
            <div className="mt-2"><InlineLoader label="Carregando projetos…" /></div>
          )}
        </div>

        {/* Conteúdo da cobertura */}
        {selectedProject && loadingCoverage && (
          <div className="ds-card ds-card-pad">
            <SectionLoader label="Carregando cobertura…" />
          </div>
        )}

        {selectedProject && !loadingCoverage && coverage && coverage.required_skills.length === 0 && (
          <div className="ds-card ds-card-pad">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Nenhuma skill exigida cadastrada para este projeto. Configure via{' '}
              <code style={{ background: 'var(--surface-hover)', padding: '1px 4px', borderRadius: 3 }}>
                POST /api/v1/projects/{coverage.project.id}/required-skills
              </code>.
            </p>
          </div>
        )}

        {/* ── Banner: candidatos pré-triagem com potencial ──────────────── */}
        {selectedProject && triageQueueCount > 0 && (
          <div className="ds-card ds-card-pad ds-card-highlight-warning"
               style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="flex items-center gap-2">
              <Flame size={16} style={{ color: 'var(--warning-border)' }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  {triageQueueCount} {triageQueueCount === 1 ? 'candidato com potencial' : 'candidatos com potencial'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Candidatos em triagem com score ≥ 80 — alguns podem caber neste projeto
                </p>
              </div>
            </div>
            <Link
              href="/candidatos"
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 4,
                background: 'transparent', border: '1px solid var(--warning-border)',
                color: 'var(--warning)', fontWeight: 600, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              Ver candidatos →
            </Link>
          </div>
        )}

        {summary && (
          <div className="ds-card ds-card-pad">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skills exigidas</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{summary.total}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>100% cobertas</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{summary.fullyCovered}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sem cobertura</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{summary.noCoverage}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Consultores alocados</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{coverage?.project.consultants_count}</p>
              </div>
            </div>
          </div>
        )}

        {coverage?.required_skills.map(rs => {
          const pct = rs.consultants_total > 0
            ? Math.round((rs.consultants_covering / rs.consultants_total) * 100)
            : 0
          const isFull = rs.consultants_total > 0 && rs.consultants_covering === rs.consultants_total
          const isNone = rs.consultants_covering === 0
          const highlightClass = isFull
            ? 'ds-card-highlight-success'
            : isNone
            ? 'ds-card-highlight-danger'
            : 'ds-card-highlight-warning'

          return (
            <div key={rs.skill.id} className={`ds-card ds-card-pad ${highlightClass}`}>
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isFull ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--success-border, var(--text))' }} />
                  ) : (
                    <AlertTriangle size={14} style={{ color: 'var(--warning-border, var(--text))' }} />
                  )}
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{rs.skill.name}</span>
                  <span className="ds-card-sub" style={{ fontSize: 11 }}>{rs.skill.category}</span>
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span className="ds-status ds-status-info">requer {rs.required_level.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {rs.consultants_covering}/{rs.consultants_total} ({pct}%)
                  </span>
                </div>
              </div>

              {rs.missing.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    Não cobrem ({rs.missing.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {rs.missing.map(m => (
                      <span
                        key={m.consultant_id}
                        className={`ds-status ${m.type === 'missing' ? 'ds-status-danger' : 'ds-status-warning'}`}
                        style={{ fontSize: 11 }}
                        title={m.type === 'missing' ? 'não possui' : `tem ${m.actual_level}`}
                      >
                        {m.name}{m.type === 'below' && m.actual_level ? ` (${m.actual_level})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {!selectedProject && !loadingProjects && (
          <div className="ds-card ds-card-pad">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Selecione um projeto acima para ver a cobertura de skills dos consultores alocados.
            </p>
          </div>
        )}

        {/* ── Equipe sugerida (auto via greedy set-cover) ───────────────── */}
        {selectedProject && team && team.team.length > 0 && (() => {
          const teamPct = Math.round(team.team_score * 100)
          const covPct = team.coverage.total > 0
            ? Math.round((team.coverage.covered / team.coverage.total) * 100)
            : 0
          const fullyCovered = team.coverage.missing === 0
          const headerColor = fullyCovered ? 'var(--success)' : 'var(--warning)'
          return (
          <div className="ds-card ds-card-pad" style={{ marginTop: 8 }}>
            <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 4 }}>
              <div className="flex items-center gap-2">
                <Users size={16} style={{ color: headerColor }} />
                <h3 style={{ fontSize: 14, margin: 0, color: 'var(--text)', fontWeight: 600 }}>
                  Equipe sugerida
                </h3>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {team.coverage.covered}/{team.coverage.total} skills · {covPct}% cobertura
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--text)',
                  padding: '3px 10px', borderRadius: 4,
                  background: teamPct >= 90 ? 'var(--success-bg)' : teamPct >= 70 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                  border: '1px solid',
                  borderColor: teamPct >= 90 ? 'var(--success-border)' : teamPct >= 70 ? 'var(--warning-border)' : 'var(--danger-border)',
                }}>
                  Score: {teamPct}%
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Time mínimo (até 5 pessoas) escolhido por algoritmo greedy — cobre o máximo de skills exigidas
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {team.team.map((m, idx) => {
                const pct = Math.round(m.score * 100)
                const availPct = Math.round(m.availability * 100)
                const typeBadge = m.type === 'internal' ? 'Interno'
                                : m.type === 'partner'  ? 'Parceiro'
                                : 'Candidato'
                const borderColor = m.score >= 0.9 ? 'var(--success-border)'
                                  : m.score >= 0.7 ? 'var(--warning-border)'
                                  : 'var(--danger-border)'
                return (
                  <div
                    key={m.consultant_id}
                    style={{
                      borderLeft: `3px solid ${borderColor}`,
                      borderRadius: 4,
                      padding: '10px 14px',
                      background: idx === 0 ? 'var(--surface-hover, transparent)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span style={{
                          fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                          minWidth: 18, textAlign: 'right',
                        }}>
                          {idx + 1}.
                        </span>
                        <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>{m.name}</span>
                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)',
                          padding: '1px 6px', borderRadius: 3, fontWeight: 500,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {typeBadge}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
                          · {pct}% · disp {availPct}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap" style={{ justifyContent: 'flex-end' }}>
                        {m.skills_covered.map(sk => (
                          <span key={sk.id} style={{
                            fontSize: 10, color: 'var(--success)',
                            background: 'var(--success-bg)',
                            border: '1px solid var(--success-border)',
                            padding: '2px 7px', borderRadius: 3, fontWeight: 600,
                          }}>
                            {sk.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {team.gaps_remaining.length > 0 && (
              <div style={{
                marginTop: 12, padding: '8px 10px',
                background: 'var(--warning-bg)', borderRadius: 4,
                border: '1px solid var(--warning-border)',
              }}>
                <p style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600 }}>
                  ⚠ Mesmo com esta equipe, {team.gaps_remaining.length} skill{team.gaps_remaining.length === 1 ? '' : 's'} continuam descobertas:
                </p>
                <p style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>
                  {team.gaps_remaining.map(g => `${g.name} (${g.required_level})`).join(' · ')}
                </p>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="ds-btn-primary"
                disabled={allocatingTeam}
                onClick={allocateTeamFn}
                style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Users size={12} />
                {allocatingTeam ? 'Alocando…' : `Alocar equipe completa (${team.team.length})`}
              </button>
            </div>
          </div>
          )
        })()}

        {selectedProject && loadingTeam && (
          <div className="ds-card ds-card-pad" style={{ marginTop: 8 }}>
            <SectionLoader label="Calculando equipe sugerida…" />
          </div>
        )}

        {/* ── Candidatos para este projeto (auto-match) ─────────────────── */}
        {selectedProject && (loadingMatch || matchRows.length > 0) && (
          <div className="ds-card ds-card-pad" style={{ marginTop: 8 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
              <Flame size={16} style={{ color: 'var(--warning-border)' }} />
              <h3 style={{ fontSize: 14, margin: 0, color: 'var(--text)', fontWeight: 600 }}>
                Candidatos para este projeto
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                {matchRows.length} {matchRows.length === 1 ? 'match' : 'matches'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Match auto entre candidatos (approved + pending com triage ≥ 80) e as skills exigidas deste projeto
            </p>

            {loadingMatch && (
              <InlineLoader label="Calculando matches…" />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {matchRows.map(m => {
                const pct = Math.round(m.match_score * 100)
                const fitColor = m.fit === 'Alto'
                  ? { bg: 'var(--success-bg)', fg: 'var(--success)', border: 'var(--success-border)' }
                  : m.fit === 'Médio'
                  ? { bg: 'var(--warning-bg)', fg: 'var(--warning)', border: 'var(--warning-border)' }
                  : { bg: 'var(--danger-bg)', fg: 'var(--danger)', border: 'var(--danger-border)' }
                const allocating = allocatingId === m.consultant_id

                // Compor "motivo" do match
                const reasonParts: string[] = []
                reasonParts.push(`${m.coverage.covered}/${m.coverage.total} skills cobertas`)
                if (m.protheus_years_experience != null) reasonParts.push(`${m.protheus_years_experience} anos Protheus`)
                reasonParts.push(`disp ${Math.round(m.availability * 100)}%`)
                reasonParts.push(`triage ${Math.round(m.triage_score)}`)
                if (m.penalties.includes('critical-skill-missing')) reasonParts.push('⚠ skill crítica ausente')
                if (m.penalties.includes('low-availability')) reasonParts.push('⚠ disp baixa')
                const reason = reasonParts.join(' · ')

                return (
                  <div
                    key={m.consultant_id}
                    style={{
                      borderLeft: `3px solid ${fitColor.border}`,
                      borderRadius: 4,
                      padding: '12px 14px',
                      background: 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>{m.name}</span>
                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)',
                          padding: '1px 6px', borderRadius: 3, fontWeight: 500,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          Candidato
                        </span>
                        {m.is_pending && (
                          <span style={{
                            fontSize: 10, color: 'var(--warning)',
                            background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                            padding: '1px 6px', borderRadius: 3, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }} title={`Status: ${m.status} · ainda não aprovado`}>
                            ⏳ {m.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span style={{
                          fontSize: 14, fontWeight: 700, color: 'var(--text)',
                          minWidth: 44, textAlign: 'right',
                        }}>
                          {pct}%
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          padding: '4px 10px', borderRadius: 4,
                          background: fitColor.bg, color: fitColor.fg,
                          border: `1px solid ${fitColor.border}`,
                        }}>
                          {m.fit}
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                      ↪ {reason}
                    </p>

                    {m.gaps.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span style={{ fontWeight: 600 }}>Gaps:</span>{' '}
                        {m.gaps.slice(0, 4).map((g, i) => (
                          <span key={`${m.consultant_id}-g-${g.skill.id}-${i}`}>
                            {i > 0 && ', '}
                            {g.skill.name} ({g.type === 'missing' ? 'não possui' : `${g.actual_level} → ${g.required_level}`})
                          </span>
                        ))}
                        {m.gaps.length > 4 && ` e mais ${m.gaps.length - 4}`}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
                      {m.is_pending ? (
                        <button
                          type="button"
                          disabled={allocating}
                          onClick={() => approveCandidate(m)}
                          style={{
                            fontSize: 12, padding: '6px 14px', borderRadius: 4,
                            background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                            color: 'var(--success)', fontWeight: 600, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            opacity: allocating ? 0.6 : 1,
                          }}
                          title="Move pra coluna Aprovado antes de alocar (pipeline com revisão)"
                        >
                          <Check size={12} /> Aprovar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ds-btn-primary"
                          disabled={allocating}
                          onClick={() => allocateCandidate(m)}
                          style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Plus size={12} />
                          Alocar
                        </button>
                      )}
                      <Link
                        href={`/perfil-skills/${m.consultant_id}`}
                        style={{
                          fontSize: 12, padding: '6px 12px', borderRadius: 4,
                          background: 'transparent', border: '1px solid var(--border)',
                          color: 'var(--text)', fontWeight: 500, textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        Ver perfil
                      </Link>
                    </div>
                  </div>
                )
              })}
              {!loadingMatch && matchRows.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Nenhum candidato bate com os critérios deste projeto (precisa triage ≥ 50; pending precisa ≥ 80).
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Sugestões de Alocação ─────────────────────────────────────── */}
        {selectedProject && (
          <div className="ds-card ds-card-pad" style={{ marginTop: 8 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
              <Sparkles size={16} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: 14, margin: 0, color: 'var(--text)', fontWeight: 600 }}>
                Sugestões de Alocação
              </h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Top 10 consultores com melhor match para as skills exigidas (exclui já alocados)
            </p>

            {loadingRecos && (
              <InlineLoader label="Carregando recomendações…" />
            )}

            {!loadingRecos && recos.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Sem sugestões disponíveis. Cadastre skills exigidas no projeto e tenha consultores com matriz preenchida.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recos.map((r, idx) => {
                const scorePct = Math.round(r.score * 100)
                const availPct = Math.round(r.availability * 100)
                const okFit   = r.coverage === 'Completo'
                const partial = r.coverage === 'Parcial'
                const showAllGaps = r.score < 0.7
                const badgeStyle = okFit
                  ? { background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'var(--success-border)' }
                  : partial
                  ? { background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: 'var(--warning-border)' }
                  : { background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'var(--danger-border)' }
                const borderLeft = okFit ? 'var(--success-border)'
                                 : partial ? 'var(--warning-border)'
                                 : 'var(--danger-border)'
                const allocating = allocatingId === r.consultant_id
                const typeBadge = r.type === 'internal' ? 'Interno'
                                : r.type === 'partner'  ? 'Parceiro'
                                : 'Candidato'
                const isBest = idx === 0
                const gapsToShow = showAllGaps ? r.gaps : r.gaps.slice(0, 4)
                return (
                  <div
                    key={r.consultant_id}
                    style={{
                      borderLeft: `3px solid ${borderLeft}`,
                      borderRadius: 4,
                      padding: '12px 14px',
                      background: isBest ? 'var(--surface-hover, transparent)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div style={{ minWidth: 0 }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {isBest && (
                              <span title="Melhor opção" style={{ fontSize: 14, lineHeight: 1 }}>🏆</span>
                            )}
                            <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {r.name}
                            </span>
                            <span style={{
                              fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)',
                              padding: '1px 6px', borderRadius: 3, fontWeight: 500,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>
                              {typeBadge}
                            </span>
                            {r.pending && (
                              <span style={{
                                fontSize: 10, color: 'var(--warning)',
                                background: 'var(--warning-bg)',
                                border: '1px solid var(--warning-border)',
                                padding: '1px 6px', borderRadius: 3, fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                              }} title="Em triagem — score alto mas ainda não aprovado">
                                ⏳ pendente
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                            {r.skills_match}/{r.skills_total} skills cobertas
                            <span style={{ marginLeft: 10 }}>Disponível: {availPct}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span style={{
                          fontSize: 14, fontWeight: 700, color: 'var(--text)',
                          minWidth: 44, textAlign: 'right',
                        }}>
                          {scorePct}%
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          padding: '4px 10px', borderRadius: 4,
                          border: '1px solid', ...badgeStyle,
                        }}>
                          {r.coverage}
                        </span>
                      </div>
                    </div>

                    {r.gaps.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        <span style={{ fontWeight: 600 }}>Gaps:</span>{' '}
                        {gapsToShow.map((g, i) => (
                          <span key={`${r.consultant_id}-${g.skill.id}-${i}`}>
                            {i > 0 && ', '}
                            {g.skill.name} ({g.type === 'missing' ? 'não possui' : `${g.actual_level} → ${g.required_level}`})
                          </span>
                        ))}
                        {!showAllGaps && r.gaps.length > 4 && ` e mais ${r.gaps.length - 4}`}
                      </p>
                    )}

                    <div style={{ marginTop: 10 }}>
                      {okFit ? (
                        <button
                          type="button"
                          className="ds-btn-primary"
                          disabled={allocating}
                          onClick={() => allocate(r, false)}
                          style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Plus size={12} />
                          Alocar no projeto
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={allocating}
                          onClick={() => allocate(r, true)}
                          style={{
                            fontSize: 12, padding: '6px 14px',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'transparent',
                            color: 'var(--warning)',
                            border: '1px solid var(--warning-border)',
                            borderRadius: 4,
                            fontWeight: 600,
                            cursor: allocating ? 'wait' : 'pointer',
                            opacity: allocating ? 0.6 : 1,
                          }}
                        >
                          <AlertOctagon size={12} />
                          Alocar com ressalva
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
