import { redirect } from 'next/navigation'

// Fluxo mobile descontinuado. Qualquer acesso a /mobile/* vai pro app COMPLETO
// (/inicio), pra que o ícone da tela inicial (que o iOS fixa na URL atual ao
// "Adicionar à Tela de Início") nunca prenda o usuário na tela mobile de
// Apontamento. O app completo é responsivo e funciona no celular.
export default function MobileApontamento() {
  redirect('/inicio')
}
