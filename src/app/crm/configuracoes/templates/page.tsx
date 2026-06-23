'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { LayoutTemplate, Trash2, FileText, Eye, Pencil, X } from 'lucide-react'

interface Tpl { tipo: string; salvo: boolean; updated_at: string | null; secoes: string[]; tem_memoria: boolean }
const TIPO_LABEL: Record<string, string> = {
  bh_fixo: 'Banco de Horas Fixo', bh_mensal: 'Banco de Horas Mensal', on_demand: 'On Demand',
  projeto_fechado: 'Projeto Fechado', cloud: 'Cloud Protheus',
}
const SECAO_LABEL: Record<string, string> = {
  escopo: 'Escopo', investimento: 'Investimento', prazo: 'Prazo', contrato: 'Dados do contrato',
  cloud: 'Cloud (tabelas)', card_texto: 'Texto do card', aceite: 'Aceite', logo: 'Logo', paginas_off: 'Páginas',
}
const fmtData = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function TemplatesConfig() {
  const router = useRouter()
  const [list, setList] = useState<Tpl[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTipo, setViewTipo] = useState<string | null>(null)
  const [viewHtml, setViewHtml] = useState<string>('')
  const visualizar = (tipo: string) => {
    setViewTipo(tipo); setViewHtml('')
    api.get<{ data: { html: string } }>(`/crm/proposal-templates/${tipo}/preview`).then(r => setViewHtml(r?.data?.html ?? '<p style="padding:16px">Sem preview.</p>')).catch(() => setViewHtml('<p style="padding:16px">Erro ao carregar.</p>'))
  }
  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Tpl[] }>('/crm/proposal-templates').then(r => setList(r?.data ?? [])).catch(() => setList([])).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const excluir = async (tipo: string) => {
    if (!window.confirm(`Excluir o template de "${TIPO_LABEL[tipo] ?? tipo}"? (não afeta propostas já criadas)`)) return
    try { await api.delete(`/crm/proposal-templates/${tipo}`); toast.success('Template excluído'); load() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao excluir (somente admin/administrativo)') }
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-1">
          <LayoutTemplate size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Templates de Proposta</h1>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          Um template por tipo de contrato, <b>global</b> (toda a empresa). Para <b>criar ou atualizar</b> um template, abra uma proposta do tipo,
          configure-a e clique em <b>&quot;Salvar template&quot;</b>. Ao escolher esse tipo numa próxima proposta, ele pergunta se quer aplicar.
        </p>

        {loading ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
          <div className="space-y-2">
            {list.map(t => (
              <div key={t.tipo} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <FileText size={18} style={{ color: t.salvo ? 'var(--primary)' : 'var(--text-light)' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
                    {t.salvo
                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>SALVO</span>
                      : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>SEM TEMPLATE</span>}
                  </div>
                  {t.salvo
                    ? <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Atualizado {fmtData(t.updated_at)} · {t.tem_memoria ? 'com memória de cálculo · ' : ''}{t.secoes.length ? t.secoes.map(s => SECAO_LABEL[s] ?? s).join(', ') : 'sem seções'}
                      </p>
                    : <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>Sem template — clique em <b>Editar</b> para criar.</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.salvo && (
                    <button onClick={() => visualizar(t.tipo)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--text)', border: '1px solid var(--border)' }} title="Visualizar (preview)">
                      <Eye size={13} /> Visualizar
                    </button>
                  )}
                  <button onClick={() => router.push(`/crm/propostas/template-${t.tipo}`)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--primary)', border: '1px solid var(--border)' }} title={t.salvo ? 'Editar template' : 'Criar template'}>
                    <Pencil size={13} /> {t.salvo ? 'Editar' : 'Criar'}
                  </button>
                  {t.salvo && (
                    <button onClick={() => excluir(t.tipo)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--danger)', border: '1px solid var(--border)' }} title="Excluir template">
                      <Trash2 size={13} /> Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setViewTipo(null)}>
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(1000px, 95vw)', height: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-bold" style={{ color: 'var(--text)' }}>Preview — Template {TIPO_LABEL[viewTipo] ?? viewTipo}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => { const t = viewTipo; setViewTipo(null); router.push(`/crm/propostas/template-${t}`) }} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--primary)', border: '1px solid var(--border)' }}><Pencil size={13} /> Editar</button>
                <button onClick={() => setViewTipo(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden" style={{ background: '#e5e7eb' }}>
              {viewHtml ? <iframe srcDoc={viewHtml} title="preview" className="w-full h-full border-0" /> : <p className="p-6" style={{ color: 'var(--text-muted)' }}>Gerando preview…</p>}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
