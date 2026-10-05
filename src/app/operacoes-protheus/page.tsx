import { redirect } from 'next/navigation'

// C4.4 — canonicalização de navegação. /operacoes-protheus (raiz) NÃO depende mais da
// Visão Geral operacional legada (que virou redirect): aponta DIRETO para Ambientes
// (destino canônico; sem cadeia de redirects). Preserva a query string se houver.
export default async function OperacoesIndexPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = toQuery(await searchParams)
  redirect('/operacoes-protheus/ambientes' + qs)
}

function toQuery(sp: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v != null) p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}
