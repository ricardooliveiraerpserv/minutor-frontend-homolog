'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProjectsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/gestao-projetos') }, [router])
  return null
}
