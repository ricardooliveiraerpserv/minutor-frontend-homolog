'use client'

import * as React from 'react'
import { useAuthedImage } from '@/hooks/use-authed-image'

// <img> que carrega URLs autenticadas (ex.: /api/v1/attachments/{id}/download) buscando com o
// token. Enquanto não resolve (ou se falhar), renderiza `fallback` (padrão: nada).
export function AuthedImg({
  src,
  fallback = null,
  ...props
}: Omit<React.ComponentProps<'img'>, 'src'> & { src?: string | null; fallback?: React.ReactNode }) {
  const resolved = useAuthedImage(src)
  if (!resolved) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} {...props} />
}
