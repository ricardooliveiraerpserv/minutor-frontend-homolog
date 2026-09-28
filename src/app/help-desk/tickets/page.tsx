import { redirect } from 'next/navigation'

// Tela única de chamados: o padrão é a Fila (Kanban). A antiga lista "Chamados" foi unificada
// nela — qualquer acesso a /help-desk/tickets é redirecionado para /help-desk/fila.
export default function ChamadosRedirect() {
  redirect('/help-desk/fila')
}
