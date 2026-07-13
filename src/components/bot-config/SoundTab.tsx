'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { CHAT_TONES, DEFAULT_TONE, DEFAULT_VOLUME, playChatSound } from '@/lib/chat-prefs'

/**
 * Aba "Som" da Configuração BOT — toque e volume GLOBAIS de notificação do chat.
 * Grava em system-settings (chat_notification_sound / chat_notification_volume);
 * o valor chega a todos os usuários no /me. Cada pessoa ainda pode se silenciar.
 */
export function SoundTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tone, setTone] = useState<string>(DEFAULT_TONE)
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME)

  useEffect(() => {
    api.get<Record<string, unknown>>('/system-settings')
      .then(s => {
        const data = (s as { data?: Record<string, unknown> }).data ?? s
        if (data?.chat_notification_sound) setTone(String(data.chat_notification_sound))
        if (data?.chat_notification_volume != null) setVolume(Number(data.chat_notification_volume))
      })
      .catch(() => { /* usa defaults */ })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/system-settings', { chat_notification_sound: tone, chat_notification_volume: volume })
      toast.success('Som salvo — vale para todos')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-40 bg-zinc-800" />

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Toque ao receber mensagem</label>
        <div className="flex items-center gap-2">
          <select
            value={tone}
            onChange={e => setTone(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-md text-zinc-100 h-9 px-2 w-56 text-sm"
          >
            {CHAT_TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => playChatSound(tone, volume)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <Play size={14} /> Ouvir
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">Vale para todos os usuários. Cada pessoa ainda pode silenciar para si no ícone de mensagens.</p>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-2">Volume — {volume}%</label>
        <input
          type="range" min={0} max={100} step={5}
          value={volume}
          onChange={e => setVolume(Number(e.target.value))}
          className="w-56 accent-emerald-500"
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center h-9 px-4 rounded-md text-sm font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  )
}
