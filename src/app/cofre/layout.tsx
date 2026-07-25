'use client'

// Escopo do VaultProvider restrito ao módulo /cofre: as chaves destravadas
// (memória) morrem ao navegar pra fora — menos superfície de exposição.
import { VaultProvider } from '@/contexts/vault-context'

export default function CofreLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>
}
