import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'a', 'b', 'br', 'em', 'i', 'img', 'li', 'ol', 'p', 'pre',
  'span', 'strong', 'u', 'ul', 'blockquote', 'code', 'div',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'class']

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return ''
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data:image\/(?:png|jpeg|gif|webp));|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}
