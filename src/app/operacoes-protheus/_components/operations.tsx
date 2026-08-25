'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — RUNNER de operações críticas (experiência DEFINITIVA):
//   AÇÃO → CONFIRMAÇÃO → EXECUÇÃO/PROGRESSO → RESULTADO → (registra na Auditoria).
//
// NADA executa de verdade — o datasource fixture simula progresso + resultado
// (varia por cenário/variante) e APPENDa em Mudanças/Auditoria (store em memória),
// dando a sensação fim-a-fim. Usado por Compilar, Patch, Promover, Rollback,
// start/stop/restart, Modo Exclusivo, Debug e Limpezas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle, CheckCircle2, FileText, Loader2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Modal, TextInput } from '@/components/ds'
import { getOperacoesDataSource } from '@/lib/operacoes/datasource'
import type { OpItemResult } from '@/lib/operacoes/types'

export interface OpResultView {
  title: string
  success: boolean
  message?: string
  items?: { name: string; success: boolean; message?: string; sub?: string }[]
  logFile?: string
}

interface ConfirmCfg {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  progressLabel: string
  /** total de "passos" p/ a barra/contador de progresso (default 1). */
  total?: number
  run: () => Promise<OpResultView>
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm'; cfg: ConfirmCfg }
  | { kind: 'running'; label: string; done: number; total: number }
  | { kind: 'result'; res: OpResultView }

function itemsFromOp(results: OpItemResult[]): OpResultView['items'] {
  return results.map((r) => {
    const t = r.timings
    const parts: string[] = []
    if (t?.validate != null) parts.push(`val ${t.validate.toFixed(1)}s`)
    if (t?.apply != null) parts.push(`apl ${t.apply.toFixed(1)}s`)
    if (t?.defrag != null) parts.push(`defrag ${t.defrag.toFixed(1)}s`)
    const logName = r.logFile ? r.logFile.split(/[\\/]/).pop() : ''
    const sub = [r.message, parts.join(' · '), logName].filter(Boolean).join(' · ')
    return { name: r.name, success: r.success, sub: sub || undefined }
  })
}

/**
 * Hook do runner. Retorna `modals` (renderize UMA vez na tela) + os gatilhos das
 * operações. `onDone` é chamado ao fechar o resultado (para o pai recarregar
 * serviços/estado/auditoria).
 */
export function useOperations(environmentId: string | null, onDone: () => void) {
  const ds = getOperacoesDataSource()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  const start = useCallback((cfg: ConfirmCfg) => {
    if (!environmentId) { toast.error('Selecione um ambiente.'); return }
    setPhase({ kind: 'confirm', cfg })
  }, [environmentId])

  const accept = useCallback(async () => {
    setPhase((p) => {
      if (p.kind !== 'confirm') return p
      const total = p.cfg.total ?? 1
      // Progresso simulado: contador sobe até total-1 enquanto a promise corre.
      clearTimer()
      if (total > 1) {
        timerRef.current = setInterval(() => {
          setPhase((cur) => (cur.kind === 'running' && cur.done < cur.total - 1 ? { ...cur, done: cur.done + 1 } : cur))
        }, 260)
      }
      // dispara a operação
      void p.cfg.run().then((res) => {
        clearTimer()
        setPhase({ kind: 'running', label: p.cfg.progressLabel, done: total, total })
        setTimeout(() => setPhase({ kind: 'result', res }), 260)
      }).catch((e: unknown) => {
        clearTimer()
        setPhase({ kind: 'result', res: { title: p.cfg.title, success: false, message: e instanceof Error ? e.message : 'Falha inesperada.' } })
      })
      return { kind: 'running', label: p.cfg.progressLabel, done: 0, total }
    })
  }, [])

  const closeResult = useCallback(() => {
    setPhase({ kind: 'idle' })
    onDone()
  }, [onDone])

  const cancel = useCallback(() => { clearTimer(); setPhase({ kind: 'idle' }) }, [])

  // ── Gatilhos de operação ────────────────────────────────────────────────────
  const compile = useCallback(async () => {
    if (!environmentId) return
    const src = await ds.getBuildSources(environmentId)
    start({
      title: 'Confirmar Compilação',
      confirmLabel: 'Iniciar compilação',
      progressLabel: 'Compilando fontes',
      total: src.count || 1,
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {src.count} fonte(s) serão compilados no ambiente selecionado.
          </p>
          <PathList paths={src.files} />
        </div>
      ),
      run: async () => {
        const r = await ds.compile(environmentId)
        return { title: r.success ? 'Compilação concluída' : 'Compilação com falhas', success: r.success, message: r.message, items: itemsFromOp(r.results), logFile: r.logFile }
      },
    })
  }, [ds, environmentId, start])

