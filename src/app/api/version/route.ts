// Marcador de versão do FRONTEND: expõe o commit que o Render buildou (RENDER_GIT_COMMIT).
// Serve para conferir qual bundle está no ar sem arqueologia de chunks. Não é proxiado
// (o rewrite do next.config só pega /api/v1/*), então o próprio Next responde.

export const dynamic = 'force-dynamic'

export function GET() {
  const commit =
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    'unknown'
  return Response.json(
    {
      service: 'frontend',
      commit,
      short: commit.slice(0, 12),
      env: process.env.NEXT_PUBLIC_APP_ENV || null,
      renderService: process.env.RENDER_SERVICE_NAME || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
