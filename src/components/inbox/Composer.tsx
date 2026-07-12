'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bot, CornerUpLeft, FileText, Image as ImageIcon, Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { botQuery, listChatUsers, sendMessage, sendTyping } from '@/lib/inbox'
import type { InboxMessage } from '@/types/inbox'

interface ComposerProps {
  conversationId: number
  placeholder?: string
  autoFocus?: boolean
  replyTo?: InboxMessage | null
  onCancelReply?: () => void
  /**
   * Conversa direta com o BOT: TODA mensagem vira pergunta ao @bot
   * (sem precisar do prefixo). Usado na conversa "BOT Minutor".
   */
  forceBot?: boolean
}

const BOT_PREFIX = /^@bot\b/i
// Detecta @palavra antes do cursor (palavra com letras/dígitos/_./-)
const MENTION_AT_CURSOR = /@([A-Za-zÀ-ÿ0-9_.-]*)$/

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export function Composer({ conversationId, placeholder, autoFocus = true, replyTo, onCancelReply, forceBot = false }: ComposerProps) {
  const qc = useQueryClient()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [botThinking, setBotThinking] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const lastTypingSentRef = useRef<number>(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const recorderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isBotQuery = forceBot || BOT_PREFIX.test(value.trimStart())

  // Autocomplete @ — buscar usuários só quando há query ativa
  const { data: mentionsRes } = useQuery({
    queryKey: ['chat-mentions', mentionQuery],
    queryFn: () => listChatUsers(mentionQuery ?? ''),
    enabled: mentionQuery !== null,
    staleTime: 30_000,
  })
  const candidates = useMemo(() => {
    const q = (mentionQuery ?? '').toLowerCase()
    const items = mentionsRes?.data ?? []
    // Sempre exibir "bot" como primeira opção quando o filtro casa
    const botMatch = 'bot'.startsWith(q) ? [{ id: -1, name: 'bot', email: 'IA do Minutor' }] : []
    return [...botMatch, ...items].slice(0, 6)
  }, [mentionsRes, mentionQuery])

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus()
  }, [conversationId, autoFocus])

  // Atualiza a query de menção a cada mudança de valor/seleção
  const updateMentionState = (txt: string, cursor: number) => {
    const before = txt.slice(0, cursor)
    const m = MENTION_AT_CURSOR.exec(before)
    if (m) {
      setMentionQuery(m[1])
      setMentionIdx(0)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (handle: string) => {
    const ta = ref.current
    if (!ta) return
    const cursor = ta.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const replaced = before.replace(MENTION_AT_CURSOR, `@${handle} `)
    const next = replaced + after
    setValue(next)
    setMentionQuery(null)
    // Reposiciona cursor após a menção inserida
    requestAnimationFrame(() => {
      const newPos = replaced.length
      ta.focus()
      ta.setSelectionRange(newPos, newPos)
    })
  }

  const startRecording = async () => {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorderStreamRef.current = stream
      recorderChunksRef.current = []
      // tenta formatos comuns; deixa o browser escolher se nenhum casa
      const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const mime = mimes.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      rec.ondataavailable = e => { if (e.data.size > 0) recorderChunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const ext = (rec.mimeType.includes('mp4') ? 'm4a' : (rec.mimeType.includes('ogg') ? 'ogg' : 'webm'))
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: rec.mimeType || 'audio/webm' })
        setFiles(prev => [...prev, file].slice(0, 10))
        stream.getTracks().forEach(t => t.stop())
        recorderStreamRef.current = null
        recorderRef.current = null
        if (recorderTimerRef.current) { clearInterval(recorderTimerRef.current); recorderTimerRef.current = null }
        setRecording(false)
        setRecordSecs(0)
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
      setRecordSecs(0)
      recorderTimerRef.current = setInterval(() => setRecordSecs(s => {
        // limite 5 minutos
        if (s >= 5 * 60 - 1) {
          stopRecording()
          return s
        }
        return s + 1
      }), 1000)
    } catch (e) {
      toast.error('Não foi possível acessar o microfone. Verifique as permissões.')
    }
  }

  const stopRecording = () => {
    try {
      recorderRef.current?.stop()
    } catch { /* ignore */ }
  }

  const cancelRecording = () => {
    if (recorderTimerRef.current) { clearInterval(recorderTimerRef.current); recorderTimerRef.current = null }
    try {
      const rec = recorderRef.current
      if (rec) {
        rec.ondataavailable = null
        rec.onstop = null
        rec.stop()
      }
    } catch { /* ignore */ }
    recorderStreamRef.current?.getTracks().forEach(t => t.stop())
    recorderStreamRef.current = null
    recorderRef.current = null
    recorderChunksRef.current = []
    setRecording(false)
    setRecordSecs(0)
  }

  const notifyTyping = () => {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3000) return
    lastTypingSentRef.current = now
    sendTyping(conversationId).catch(() => {/* silent */})
  }

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return
    const MAX = 20 * 1024 * 1024
    const accepted: File[] = []
    for (const f of incoming) {
      if (f.size > MAX) { toast.error(`${f.name} excede 20MB`); continue }
      accepted.push(f)
    }
    setFiles(prev => [...prev, ...accepted].slice(0, 10))
  }

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files))
  }

  const submit = async () => {
    const body = value.trim()
    const hasFiles = files.length > 0
    if ((!body && !hasFiles) || busy) return

    const asBot = forceBot || BOT_PREFIX.test(body)

    setBusy(true)
    if (asBot) setBotThinking(true)
    try {
      if (asBot) {
        if (hasFiles) {
          toast.error('Anexos ainda não são suportados em perguntas ao @bot.')
          return
        }
        await botQuery(conversationId, body)
      } else {
        await sendMessage(conversationId, body, {
          files: hasFiles ? files : undefined,
          replyToId: replyTo?.id,
        })
      }
      setValue('')
      setFiles([])
      onCancelReply?.()
      await qc.invalidateQueries({ queryKey: ['inbox-messages', conversationId] })
      await qc.invalidateQueries({ queryKey: ['inbox-conversations'] })
    } catch (e) {
      const msg = (e as Error).message
      toast.error(msg.includes('429') ? 'Aguarde alguns segundos antes de perguntar de novo ao BOT.' : msg)
    } finally {
      setBusy(false)
      setBotThinking(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Navegação no autocomplete de menções
    if (mentionQuery !== null && candidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(candidates.length - 1, i + 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => Math.max(0, i - 1));                    return }
      if (e.key === 'Escape')    { e.preventDefault(); setMentionQuery(null); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const sel = candidates[mentionIdx]
        if (sel) {
          e.preventDefault()
          const handle = sel.id === -1 ? 'bot' : sel.name.split(' ')[0]
          insertMention(handle)
          return
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      className={[
        'border-t border-[var(--brand-border)] bg-[var(--surface)] px-4 py-3 relative transition-colors',
        dragOver ? 'bg-emerald-500/10' : '',
      ].join(' ')}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center text-emerald-500 text-sm font-semibold border-2 border-dashed border-emerald-500/50 rounded-md pointer-events-none">
          Solte aqui para anexar
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={onPickFiles}
        className="hidden"
        accept="image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv"
      />
      <div className="max-w-4xl mx-auto space-y-1.5">
        {replyTo && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--surface-hover)] border-l-2 border-emerald-500/60">
            <CornerUpLeft size={12} className="mt-0.5 text-emerald-500 shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Respondendo a {replyTo.sender?.name ?? 'mensagem'}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">{replyTo.body}</p>
            </div>
            <button
              type="button"
              onClick={() => onCancelReply?.()}
              className="text-[var(--text-light)] hover:text-[var(--text)] shrink-0"
              title="Cancelar resposta"
            >
              <X size={12}/>
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {files.map((f, i) => {
              const isImg = f.type.startsWith('image/')
              const isAud = f.type.startsWith('audio/')
              return (
                <div key={i} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--surface-hover)] border border-[var(--brand-border)] text-xs text-[var(--text)] max-w-[240px]">
                  {isImg
                    ? <ImageIcon size={12} className="shrink-0 text-emerald-500"/>
                    : isAud
                      ? <Mic size={12} className="shrink-0 text-red-500"/>
                      : <FileText size={12} className="shrink-0 text-[var(--text-muted)]"/>}
                  <span className="truncate">{f.name}</span>
                  <span className="text-[10px] text-[var(--text-light)] shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-[var(--text-light)] hover:text-red-400">
                    <X size={11}/>
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {(isBotQuery || botThinking) && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            <Bot size={12} className={botThinking ? 'animate-pulse' : ''} />
            {botThinking
              ? 'BOT consultando o Minutor… isso pode levar alguns segundos'
              : 'O BOT vai responder esta mensagem consultando dados do Minutor'}
          </div>
        )}

        {/* Autocomplete de menções */}
        {mentionQuery !== null && candidates.length > 0 && (
          <div className="absolute bottom-full mb-1 left-4 right-4 max-w-md bg-[var(--surface)] border border-[var(--brand-border)] rounded-md shadow-lg overflow-hidden z-20">
            <p className="text-[10px] text-[var(--text-light)] uppercase tracking-wider px-3 pt-2 pb-1">Mencionar</p>
            {candidates.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setMentionIdx(i)}
                onClick={() => insertMention(c.id === -1 ? 'bot' : c.name.split(' ')[0])}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  i === mentionIdx ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]',
                ].join(' ')}
              >
                <div className={[
                  'w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0',
                  c.id === -1
                    ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-700/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-[var(--surface-hover)] text-[var(--text-muted)] ring-1 ring-[var(--brand-border)]',
                ].join(' ')}>
                  {c.id === -1 ? <Bot size={12}/> : initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text)] truncate">
                    {c.id === -1 ? 'bot' : c.name}
                    {c.id === -1 && <span className="ml-2 text-[10px] text-emerald-700 dark:text-emerald-300">IA</span>}
                  </p>
                  <p className="text-[10px] text-[var(--text-light)] truncate">{c.email}</p>
                </div>
              </button>
            ))}
            <p className="text-[10px] text-[var(--text-light)] px-3 pb-2 pt-1 border-t border-[var(--brand-border)]">
              ↑↓ navegar · Enter selecionar · Esc fechar
            </p>
          </div>
        )}

        {recording && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-xs text-red-700 dark:text-red-300 font-mono">
              Gravando {String(Math.floor(recordSecs / 60)).padStart(2, '0')}:{String(recordSecs % 60).padStart(2, '0')}
            </span>
            <span className="text-[11px] text-[var(--text-light)] flex-1">Clique em ⏹ pra parar e revisar, ou X pra cancelar.</span>
            <button type="button" onClick={cancelRecording} title="Cancelar gravação" className="text-red-400 hover:text-red-200">
              <X size={14}/>
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || botThinking || recording}
            title="Anexar arquivo (imagem, PDF, DOC, planilha)"
            aria-label="Anexar arquivo"
            className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-40 shrink-0"
          >
            <Paperclip size={16}/>
          </button>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={busy || botThinking}
            title={recording ? 'Parar gravação' : 'Gravar áudio'}
            aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
            className={[
              'p-2 rounded-md shrink-0 disabled:opacity-40',
              recording
                ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]',
            ].join(' ')}
          >
            {recording ? <Square size={14}/> : <Mic size={16}/>}
          </button>
          <textarea
            ref={ref}
            value={value}
            onChange={e => {
              setValue(e.target.value)
              updateMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length)
              if (e.target.value.trim().length > 0) notifyTyping()
            }}
            onKeyUp={e => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={botThinking}
            aria-label="Escrever mensagem"
            placeholder={placeholder ?? (forceBot
              ? 'Pergunte ao BOT — ex.: quais os contratos do cliente X'
              : 'Mensagem... Use @bot para perguntar ao BOT ou @usuario para mencionar alguém')}
            className={[
              'flex-1 resize-none border rounded-md px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-light)] focus:outline-none transition-colors disabled:opacity-60',
              isBotQuery
                ? 'bg-emerald-500/5 border-emerald-500/40 focus:border-emerald-500'
                : 'bg-[var(--bg)] border-[var(--brand-border)] focus:border-emerald-500',
            ].join(' ')}
          />
          <button
            type="button"
            disabled={busy || (!value.trim() && files.length === 0)}
            onClick={submit}
            aria-label={isBotQuery ? 'Perguntar ao BOT' : 'Enviar mensagem'}
            className={[
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              isBotQuery
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-emerald-500 text-white hover:bg-emerald-400',
            ].join(' ')}
          >
            {isBotQuery ? <Bot size={14} /> : <Send size={14} />}
            {isBotQuery ? 'Perguntar' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
