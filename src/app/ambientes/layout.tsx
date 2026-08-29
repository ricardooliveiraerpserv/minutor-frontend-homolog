// VaultProvider agora é app-wide (src/app/providers.tsx). Este layout só repassa os filhos.
export default function AmbientesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
