// VaultProvider escopado a /cofre (área admin). A chave persiste na navegação
// dentro do Cofre; Ambientes tem seu próprio provider (não montamos app-wide p/
// evitar /vault/profile em todo usuário autenticado).
import { VaultProvider } from '@/contexts/vault-context'

export default function CofreLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>
}
