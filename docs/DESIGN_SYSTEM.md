# Design System — Minutor

Guia rápido para padronizar a UI. Tokens e classes vivem em `src/app/globals.css`.

---

## 🚨 Regra obrigatória

**Toda alteração em componente existente DEVE migrar o uso de cores tocadas para tokens do DS.** PRs que introduzirem cores hardcoded ou classes Tailwind dark-only não devem ser aprovados.

Aplicação:
- Componentes **novos** → 100% tokens do DS desde o primeiro commit.
- Componentes **existentes** → migração progressiva: ao tocar para qualquer outro motivo, refatore as cores afetadas.
- Reviewer rejeita PR que introduza `#xxxxxx`, `rgba(...)`, `bg-zinc-9XX`, `border-zinc-7/8XX`, `text-zinc-XXX` (entre outras famílias `neutral|slate|gray`).

Detecção automática: o workflow `.github/workflows/design-system-check.yml` adiciona warnings inline em PRs que violem a regra. Warnings **não bloqueiam o merge** — servem como guia para o reviewer.

---

## Regras

### ❌ Proibido

- **Cores hardcoded** no inline style ou em classes Tailwind:
  ```tsx
  // ruim
  <div style={{ background: '#161618', color: '#FAFAFA', border: '1px solid #27272A' }}>
  <div className="bg-zinc-900 border border-zinc-800 text-zinc-200">
  ```
- **`rgba()` solto** para cores semânticas:
  ```tsx
  // ruim
  <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>aprovado</span>
  ```
- **Bg pastel + texto da mesma cor** (anti-pattern de contraste):
  ```tsx
  // ruim — pastel sobre pastel = ilegível
  <div className="bg-cyan-100 text-cyan-500">…</div>
  <div className="bg-green-100 text-green-500">…</div>
  // bom — par garantido pelo design system
  <div className="ds-bg-primary-soft">…</div>
  <div className="ds-bg-success">…</div>
  ```
- **Card com fundo colorido pra "decorar"** — use `.ds-card-highlight-{primary,success,warning,danger,info}` (destaque vai na borda lateral, não no fundo).
- **Misturar cor de marca** com cinza neutro pra "atalhar" estado.

> **Regra de ouro:** cor não define UI — **contraste define UI**. Sempre par bg+fg pensado.

### ✅ Obrigatório

Sempre que tocar um componente:

1. **Substituir cores** por tokens (`var(--surface)`, `var(--text)`, etc.)
2. **Aplicar classes `.ds-*`** quando o caso couber (`.ds-card`, `.ds-btn-primary`, `.ds-status-success`, etc.)
3. **Testar nos dois temas** (light + dark) antes de marcar pronto.

---

## Tokens

### Estrutura

| Token | Uso |
|---|---|
| `--bg` | fundo geral da página |
| `--surface` | cards, modais, containers |
| `--surface-hover` | hover de linhas/cards |
| `--border` | divisores, contornos |

### Texto

| Token | Uso |
|---|---|
| `--text` | títulos, valores fortes |
| `--text-muted` | descrições, subtítulos |
| `--text-light` | labels, IDs, legendas |

### Identidade

| Token | Uso |
|---|---|
| `--primary` | CTA principal, link ativo, ícones de ação |
| `--primary-hover` | hover do primary |
| `--primary-soft` | seleção/highlight leve, filtro ativo |
| `--primary-fg` | cor de texto **sobre** `--primary` (branco no light, preto no dark) |
| `--brand-logo` | **identidade da marca** (cor do logo). Independente do `--primary` — permite evoluir UI e marca em separado. Use só no logo/marca, nunca em UI. |

### Status (semânticas)

| Token / `*-bg` | Uso |
|---|---|
| `--success` / `--success-bg` | aprovação, saldo positivo |
| `--warning` / `--warning-bg` | atenção, prazo |
| `--danger` / `--danger-bg` | erro, excedido |

> Tokens `--brand-*` ainda existem (são a fonte de verdade das cores). Os novos `--bg`/`--surface`/etc. são **aliases semânticos**. Use os semânticos em código novo.

---

## Utility classes (`.ds-*`)

