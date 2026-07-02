"use client"

/**
 * Conjunto ÚNICO e oficial de loading do Minutor (Sprint 3 · Fase 1).
 * Regra: nunca esconder a interface inteira; manter o layout vivo; skeleton que
 * lembra o conteúdo. Não criar loaders ad-hoc — use estes.
 *
 *  • SkeletonTable  — listas/tabelas (re-export do padrão do DS)
 *  • CardsSkeleton  — grades de KPI/cards (dashboards)
 *  • SectionLoader  — bloco/seção que carrega (spinner discreto centralizado)
 *  • InlineLoader   — carregamento inline pequeno (dentro de linha/botão)
 */
import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton, SkeletonTable } from "@/components/ds"

export { Skeleton, SkeletonTable }

/** Grade de cards (KPIs/dashboards) — mantém a área viva enquanto carrega. */
export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Skeleton className="h-3 w-16 mb-3" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  )
}

/** Spinner discreto centralizado numa seção — não bloqueia a viewport. */
export function SectionLoader({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
      <span className="size-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" aria-hidden />
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  )
}

/** Loader inline pequeno (linha/botão/campo). */
export function InlineLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)} style={{ color: "var(--text-muted)" }}>
      <Loader2 className="size-4 animate-spin" style={{ color: "var(--primary)" }} aria-hidden />
      {label ?? "Carregando…"}
    </span>
  )
}
