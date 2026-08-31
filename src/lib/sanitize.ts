// DOMPurify é carregado LAZY e SÓ NO CLIENTE. O `isomorphic-dompurify` puxa o `jsdom` no
// import quando roda no servidor, e a árvore de deps do jsdom quebra no runtime da Vercel
// (ERR_REQUIRE_ESM em html-encoding-sniffer → @exodus/bytes). Isso derrubava o SSR de toda
// página dinâmica que importa este módulo. No servidor usamos um strip por regex do que é
// perigoso (script/handlers/javascript:) — suficiente para a janela pré-hidratação, já que
// o cliente re-sanitiza com o DOMPurify real ao montar.
type Purifier = { sanitize: (s: string, cfg?: Record<string, unknown>) => string }
let _dp: Purifier | null = null
function getDP(): Purifier | null {
  if (typeof window === 'undefined') return null // servidor: nunca avalia isomorphic-dompurify/jsdom
  if (!_dp) _dp = (require('isomorphic-dompurify') as { default: Purifier }).default
  return _dp
}

// Fallback de sanitização no SERVIDOR (sem DOMPurify/jsdom): remove só os vetores perigosos.
export function serverStrip(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
}

// Imagens removidas: URLs assinadas do S3 do Movidesk expiram em ~24h e ficam
// como placeholder quebrado "Carregando imagem...". Até existir mirror local,
// o texto vai sem imagens.
const ALLOWED_TAGS = [
  'a', 'b', 'br', 'em', 'i', 'li', 'ol', 'p', 'pre',
  'span', 'strong', 'u', 'ul', 'blockquote', 'code', 'div',
  // Movidesk envia tabelas e headers em htmlDescription (ver MovideskService::buildObservation)
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 's', 'sub', 'sup',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'colspan', 'rowspan', 'align', 'valign', 'style']

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return ''
  const dp = getDP()
  if (!dp) return serverStrip(input) // SSR: strip de segurança; cliente re-sanitiza ao montar
  return dp.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data:image\/(?:png|jpeg|gif|webp));|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}

/**
 * Versão texto plano de um HTML — usada em previews (kanban, listas, tooltips)
 * onde renderizar tags HTML quebraria o layout. Preserva quebras de linha
 * entre parágrafos, listas, headers e tabelas pra manter legibilidade.
 *
 * Em containers com `truncate` ou `line-clamp-N` o CSS limita visualmente.
 * Em containers com `whitespace-pre-line`/`pre-wrap`, as quebras aparecem.
 */
export function previewText(input: string | null | undefined): string {
  if (!input) return ''
  // Block tags viram \n; td/th vira tab pra separar colunas no mesmo "linha"
  const withBreaks = String(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, '\t')
  // Remove o resto das tags
  const stripped = withBreaks.replace(/<[^>]*>/g, '')
  // Decoda entidades comuns
  const decoded = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // Colapsa espaços/tabs dentro de cada linha, mas preserva \n. Remove
  // linhas em branco consecutivas (mantém só 1).
  return decoded
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
    .join('\n')
    .trim()
}

/**
 * Escapa texto para interpolação SEGURA em HTML montado por template string
 * (ex.: relatórios de impressão via document.write). Nome vira texto, nunca código.
 * (auditoria cofre, item 2 / A6).
 */
export function escapeHtml(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
