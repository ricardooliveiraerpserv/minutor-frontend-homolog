// Helpers compartilhados pelos campos da assinatura (extraídos de communication/email-blocks
// para evitar arrastar o editor rich-text). Mantêm os mesmos estilos/tokens do design system.

export const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const
export const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none w-full'
export const lbl = 'text-[11px] font-semibold block mb-0.5'

/** Lê uma imagem e devolve um data URL JPEG quadrado 128px (avatar da assinatura). */
export function photoToDataUrl(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const S = 128
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S
      const ctx = canvas.getContext('2d'); URL.revokeObjectURL(url)
      if (!ctx) return resolve('')
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}
