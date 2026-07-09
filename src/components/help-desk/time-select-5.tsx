'use client'

// Seletor de horário em passos de 5 minutos, DETERMINÍSTICO — não depende do picker
// nativo do navegador (o <input type="time" step=300> não força 5min no wheel de todos
// os browsers). Dois selects (hora + minuto) que emitem 'HH:MM' (ou '' quando vazio).

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export function TimeSelect5({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel?: string
}) {
  const [h, m] = value ? value.split(':') : ['', '']
  const emit = (nh: string, nm: string) => {
    if (!nh && !nm) { onChange(''); return }
    onChange(`${nh || '00'}:${nm || '00'}`)
  }
  const sel: React.CSSProperties = { height: 30, fontSize: 12, padding: '0 6px', width: 52 }
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={ariaLabel}>
      <select className="ds-input" style={sel} value={h} onChange={e => emit(e.target.value, m || '00')} aria-label="Hora">
        <option value="">--</option>
        {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <span style={{ color: 'var(--text-light)' }}>:</span>
      <select className="ds-input" style={sel} value={m} onChange={e => emit(h || '00', e.target.value)} aria-label="Minuto">
        <option value="">--</option>
        {MINS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  )
}
