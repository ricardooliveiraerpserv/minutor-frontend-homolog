// Badge (pill) com o nome do parceiro, mostrada DEPOIS do nome do usuário
// (seletores de apontamento/despesa/alocação). Não renderiza nada se não houver parceiro.
export function PartnerBadge({ label }: { label?: string | null }) {
  if (!label) return null
  return (
    <span
      className="inline-block align-middle px-1.5 py-0.5 ml-1.5 rounded text-[10px] font-semibold whitespace-nowrap"
      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
    >
      {label}
    </span>
  )
}