```tsx
// Card + slots
<div className="ds-card ds-card-pad">
  <p className="ds-card-header">TOTAL DE SERVIÇOS</p>
  <h3 className="ds-card-title">R$ 12.345,00</h3>
  <p className="ds-card-sub">vs R$ 10.000 mês anterior</p>
</div>

// Botões
<button className="ds-btn-primary">Salvar</button>
<button className="ds-btn-secondary">Cancelar</button>
<button className="ds-btn-ghost">Mais opções</button>

// Input
<input className="ds-input" />

// Status pills (combinar .ds-status com a variante)
<span className="ds-status ds-status-success">Aprovado</span>
<span className="ds-status ds-status-warning">Pendente</span>
<span className="ds-status ds-status-danger">Rejeitado</span>
<span className="ds-status ds-status-info">Em análise</span>

// Tabela
<table className="ds-table">
  <thead><tr><th>Cliente</th><th>Saldo</th></tr></thead>
  <tbody>
    <tr><td>Acme</td><td>R$ 100</td></tr>
  </tbody>
</table>

// BG + foreground em par (substitui bg-cyan-100/text-cyan-500 e similares)
<div className="ds-bg-primary px-3 py-2 rounded">CTA cyan denso + texto branco</div>
<div className="ds-bg-primary-soft px-3 py-2 rounded">badge cyan claro + texto cyan denso</div>
<div className="ds-bg-success px-3 py-2 rounded">aprovado: verde claro + verde escuro</div>
<div className="ds-bg-warning px-3 py-2 rounded">pendente: amarelo claro + laranja escuro</div>
<div className="ds-bg-danger px-3 py-2 rounded">erro: vermelho claro + vermelho escuro</div>
<div className="ds-bg-info px-3 py-2 rounded">info: azul claro + azul escuro</div>

// Card com destaque via BORDA (não fundo colorido)
<div className="ds-card ds-card-highlight-primary ds-card-pad">…</div>
<div className="ds-card ds-card-highlight-warning ds-card-pad">…</div>

// Filtro selecionado
<button className="ds-filter-active">Hoje</button>

// Linha de tabela com hover (avulso)
<tr className="ds-row-hover">…</tr>

// Tab
<button className={active ? 'ds-tab-active' : 'ds-tab-inactive'}>…</button>

// Link
<Link className="ds-link" href="/x">Ver tudo</Link>

// Sidebar
<aside className="sidebar">
  <Link className={`sidebar-item ${active && 'sidebar-item-active'}`}>Início</Link>
</aside>

// Kanban (opt-in alias do que hoje é inline)
<div className={`ds-kanban-column ${isDraggingOver && 'ds-kanban-column-active'}`}>
  <p className="ds-kanban-column-header">Backlog</p>
  …
</div>
```

Implementação em `src/app/globals.css` (seção "Design system utilities").

---

## Migração — adoção progressiva

**Sem refactor massivo.** A regra é:

> Toda vez que **alterar** um componente por outro motivo, aproveite e refatore as cores hardcoded dele para tokens / `.ds-*`.

### Prioridade quando houver sprint dedicada

1. **Tabelas** (mais visíveis, mais reuso)
2. **Cards** (segunda em peso visual)
3. **Filtros** (estado ativo precisa contraste)
4. **Inputs** (consistência de focus)

---

## Antes / depois

### Card
```tsx
// antes
<div
  className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5"
  style={{ background: '#161618' }}
>

// depois
<div className="ds-card px-6 py-5">
```

### Botão primário
```tsx
// antes
<button style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
  Salvar
</button>

// depois
<button className="ds-btn-primary">Salvar</button>
```

### Status pill
```tsx
// antes
<span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
  Aprovado
</span>

// depois
<span className="ds-status-success">Aprovado</span>
```

### Texto secundário
```tsx
// antes
<p className="text-zinc-400">descrição</p>

// depois
<p style={{ color: 'var(--text-muted)' }}>descrição</p>
// ou (quando tocar Tailwind config no futuro):
<p className="text-muted">descrição</p>
```

---

## Como validar antes de mergear

- [ ] Componente renderizado no tema **light**: contraste OK, cores adequadas
- [ ] Mesmo componente no tema **dark**: visual idêntico ao anterior (sem regressão)
- [ ] Nenhum `#xxxxxx` ou `rgba(...)` hardcoded de cor introduzido
- [ ] Hover/focus/disabled têm tokens próprios (`--surface-hover`, `--primary-soft`, etc.)

---

## Suporte ao tema (`next-themes`)

Toggle no header. Persiste em `localStorage`. Respeita `prefers-color-scheme` no primeiro acesso. `defaultTheme="dark"` como fallback.

Configurado em `src/app/providers.tsx`.
