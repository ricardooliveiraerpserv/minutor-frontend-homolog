'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { FolderKanban, MessageSquare, X } from 'lucide-react'
import { ProjectConversation } from '@/components/portal-cliente/project-conversation'

/**
 * Menu de opções do PROJETO ao clicar numa LINHA/card:
 * - "Gestão de Projetos" → navega (cliente: /portal-cliente/projetos/{id}; equipe: /projetos/{id}/cronograma)
 * - "Comentários" → abre o MODAL de comentários (mesmo canal /projects/{id}/comments, igual prod)
 *
 * Uso: const { openMenu, menu } = useProjectActionsMenu();
 *   onClick={() => openMenu(id, nome, codigo)} na linha e {menu} no fim do componente.
 */
export function useProjectActionsMenu() {
  const router = useRouter()
  const { user } = useAuth()
  const isCliente = (user as { type?: string } | null)?.type === 'cliente'
  const [target, setTarget] = useState<{ id: number; name?: string; code?: string } | null>(null)
  const [comments, setComments] = useState<{ id: number; name?: string; code?: string } | null>(null)

  const openMenu = (id: number, name?: string, code?: string) => setTarget({ id, name, code })
  const closeMenu = () => setTarget(null)

  const goGestao = () => {
    if (!target) return
    router.push(isCliente ? `/portal-cliente/projetos/${target.id}` : `/projetos/${target.id}/cronograma`)
    closeMenu()
  }
  const goComentarios = () => { if (!target) return; setComments(target); closeMenu() }

  const optBtn = { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 14, fontWeight: 500, textAlign: 'left' as const }

  const menu = (
    <>
      {target && (
        <div onClick={closeMenu} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(360px, 100%)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Projeto</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>{target.name ?? 'Abrir projeto'}</div>
              </div>
              <button onClick={closeMenu} aria-label="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={goGestao} className="ds-row-hover" style={optBtn}>
                <FolderKanban size={17} style={{ color: 'var(--primary)' }} /> Gestão de Projetos
              </button>
              <button onClick={goComentarios} className="ds-row-hover" style={optBtn}>
                <MessageSquare size={17} style={{ color: 'var(--primary)' }} /> Comentários
              </button>
            </div>
          </div>
        </div>
      )}

      {comments && (
        <div onClick={() => setComments(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 100%)', height: 'min(620px, 88vh)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: '1px solid var(--danger)', borderTop: '4px solid var(--danger)', borderRadius: 14, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comments.name ?? 'Projeto'}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>Comentários{comments.code ? ` · ${comments.code}` : ''}</div>
              </div>
              <button onClick={() => setComments(null)} aria-label="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <ProjectConversation projectId={comments.id} />
            </div>
          </div>
        </div>
      )}
    </>
  )

  return { openMenu, menu }
}
