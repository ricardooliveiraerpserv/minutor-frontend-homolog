import { serverStrip } from '@/lib/sanitize'

// DOMPurify é carregado LAZY e SÓ NO CLIENTE. O `isomorphic-dompurify` puxa o `jsdom` no
// import quando roda no servidor, e a árvore de deps do jsdom quebra no runtime da Vercel
// (ERR_REQUIRE_ESM: html-encoding-sniffer → @exodus/bytes é ESM e é carregado via require()).
// Isso derrubava o SSR de QUALQUER página que importa este módulo (tela do chamado → 500 →
// Next cai em hard-reload → rebaixa a abertura do ticket). Como o HTML sanitizado só é
// renderizado no navegador (páginas 'use client' com guarda de mount), no servidor a
// sanitização vira no-op segura: o resultado nunca chega a ser exibido.
type Purifier = { sanitize: (s: string, cfg?: Record<string, unknown>) => string }
let _dp: Purifier | null = null
function getDP(): Purifier | null {
  if (typeof window === 'undefined') return null // servidor: nunca avalia isomorphic-dompurify/jsdom
  if (!_dp) _dp = (require('isomorphic-dompurify') as { default: Purifier }).default
  return _dp
}

// Sanitiza o corpo RICO das interações do Help Desk (texto + prints colados inline como
// imagem). Permite só um subconjunto seguro de tags/atributos; data:image em <img> é
// liberado por padrão pelo DOMPurify (e javascript: é bloqueado). Usado na tela do chamado
// e no portal do cliente — a renderização é o ponto único de defesa contra XSS.
export function sanitizeRich(html: string): string {
  // Imagens inline `cid:` (assinaturas do Outlook etc.) nunca resolvem no navegador →
  // viram ícone quebrado. Remove antes de sanitizar. Mantém data:/http(s) normalmente.
  // `(?<=[\s"'])src=` evita casar dentro de data-original-src="cid:..." (o \b batia no hífen e
  // removia por engano imagens já rehospedadas que guardam o cid original num data-attr).
  const withoutCid = html.replace(/<img\b[^>]*(?<=[\s"'])src=["']cid:[^"']*["'][^>]*>/gi, '')
  const dp = getDP()
  if (!dp) return serverStrip(withoutCid) // SSR: strip de segurança; cliente re-sanitiza ao montar
  return dp.sanitize(withoutCid, {
    // Tags/atributos amplos o bastante p/ reproduzir a assinatura do e-mail (tabelas de
    // layout do Outlook, <font>, hr) — fiel ao recebido. javascript:/onload são bloqueados.
    ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'font', 'hr', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'small', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'style',
      'width', 'height', 'align', 'valign', 'cellpadding', 'cellspacing', 'border', 'colspan', 'rowspan', 'bgcolor',
      'color', 'face', 'size',
      // Anexos inline importados do Movidesk: o <img data-att-id> (sem src) e o chip <span data-att-id>
      // são resolvidos p/ a imagem/download reais pelo HdRichHtml. `class` p/ estilizar o chip.
      'class', 'data-att-id'],
  })
}

// Sanitização para o corpo de E-MAIL renderizado em <iframe> ISOLADO (EmailFrame).
// Mais permissiva (preserva <style>, <font>, tabelas e atributos de layout do remetente)
// p/ fidelidade total — seguro porque o iframe roda em sandbox SEM scripts. Remove só o
// que é perigoso/externo (script, iframe aninhado, meta/base/link, handlers on*).
export function sanitizeEmail(html: string): string {
  // `(?<=[\s"'])src=` evita casar dentro de data-original-src="cid:..." (o \b batia no hífen e
  // removia por engano imagens já rehospedadas que guardam o cid original num data-attr).
  const withoutCid = html.replace(/<img\b[^>]*(?<=[\s"'])src=["']cid:[^"']*["'][^>]*>/gi, '')
  const dp = getDP()
  if (!dp) return serverStrip(withoutCid) // SSR: strip de segurança; cliente re-sanitiza ao montar
  return dp.sanitize(withoutCid, {
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'noscript', 'iframe', 'object', 'embed', 'meta', 'base', 'link', 'form', 'input'],
    ADD_ATTR: ['target'],
  })
}

// Heurística simples: o corpo é HTML (interação rica) ou texto puro (interação legada)?
export function isHtmlBody(s: string): boolean {
  // Tags OU entidades HTML (ex.: &nbsp; vindo do editor rich sem tags) — senão a entidade aparece literal.
  return /<(img|br|p|div|span|b|strong|i|em|u|a|ul|ol|li)\b[^>]*>/i.test(s)
    || /&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(s)
}
