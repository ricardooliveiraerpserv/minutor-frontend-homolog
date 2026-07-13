// Preferências de chat por navegador (localStorage). Não precisa de backend —
// silenciar o som é uma escolha local do usuário.

const SOUND_KEY = 'minutor.chatSound'

/** Som de notificação de mensagem ligado? (padrão: ligado) */
export function isChatSoundOn(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(SOUND_KEY) !== 'off'
}

/** Liga/desliga o som e avisa a UI (mesma aba) via evento. */
export function setChatSoundOn(on: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  window.dispatchEvent(new Event('chat-sound-changed'))
}

/** "Ding" curto de 2 notas via Web Audio — sem arquivo de áudio, sem rede. */
export function playChatSound(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.12
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(t); osc.stop(t + 0.2)
    })
    setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch { /* navegador bloqueou áudio até interação — silêncio */ }
}
