'use client'

// Cofre de Ambientes reusa TODA a cripto/unlock do Cofre de Senhas: monta o mesmo
// VaultProvider (chaves só em memória). Ao destravar aqui, getVaultKey(clienteVaultId)
// fica disponível pros segredos dos ambientes — sem tocar em nada da segurança.
import { VaultProvider } from '@/contexts/vault-context'

export default function AmbientesLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>
}
