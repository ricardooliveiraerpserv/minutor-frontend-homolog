import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000'

async function proxy(req: NextRequest, params: Promise<{ path: string[] }>) {
  const { path } = await params
  const url = new URL(`${BACKEND}/api/v1/${path.join('/')}`)

  // Repassa query string
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const headers = new Headers(req.headers)
  headers.delete('host')

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    // @ts-expect-error — Node 18+ stream body
    duplex: 'half',
  }

  const upstream = await fetch(url.toString(), init)

  const resHeaders = new Headers(upstream.headers)
  resHeaders.delete('content-encoding') // evita problemas de gzip duplo

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export const GET     = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params)
export const POST    = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params)
export const PUT     = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params)
export const PATCH   = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params)
export const DELETE  = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params)
