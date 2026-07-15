// Preferências de chat.
// - Silenciar (on/off) é uma escolha LOCAL do usuário (localStorage).
// - Toque e volume são GLOBAIS (definidos em Configurações, vêm no /me).

const SOUND_KEY = 'minutor.chatSound'

/** Som de notificação ligado para ESTE usuário/navegador? (padrão: ligado) */
export function isChatSoundOn(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(SOUND_KEY) !== 'off'
}

/** Liga/desliga o som (local) e avisa a UI da mesma aba. */
export function setChatSoundOn(on: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  window.dispatchEvent(new Event('chat-sound-changed'))
}

// ── Catálogo de toques (sintetizados via Web Audio — sem arquivo/rede) ──────────

type Note = { f: number; t: number; d: number; type?: OscillatorType }

export const CHAT_TONES: { id: string; label: string }[] = [
  { id: 'ding',   label: 'Ding (padrão)' },
  { id: 'tri',    label: 'Tri-tom (subida)' },
  { id: 'chime',  label: 'Sino' },
  { id: 'pop',    label: 'Pop' },
  { id: 'alerta', label: 'Alerta (2 bips)' },
  { id: 'suave',  label: 'Suave' },
]

export const DEFAULT_TONE = 'ding'
export const DEFAULT_VOLUME = 70

const TONE_NOTES: Record<string, Note[]> = {
  ding:   [{ f: 880, t: 0, d: 0.18 }, { f: 1180, t: 0.12, d: 0.18 }],
  tri:    [{ f: 660, t: 0, d: 0.14 }, { f: 880, t: 0.1, d: 0.14 }, { f: 1100, t: 0.2, d: 0.2 }],
  chime:  [{ f: 1318.5, t: 0, d: 0.5, type: 'triangle' }, { f: 1760, t: 0.06, d: 0.5, type: 'triangle' }],
  pop:    [{ f: 520, t: 0, d: 0.08 }, { f: 1040, t: 0.05, d: 0.1 }],
  alerta: [{ f: 784, t: 0, d: 0.12, type: 'square' }, { f: 784, t: 0.18, d: 0.12, type: 'square' }],
  suave:  [{ f: 587, t: 0, d: 0.22 }, { f: 740, t: 0.14, d: 0.26 }],
}

/**
 * Toca um toque do catálogo. volume 0–100 (padrão 70). Bem mais alto que a v1.
 * Navegadores bloqueiam áudio até a 1ª interação do usuário — nesse caso fica em silêncio.
 */
export function playChatSound(toneId: string = DEFAULT_TONE, volume: number = DEFAULT_VOLUME): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const notes = TONE_NOTES[toneId] ?? TONE_NOTES[DEFAULT_TONE]
    const vol = Math.max(0, Math.min(100, volume)) / 100
    const peak = 0.9 * vol // pico de ganho — v1 era 0.25 fixo

    const ctx = new Ctx()
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)

    const now = ctx.currentTime
    let end = 0
    notes.forEach(n => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = n.type ?? 'sine'
      osc.frequency.value = n.f
      const t0 = now + n.t
      const t1 = t0 + n.d
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t1)
      osc.connect(gain); gain.connect(master)
      osc.start(t0); osc.stop(t1 + 0.02)
      end = Math.max(end, t1)
    })
    setTimeout(() => ctx.close().catch(() => {}), (end - now) * 1000 + 400)
  } catch { /* silêncio */ }
}
