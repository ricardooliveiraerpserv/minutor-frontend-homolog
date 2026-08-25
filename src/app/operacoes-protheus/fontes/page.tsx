import { redirect } from 'next/navigation'

// C4.4 — a visão de fontes/inventário canônica é o Inventário Git×RPO em
// /prosight/inventario. Esta rota (órfã de navegação) redireciona direto para lá
// (sem cadeia), preservando a query string se houver contexto.
export default async function OperacoesFontesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v != null) p.set(k, v)
  }
  const s = p.toString()
  redirect('/prosight/inventario' + (s ? `?${s}` : ''))
}
