import { redirect } from 'next/navigation'

// PWA descontinuado. O ícone instalado na tela inicial abre em /mobile (start_url
// antigo, que o iOS não atualiza). Antes /mobile mandava pro fluxo mobile de
// Apontamento — o que "forçava o PWA". Agora manda pro app COMPLETO (/inicio),
// então o ícone da tela inicial abre o Minutor normal. A tela de apontamento mobile
// (/mobile/apontamento) segue existindo pra quem acessar direto, mas ninguém é mais
// jogado nela pelo ícone.
export default function MobileHome() {
  redirect('/inicio')
}
