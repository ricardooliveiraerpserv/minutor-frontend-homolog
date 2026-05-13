'use client'

export default function HorasPage() {
  return (
    <div style={{
      padding: '48px 24px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      border: '1px dashed var(--border)',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
        Visão de horas em construção
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        Em breve: timesheets do projeto, breakdown por consultor e por etapa.
      </div>
    </div>
  )
}
