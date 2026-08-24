import { redirect } from 'next/navigation'

// /prosight → entrada padrão: Inventário.
export default function ProsightIndexPage() {
  redirect('/prosight/inventario')
}
