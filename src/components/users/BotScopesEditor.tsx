'use client'

const ALL_SCOPES = ['customer', 'project', 'contract', 'financial', 'billing', 'payroll', 'bankhours', 'approvals', 'overview', 'support'] as const

const SCOPE_LABEL: Record<string, string> = {
  customer:  'Clientes',
  project:   'Projetos',
  contract:  'Contratos',
  financial: 'Apontamentos & Despesas',
  billing:   'Faturamento (cliente)',
  payroll:   'Pagamento (consultor)',
  bankhours: 'Banco de horas',
  approvals: 'Pendências de aprovação',
  overview:  'Resumos gerais',
  support:   'Suporte / Movidesk',
}

interface Props {
  /**
   * null = sem restrição (libera todas as áreas que os agents permitirem).
   * array vazio = nenhuma área liberada para esse user.
   * array = subset específico.
   */
  value: string[] | null
  onChange: (next: string[] | null) => void
}

export function BotScopesEditor({ value, onChange }: Props) {
  const isUnrestricted = value === null
  const scopes = value ?? []

  const toggle = (s: string) => {
    const next = scopes.includes(s) ? scopes.filter(x => x !== s) : [...scopes, s]
    onChange(next)
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
          Áreas que este usuário pode consultar via @bot
        </span>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isUnrestricted}
            onChange={e => onChange(e.target.checked ? null : [...ALL_SCOPES])}
            className="accent-emerald-500"
          />
          Sem restrição (segue regras do agent)
        </label>
      </div>

      <p className="text-[11px] text-zinc-500 mb-2">
        Restringe o que este usuário pode perguntar ao BOT. Ex.: desmarque "Pagamento" para que ele
        não receba dados de fechamento de consultor. A área final é a interseção das áreas que o
        agent libera × as áreas marcadas aqui.
      </p>

      {!isUnrestricted && (
        <>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => onChange([...ALL_SCOPES])} className="text-[10px] text-emerald-300 hover:underline">
              Marcar todas
            </button>
            <button type="button" onClick={() => onChange([])} className="text-[10px] text-zinc-500 hover:underline">
              Desmarcar todas
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {ALL_SCOPES.map(s => {
              const checked = scopes.includes(s)
              return (
                <label key={s} className={[
                  'flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer transition-colors',
                  checked
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700',
                ].join(' ')}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(s)} className="accent-emerald-500"/>
                  <span>{SCOPE_LABEL[s] ?? s}</span>
                </label>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
