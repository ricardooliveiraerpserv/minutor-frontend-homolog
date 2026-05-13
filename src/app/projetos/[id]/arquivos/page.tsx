'use client'

export default function ArquivosPage() {
  return (
    <div style={{
      padding: '48px 24px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      border: '1px dashed var(--border)',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
        Arquivos em construção
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        Em breve: upload e versionamento de anexos do projeto.
      </div>
    </div>
  )
}
