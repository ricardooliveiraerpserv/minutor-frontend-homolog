'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { FolderKanban, MessageSquare, X } from 'lucide-react'

/**
 * Menu de opções do PROJETO (Gestão de Projetos / Comentários) para abrir ao
 * clicar numa LINHA de projeto (dashboards). Rota certa por perfil:
 * - cliente → /portal-cliente/projetos/{id} (+ ?tab=comentarios)
 * - equipe  → /projetos/{id}/cronograma     (+ ?view=conversa)
 *
 * Uso: const { openMenu, menu } = useProjectActionsMenu(); depois
 *   onClick={() => openMenu(id, nome)} na linha e {menu} no fim do componente.
 */
export function useProjectActionsMenu() {
  const router = useRouter()
  const { user } = useAuth()
  const isCliente = (user as { type?: string } | null)?.type === 'cliente'
  const [target, setTarget] = useState<{ id: number; name?: string } | null>(null)

  const openMenu = (id: number, name?: string) => setTarget({ id, name })
  const close = () => setTarget(null)

  const goGestao = () => {
    if (!target) return
    router.push(isCliente ? `/portal-cliente/projetos/${target.id}` : `/projetos/${target.id}/cronograma`)
    close()
  }
  const goComentarios = () => {
    if (!target) return
    router.push(isCliente ? `/portal-cliente/projetos/${target.id}?tab=comentarios` : `/projetos/${target.id}/cronograma?view=conversa`)
    close()
  }

  const menu = target ? (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(360px, 100%)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Projeto</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>{target.name ?? 'Abrir projeto'}</div>
          </div>
          <button onClick={close} aria-label="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={goGestao} className="ds-row-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 14, fontWeight: 500, textAlign: 'left' }}>
            <FolderKanban size={17} style={{ color: 'var(--primary)' }} /> Gestão de Projetos
          </button>
          <button onClick={goComentarios} className="ds-row-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 14, fontWeight: 500, textAlign: 'left' }}>
            <MessageSquare size={17} style={{ color: 'var(--primary)' }} /> Comentários
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { openMenu, menu }
}
