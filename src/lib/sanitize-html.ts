import DOMPurify from 'isomorphic-dompurify'

// Sanitiza o corpo RICO das interações do Help Desk (texto + prints colados inline como
// imagem). Permite só um subconjunto seguro de tags/atributos; data:image em <img> é
// liberado por padrão pelo DOMPurify (e javascript: é bloqueado). Usado na tela do chamado
// e no portal do cliente — a renderização é o ponto único de defesa contra XSS.
export function sanitizeRich(html: string): string {
  // Imagens inline `cid:` (assinaturas do Outlook etc.) nunca resolvem no navegador →
  // viram ícone quebrado. Remove antes de sanitizar. Mantém data:/http(s) normalmente.
  const withoutCid = html.replace(/<img\b[^>]*\bsrc=["']cid:[^"']*["'][^>]*>/gi, '')
  return DOMPurify.sanitize(withoutCid, {
    // Tags/atributos amplos o bastante p/ reproduzir a assinatura do e-mail (tabelas de
    // layout do Outlook, <font>, hr) — fiel ao recebido. javascript:/onload são bloqueados.
    ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'font', 'hr', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'small', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'style',
      'width', 'height', 'align', 'valign', 'cellpadding', 'cellspacing', 'border', 'colspan', 'rowspan', 'bgcolor',
      'color', 'face', 'size'],
  })
}

// Sanitização para o corpo de E-MAIL renderizado em <iframe> ISOLADO (EmailFrame).
// Mais permissiva (preserva <style>, <font>, tabelas e atributos de layout do remetente)
// p/ fidelidade total — seguro porque o iframe roda em sandbox SEM scripts. Remove só o
// que é perigoso/externo (script, iframe aninhado, meta/base/link, handlers on*).
export function sanitizeEmail(html: string): string {
  const withoutCid = html.replace(/<img\b[^>]*\bsrc=["']cid:[^"']*["'][^>]*>/gi, '')
  return DOMPurify.sanitize(withoutCid, {
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'noscript', 'iframe', 'object', 'embed', 'meta', 'base', 'link', 'form', 'input'],
    ADD_ATTR: ['target'],
  })
}

// Heurística simples: o corpo é HTML (interação rica) ou texto puro (interação legada)?
export function isHtmlBody(s: string): boolean {
  return /<(img|br|p|div|span|b|strong|i|em|u|a|ul|ol|li)\b[^>]*>/i.test(s)
}
