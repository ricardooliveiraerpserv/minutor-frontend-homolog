// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — modelo de PERMISSÕES (PREPARADO, sem backend agora).
//
// O front nativo usa a IDENTIDADE do Minutor (perfis/políticas) — NÃO há tela de
// usuários própria (os "Usuários Dashboards" serão SUBSTITUÍDOS por Perfis/
// Políticas Minutor no D-live). Aqui deixamos o front preparado para as permissões
// futuras via `canOperacoes(perm, user)`, que HOJE devolve true para admin.
//
// TODO(D-live): mapear estas permissões para o motor de perfis/políticas do Minutor
// (hasPermission('operacoes_protheus.*')) e remover o gate simplificado por admin.
// Correspondência com o legado (dashboards-service/lib/permissions.js):
//   services.control ← servicos.controlar   · compile     ← compilacao.executar
//   patch            ← pacote.aplicar        · rpo.promote ← compilacao.promover
//   rpo.rollback     ← compilacao.promover   · exclusive   ← exclusivo.ativar
//   cleanup          ← sistema.limpar        · config.manage ← configuracoes.ver (+admin p/ salvar)
//   audit.view       ← isAdmin               · view        ← servicos.ver
// ─────────────────────────────────────────────────────────────────────────────

import type { User } from '@/types'

export type OperacoesPerm =
  | 'operacoes_protheus.view'
  | 'services.control'
  | 'compile'
  | 'patch'
  | 'rpo.promote'
  | 'rpo.rollback'
  | 'exclusive'
  | 'debug'
  | 'cleanup'
  | 'config.manage'
  | 'audit.view'

export const OPERACOES_PERMISSIONS: OperacoesPerm[] = [
  'operacoes_protheus.view', 'services.control', 'compile', 'patch',
  'rpo.promote', 'rpo.rollback', 'exclusive', 'debug', 'cleanup',
  'config.manage', 'audit.view',
]

/**
 * Gate de permissão do módulo. HOJE (F4) libera tudo para admin do Minutor.
 * `perm` fica documentado/tipado para o D-live plugar o motor de políticas real.
 */
export function canOperacoes(_perm: OperacoesPerm, user: User | null | undefined): boolean {
  // TODO(D-live): substituir por hasPermission(user, `operacoes_protheus.${perm}`).
  return user?.type === 'admin'
}
