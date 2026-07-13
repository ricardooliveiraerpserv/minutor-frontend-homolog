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
