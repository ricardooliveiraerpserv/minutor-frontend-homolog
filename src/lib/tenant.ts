/**
 * Resolve o slug do tenant a partir do hostname: `<slug>.minutor.com.br`
 * (exceto app/api/www). Vazio = grupo (schema public no backend).
 * Usado no api client (window.location) e nos route handlers do BFF (req host),
 * que precisam repassar o header X-Tenant ao backend.
 */
export function tenantSlugFromHost(host: string | null | undefined): string {
  const m = /^([a-z0-9-]+)\.minutor\.com\.br$/i.exec((host ?? '').trim())
  return m && !['app', 'api', 'www'].includes(m[1].toLowerCase()) ? m[1].toLowerCase() : ''
}
