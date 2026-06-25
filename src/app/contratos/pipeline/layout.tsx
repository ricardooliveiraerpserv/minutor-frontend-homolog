// Server-side opt-out de pre-render estático.
// O page.tsx usa useSearchParams() que exige renderização dinâmica em Next 16.
// Sem isso, build falha com "should be wrapped in a suspense boundary".
export const dynamic = 'force-dynamic'

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return children
}