  const patch = useCallback(async () => {
    if (!environmentId) return
    const data = await ds.getBuildPatches(environmentId)
    const hasSdf = data.patches.some((p) => p.hasSdf)
    start({
      title: 'Confirmar Aplicação de Patches',
      confirmLabel: 'Aplicar patches',
      progressLabel: 'Aplicando patches',
      total: data.count || 1,
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{data.count} patch(es) serão aplicados.</p>
          <div className="flex flex-col gap-1.5">
            {data.patches.map((p) => (
              <div key={p.file} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-hover)' }}>
                <div style={{ color: 'var(--text)' }}>{p.meta?.name ?? p.name}{p.meta?.version ? ` · ${p.meta.version}` : ''}{p.meta?.build ? ` · build ${p.meta.build}` : ''}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{p.name}</div>
              </div>
            ))}
          </div>
          {hasSdf && <AlertNote>Pasta SDF detectada. Após aplicar, execute o UPDDISTR no SmartClient antes de promover o RPO.</AlertNote>}
        </div>
      ),
      run: async () => {
        const r = await ds.applyPatch(environmentId)
        return { title: r.success ? 'Patches aplicados' : 'Aplicação com falhas', success: r.success, message: r.message, items: itemsFromOp(r.results), logFile: r.logFile }
      },
    })
  }, [ds, environmentId, start])

  const promote = useCallback(async () => {
    if (!environmentId) return
    const data = await ds.getPromoteDestinations(environmentId)
    // Seleção de destinos dentro do próprio confirm.
    const selected = new Set(data.destinations.map((d) => d.key))
    const PromoteBody = () => {
      const [, force] = useState(0)
      const toggle = (k: string) => { if (selected.has(k)) selected.delete(k); else selected.add(k); force((n) => n + 1) }
      return (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>Origem: {data.compilerSourcePath}</p>
          <div className="flex flex-col gap-1.5">
            {data.destinations.map((d) => (
              <label key={d.key} className="flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer" style={{ background: 'var(--surface-hover)' }}>
                <input type="checkbox" checked={selected.has(d.key)} onChange={() => toggle(d.key)} className="mt-1" style={{ accentColor: 'var(--primary)' }} />
                <div>
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{d.label}</div>
                  <div className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{d.sourcePath}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )
    }
    start({
      title: 'Promover RPO',
      confirmLabel: 'Promover',
      progressLabel: 'Promovendo RPO',
      total: data.destinations.length || 1,
      body: <PromoteBody />,
      run: async () => {
        const keys = Array.from(selected)
        if (!keys.length) return { title: 'Promoção não realizada', success: false, message: 'Selecione ao menos um destino.' }
        const r = await ds.promoteRpo(environmentId, keys)
        return { title: r.success ? 'RPO promovido' : 'Promoção com erros', success: r.success, message: r.message, items: r.results.map((x) => ({ name: x.name, success: x.success })) }
      },
    })
  }, [ds, environmentId, start])

  const rollback = useCallback(() => {
    if (!environmentId) return
    start({
      title: 'Rollback de RPO',
      confirmLabel: 'Executar rollback',
      progressLabel: 'Revertendo RPO',
      danger: true,
      total: 2,
      body: <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Os arquivos .bak serão restaurados em todos os slaves. Os RPOs atuais serão sobrescritos. Continuar?</p>,
      run: async () => {
        const r = await ds.rollbackRpo(environmentId)
        return { title: r.success ? 'Rollback concluído' : 'Rollback com erros', success: r.success, message: r.message, items: r.results.map((x) => ({ name: x.name, success: x.success })) }
      },
    })
  }, [ds, environmentId, start])

  const service = useCallback((name: string, action: 'start' | 'stop' | 'restart', displayName: string) => {
    if (!environmentId) return
    const verb = action === 'start' ? 'Iniciar' : action === 'stop' ? 'Parar' : 'Reiniciar'
    start({
      title: `${verb} serviço`,
      confirmLabel: verb,
      progressLabel: `${verb} ${displayName}`,
      danger: action === 'stop',
      body: <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{verb} o serviço <b style={{ color: 'var(--text)' }}>{displayName}</b>?</p>,
      run: async () => {
        await ds.controlService(environmentId, name, action)
        return { title: `${verb} concluído`, success: true, message: `${displayName}: ação "${action}" registrada.` }
      },
    })
  }, [ds, environmentId, start])

  // A4 (C4.6) — Renomear AppServer. UI/modal/validação prontos; datasource simulado.
  // No L3 apenas o datasource passa a chamar o endpoint real do Windows.
  const rename = useCallback((name: string, currentLabel: string) => {
    if (!environmentId) return
    let value = currentLabel
    const RenameBody = () => {
      const [v, setV] = useState(currentLabel)
      const trimmed = v.trim()
      const invalid = trimmed.length === 0 || trimmed.length > 80
      return (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Novo nome de exibição para <b style={{ color: 'var(--text)' }}>{currentLabel}</b>:</p>
          <TextInput value={v} onChange={(e) => { setV(e.target.value); value = e.target.value }} placeholder="Ex.: AppServer Faturamento" />
          {invalid && <p className="text-xs" style={{ color: 'var(--danger)' }}>{trimmed.length === 0 ? 'Informe um nome.' : 'Máximo de 80 caracteres.'}</p>}
        </div>
      )
    }
    start({
      title: 'Renomear serviço',
      confirmLabel: 'Renomear',
      progressLabel: `Renomeando ${currentLabel}`,
      body: <RenameBody />,
      run: async () => {
        const r = await ds.renameService(environmentId, name, value)
        return { title: r.success ? 'Serviço renomeado' : 'Não foi possível renomear', success: !!r.success, message: r.message }
      },
    })
  }, [ds, environmentId, start])

  const serviceAll = useCallback((action: 'start' | 'stop') => {
    if (!environmentId) return
    const verb = action === 'start' ? 'Iniciar todos' : 'Parar todos'
    start({
      title: verb,
      confirmLabel: verb,
      progressLabel: verb,
      danger: action === 'stop',
      total: 6,
      body: <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{verb} os serviços do ambiente? (o Exclusivo não é afetado)</p>,
      run: async () => {
        const r = await ds.controlAllServices(environmentId, action)
        return { title: `${verb} — concluído`, success: !!r.success, message: `${r.results?.length ?? 0} serviços processados.`, items: (r.results ?? []).map((x) => ({ name: x.service ?? '—', success: !!x.ok })) }
      },
    })
  }, [ds, environmentId, start])

  const exclusive = useCallback((active: boolean) => {
    if (!environmentId) return
    start({
      title: active ? 'Ativar Modo Exclusivo' : 'Encerrar Modo Exclusivo',
      confirmLabel: active ? 'Ativar exclusivo' : 'Encerrar exclusivo',
      progressLabel: active ? 'Ativando modo exclusivo' : 'Encerrando modo exclusivo',
      danger: active,
      total: active ? 7 : 6,
      body: active
        ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Isso irá parar todos os slaves, parar o debug (se ativo) e iniciar o appserver exclusivo (banner de manutenção). Continuar?</p>
        : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Isso irá parar o exclusivo e iniciar todos os slaves de produção. Continuar?</p>,
      run: async () => {
        const r = await ds.setExclusive(environmentId, active)
        return { title: active ? 'Modo Exclusivo ativado' : 'Modo Exclusivo encerrado', success: !!r.success, items: (r.results ?? []).map((x) => ({ name: `${x.action} · ${x.service ?? ''}`, success: !!x.ok })) }
      },
    })
  }, [ds, environmentId, start])

  const debug = useCallback((active: boolean) => {
    if (!environmentId) return
    start({
      title: active ? 'Ativar Modo Debug' : 'Desativar Modo Debug',
      confirmLabel: active ? 'Ativar debug' : 'Desativar debug',
      progressLabel: active ? 'Iniciando appserver de debug' : 'Parando appserver de debug',
      body: <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{active ? 'Inicia o appserver de debug (compilação/depuração). Os demais serviços não são afetados.' : 'Para o appserver de debug. Os demais serviços não são afetados.'} Confirmar?</p>,
      run: async () => {
        const r = await ds.setDebug(environmentId, active)
        return { title: active ? 'Modo Debug ativado' : 'Modo Debug desativado', success: !!r.success, message: r.serviceName }
      },
    })
  }, [ds, environmentId, start])

  const cleanSystem = useCallback(() => {
    if (!environmentId) return
    start({
      title: 'Limpeza da pasta System',
      confirmLabel: 'Executar limpeza',
      progressLabel: 'Limpando pasta System',
      danger: true,
      body: <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Remove arquivos *.tmp, sc*.log e sc*.cdx da pasta System e esvazia a pasta Spool. Confirmar?</p>,
      run: async () => {
        const r = await ds.cleanSystem(environmentId)
        return { title: 'Limpeza concluída', success: !!r.success, items: (r.results ?? []).map((x) => ({ name: x.pattern ?? '—', success: !!x.ok, sub: `${x.deleted ?? 0} removidos` })) }
      },
    })
  }, [ds, environmentId, start])

  const cleanTsk = useCallback(() => {
    if (!environmentId) return
    start({
      title: 'Limpar arquivos TSK',
      confirmLabel: 'Remover TSKs',
      progressLabel: 'Removendo arquivos TSK',
      danger: true,
      body: <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Remove todos os arquivos *.TSK das pastas dos appservers. Confirmar?</p>,
      run: async () => {
        const r = await ds.cleanTsk(environmentId)
        return { title: 'TSKs removidos', success: !!r.success, message: `${r.deleted ?? 0} arquivo(s) TSK removidos`, items: (r.results ?? []).map((x) => ({ name: x.dir ?? '—', success: !!x.ok, sub: `${x.deleted ?? 0} removidos` })) }
      },
    })
  }, [ds, environmentId, start])

  const modals = (
    <>
      {/* Confirmação */}
      {phase.kind === 'confirm' && (
        <Modal open onClose={cancel} title={phase.cfg.title}>
          <div className="flex flex-col gap-5">
            {phase.cfg.body}
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={cancel}>Cancelar</Button>
              <Button variant={phase.cfg.danger ? 'danger' : 'primary'} onClick={() => void accept()}>{phase.cfg.confirmLabel}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Progresso */}
      {phase.kind === 'running' && (
        <Modal open onClose={() => { /* bloqueado durante execução */ }} title="Executando">
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {phase.label}{phase.total > 1 ? `… ${Math.min(phase.done, phase.total)}/${phase.total}` : '…'}
            </div>
            {phase.total > 1 && (
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                <div className="h-full rounded-full transition-all duration-200" style={{ width: `${(Math.min(phase.done, phase.total) / phase.total) * 100}%`, background: 'var(--primary)' }} />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Resultado */}
      {phase.kind === 'result' && (
        <Modal open onClose={closeResult} title={phase.res.title}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: phase.res.success ? 'var(--success)' : 'var(--danger)' }}>
              {phase.res.success ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {phase.res.success ? 'Concluído com sucesso' : 'Concluído com erros'}
            </div>
            {phase.res.message && (
              <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{phase.res.message}</div>
            )}
            {phase.res.items && phase.res.items.length > 0 && (
              <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {phase.res.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" style={{ borderBottom: i < phase.res.items!.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate" style={{ color: 'var(--text)' }}>{it.name}</div>
                      {it.sub && <div className="text-xs" style={{ color: 'var(--text-light)' }}>{it.sub}</div>}
                    </div>
                    <Badge variant={it.success ? 'success' : 'danger'}>{it.success ? 'OK' : 'Falha'}</Badge>
                  </div>
                ))}
              </div>
            )}
            {phase.res.logFile && (
              <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: 'var(--text-light)' }}>
                <FileText size={12} /> Log: {phase.res.logFile}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="primary" onClick={closeResult}>Fechar</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )

  return { modals, compile, patch, promote, rollback, service, serviceAll, rename, exclusive, debug, cleanSystem, cleanTsk }
}

function PathList({ paths }: { paths: string[] }) {
  return (
    <div className="rounded-lg px-3 py-2 max-h-40 overflow-auto" style={{ background: 'var(--surface-hover)' }}>
      {paths.map((p) => (
        <div key={p} className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p}</div>
      ))}
    </div>
  )
}

function AlertNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}
