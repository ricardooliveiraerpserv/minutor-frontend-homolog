import DOMPurify from 'isomorphic-dompurify'

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

/**
 * A6 (segurança): escapa caracteres HTML. Use para injetar texto vindo do banco
 * (nomes de consultor/cliente/empresa etc.) em HTML montado por template string —
 * relatórios de impressão. O texto aparece como TEXTO, nunca executa como código.
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

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return ''
  return DOMPurify.sanitize(input, {
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
