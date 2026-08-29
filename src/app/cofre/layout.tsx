// VaultProvider agora é app-wide (src/app/providers.tsx) → a chave persiste na navegação
// entre Cofre e Ambientes. Este layout só repassa os filhos.
export default function CofreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
