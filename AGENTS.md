<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system — adoção progressiva

Tokens e classes em `src/app/globals.css`. Guia completo + exemplos antes/depois em `docs/DESIGN_SYSTEM.md`.

**Regra forte:** ao alterar qualquer componente, refatore as cores hardcoded dele para tokens / `.ds-*`. Nunca introduzir cor nova hardcoded (`#xxxxxx`, `rgba(...)` para semântica, classes `bg-zinc-9XX`/`border-zinc-8XX`).

Use:
- `var(--bg)` / `var(--surface)` / `var(--surface-hover)` / `var(--border)` para estrutura
- `var(--text)` / `var(--text-muted)` / `var(--text-light)` para texto
- `var(--primary)` / `var(--primary-hover)` / `var(--primary-soft)` / `var(--primary-fg)` para identidade
- `var(--success|warning|danger)` + `*-bg` para status
- `.ds-card` / `.ds-btn-primary` / `.ds-btn-secondary` / `.ds-input` / `.ds-status-*` / `.ds-filter-active` / `.ds-row-hover` quando o caso couber

Sempre testar nos dois temas (light + dark) antes de mergear.
