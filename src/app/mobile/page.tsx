import { redirect } from 'next/navigation'

// A home do PWA mobile foi o chooser "Lançamento rápido" (Apontamento × Despesa).
// Ricardo pediu pra retirar esse direcionamento: agora abre DIRETO no Apontamento
// (ação principal). Despesa continua acessível pelo atalho do PWA (long-press no
// ícone, ver manifest.ts) e a tela de Apontamento lida com auth/login sozinha.
export default function MobileHome() {
  redirect('/mobile/apontamento')
}
