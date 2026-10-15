// Cofre Pessoal escopado em /ambientes/pessoal — reusa o mesmo VaultProvider
// (zero-knowledge) do resto do cofre. Área admin; privado por usuário.
import { VaultProvider } from '@/contexts/vault-context'

export default function CofrePessoalLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>
}
