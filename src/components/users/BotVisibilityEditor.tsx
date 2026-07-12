'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const ALL_SCOPES = ['customer', 'project', 'contract', 'financial', 'billing', 'payroll', 'bankhours', 'approvals', 'overview', 'support'] as const

const SCOPE_LABEL: Record<string, string> = {
  customer:  'Clientes',
  project:   'Projetos',
  contract:  'Contratos',
  financial: 'Apontamentos & Despesas',
  billing:   'Faturamento (cliente)',
  payroll:   'Pagamento (consultor)',
  bankhours: 'Banco de horas',
  approvals: 'Pendências',
  overview:  'Resumos gerais',
  support:   'Suporte / Movidesk',
}

type Visibility = 'self' | 'team' | 'all'
type Override = 'inherit' | 'self' | 'team' | 'all' | 'denied'

const VIS_OPTIONS: { value: Visibility; label: string; help: string }[] = [
  { value: 'self', label: 'Apenas ele mesmo', help: 'Só vê dados próprios (forçando user_id ao logado) e clientes onde ele atua diretamente.' },
  { value: 'team', label: 'Equipe que coordena/lidera', help: 'Self + consultores e clientes dos projetos que coordena, arquiteta ou lidera comercialmente.' },
  { value: 'all',  label: 'Sem restrição (admin)', help: 'Pode consultar qualquer consultor ou cliente. Use só pra admin/diretoria.' },
]

const OVERRIDE_OPTIONS: { value: Override; label: string }[] = [
  { value: 'inherit', label: 'Herdar visibilidade' },
  { value: 'self',    label: 'Apenas ele' },
  { value: 'team',    label: 'Equipe' },
  { value: 'all',     label: 'Sem restrição' },
  { value: 'denied',  label: 'Negado' },
]

interface Props {
  visibility: Visibility
  overrides: Record<string, Override> | null
  onChangeVisibility: (v: Visibility) => void
  onChangeOverrides: (o: Record<string, Override> | null) => void
}

export function BotVisibilityEditor({ visibility, overrides, onChangeVisibility, onChangeOverrides }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const ov = overrides ?? {}

  const setScopeOverride = (scope: string, value: Override) => {
    const next = { ...ov }
    if (value === 'inherit') {
      delete next[scope]
    } else {
      next[scope] = value
    }
    onChangeOverrides(Object.keys(next).length === 0 ? null : next)
  }

  const help = VIS_OPTIONS.find(o => o.value === visibility)?.help

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
      <div>
        <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">
          Visibilidade de dados via @bot
        </span>
        <div className="grid gap-1.5">
          {VIS_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={[
                'flex items-start gap-2 px-2.5 py-1.5 rounded border cursor-pointer transition-colors',
                visibility === opt.value
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-zinc-800 hover:border-zinc-700',
              ].join(' ')}
            >
              <input
                type="radio"
                name="bot-visibility"
                checked={visibility === opt.value}
                onChange={() => onChangeVisibility(opt.value)}
                className="mt-0.5 accent-emerald-500"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-zinc-100">{opt.label}</div>
                <div className="text-[11px] text-zinc-500">{opt.help}</div>
              </div>
            </label>
          ))}
        </div>
        {help && (
          <p className="text-[11px] text-zinc-500 mt-2">
            Esta visibilidade vale como padrão para todos os scopes. Ajuste fino abaixo (avançado) sobrescreve por área.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(s => !s)}
        className="text-[11px] text-emerald-300 hover:underline inline-flex items-center gap-1"
      >
        {showAdvanced ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
        Override por área (avançado)
        {overrides && Object.keys(overrides).length > 0 && (
          <span className="text-[10px] text-amber-400">— {Object.keys(overrides).length} override(s) ativo(s)</span>
        )}
      </button>

      {showAdvanced && (
        <div className="border-t border-zinc-800 pt-2 space-y-1.5">
          <p className="text-[11px] text-zinc-500">
            Cada área pode sobrescrever a visibilidade padrão. Ex.: deixar "Pagamento" sempre <strong>Apenas ele</strong>,
            mesmo que o user esteja como "Equipe" no geral.
          </p>
          <div className="grid gap-1.5">
            {ALL_SCOPES.map(scope => {
              const current = (ov[scope] ?? 'inherit') as Override
              return (
                <div key={scope} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300 flex-1 truncate">{SCOPE_LABEL[scope] ?? scope}</span>
                  <select
                    value={current}
                    onChange={e => setScopeOverride(scope, e.target.value as Override)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[11px] text-zinc-100 w-40"
                  >
                    {OVERRIDE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
