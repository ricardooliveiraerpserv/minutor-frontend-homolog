import { redirect } from 'next/navigation'

// /prosight → entrada padrão: Visão Geral (shell consolidado).
export default function ProsightIndexPage() {
  redirect('/prosight/visao-geral')
}
