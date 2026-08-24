import { redirect } from 'next/navigation'

// /operacoes-protheus → entrada padrão: Visão Geral.
export default function OperacoesIndexPage() {
  redirect('/operacoes-protheus/visao-geral')
}
