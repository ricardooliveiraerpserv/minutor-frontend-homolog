<!--
  Obrigado por contribuir! Preencha as seções relevantes abaixo.
  Pode apagar seções que não se aplicam ao seu PR.
-->

## Resumo

<!-- 1-3 bullets sobre o que muda e por quê. -->

-

## Como testar

<!-- Passos pra reviewer reproduzir. Inclui dados de exemplo se útil. -->

- [ ]
- [ ]

## 🎨 Design System

> Regras completas: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

- [ ] **Não introduzi** cores hardcoded (`#xxxxxx`, `rgb(...)`, `rgba(...)`)
- [ ] **Não introduzi** classes Tailwind dark-only (`bg-zinc-9XX`, `border-zinc-7/8XX`, `text-zinc-XXX`)
- [ ] Usei tokens (`var(--surface)`, `var(--text)`, `var(--primary)`, etc.) ou utility classes (`.ds-card`, `.ds-btn-primary`, `.ds-status-*`) onde aplicável
- [ ] Se **alterei componente existente** com cores hardcoded, **migrei** as cores tocadas para tokens (regra de migração progressiva)
- [ ] Validado **light** e **dark** sem regressão

> O CI roda um check de cores hardcoded e adiciona warnings inline. Warnings não bloqueiam o merge mas indicam pontos pra refatorar.

## Checklist geral

- [ ] `npm run build` ou `npx tsc --noEmit` passa
- [ ] Sem `console.log` esquecido
- [ ] Sem segredos no commit (env, tokens, chaves)
