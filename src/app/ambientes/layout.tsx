// VaultProvider escopado a /ambientes (área admin). O cofre só inicializa aqui
// (evita disparar /vault/profile app-wide p/ todo usuário autenticado).
import { VaultProvider } from '@/contexts/vault-context'

export default function AmbientesLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>
}
