import { redirect } from 'next/navigation'

// C4.4 — a Visão Geral EXECUTIVA canônica é /prosight/visao-geral (C3). Esta rota
// operacional legada (F4) foi decomposta em Ambientes/AppServers/Compilação/Patches/RPO
// (C2), então passa a REDIRECIONAR direto para a canônica (sem cadeia). Preserva a query
// string (ex.: ?env=) caso um deep-link antigo carregue contexto.
export default async function OperacoesVisaoGeralPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v != null) p.set(k, v)
  }
  const s = p.toString()
  redirect('/prosight/visao-geral' + (s ? `?${s}` : ''))
}
