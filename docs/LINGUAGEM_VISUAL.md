# Linguagem Visual do Minutor (Sprint 0)

> **Camada de princípios.** Este documento vem ANTES dos componentes. Toda tela do
> Minutor — presente ou futura — obedece a estas regras. Nenhum componente pode
> fugir daqui. Detalhe de implementação (tokens/classes) vive em `DESIGN_SYSTEM.md`
> e `src/app/globals.css`; **o "porquê" e a hierarquia vivem aqui.**
>
> Foco: **tema claro** (onde a inconsistência mais dói hoje). As mesmas regras valem
> para o dark, respeitando os tokens equivalentes.

---

## Identidade

**Se o Minutor fosse uma pessoa: elegante, técnico, corporativo, moderno e discreto.**

Consequência prática: o cyan (`--primary`) é uma **assinatura pontual**, não uma festa
de cores. Sobriedade é o default; cor é exceção com significado. Nada de caixa colorida
decorativa, nada de gradiente sem função, nada de "vibrante por ser bonito".

---

## 1. Hierarquia visual (lei imutável)

```
Aplicação → Página (header) → Seções → Cards → Conteúdo → Ações
```

- Cada nível **recua** em relação ao anterior: menos cor, menos peso, menos elevação
  conforme se desce.
- Uma **ação nunca grita mais que o dado** que ela modifica — exceto o CTA dominante
  da página (ver §6).
- Nunca inverter a ordem.

## 2. Superfícies — 4 níveis com valor fixo

Corrige o "tudo branco/chapado" e a inversão atual (input mais escuro que o card).

| Nível | Uso | Claro | Reconhecido por |
|---|---|---|---|
| **0 — Aplicação** | fundo geral | `#EAEEF4` | ser o mais escuro; faz os cards flutuarem |
| **1 — Painel** | sidebar, coluna de kanban, seção | `#F2F5F9` | tom entre app e card |
| **2 — Card** | cards, modais | `#FFFFFF` + borda `#E2E8F0` + `shadow-xs` | branco elevado |
| **3 — Interativo** | input, select, ghost | `#FFFFFF` + borda forte `#CBD5E1` | pela **borda**, não por ser mais escuro |

Regra: **card nunca tem cor de fundo decorativa.** Fundo só muda para comunicar estado
(selecionado, erro, sucesso) — nunca por estética.

## 3. Escala de contraste (cada degrau perceptível)

```
App #EAEEF4 → Painel #F2F5F9 → Card #FFF → Input branco+borda forte → Hover #F1F5F9 → Selecionado primary-soft
```

**Texto** (contraste garantido no claro):
- Primário `#0F172A` · Secundário `#475569` · Terciário `#64748B` (subir do `#94A3B8`
  atual, que falha WCAG).

Proibido: separar camadas com `rgba(255,255,255,0.0x)` — some no claro. Hover/zebra
usam `--surface-hover` real.

## 4. Onde existe cor (cor = informação, nunca decoração)

| Cor | Significado ÚNICO |
|---|---|
| **Cyan (primary)** | ação primária · navegação ativa · foco |
| **Verde** | sucesso |
| **Laranja** | atenção |
| **Vermelho** | erro |
| **Cinza** | neutro |

Nada além disso. Número importante ganha destaque por **peso/tamanho**, não por cor.

## 5. Densidade oficial (3 níveis, por natureza da tela)

| Densidade | Onde | Linha | Fonte base |
|---|---|---|---|
| **Alta** | Financeiro, Fechamento, Rentabilidade, tabelas | 32–36px | 12–13px |
| **Média** | Kanbans, Cadastros, listas operacionais | 40–44px | 13–14px |
| **Baixa** | Dashboard executivo, Meu Painel | cards espaçados | 14–16px |

Cada tela declara sua densidade e é consistente com ela do início ao fim.

## 6. Regra do destaque (antídoto do "tudo compete")

**Um único elemento dominante por tela.** Normalmente o CTA primário OU o KPI-chave.

- No repouso, **apenas 1 elemento cyan-preenchido** visível por view.
- Badges ficam quietos (fundo suave, sem borda — a menos que seja status).
- Bordas, ícones e barras não disputam atenção.

> Se tudo chama atenção, nada chama atenção.

## 7. Estados (spec único para todo componente)

| Estado | Regra |
|---|---|
| Hover | fundo `--surface-hover`, transição 120ms |
| Focus | ring 2px `--ring` (cyan @30%) |
| Active | −1 tom |
| Disabled | opacidade 40%, sem cursor |
| Selected | `--primary-soft` + barra 3px `--primary` à esquerda |
| Loading | `Skeleton` |
| Empty | `EmptyState` |
| Error / Success | fundo+borda+ícone semânticos |

## 8. Densidade → componente → token

Todo componente novo referencia: **(a)** um nível de superfície (§2), **(b)** a densidade
da tela (§5), **(c)** os estados (§7) e **(d)** cor só se comunicar informação (§4).
Se não encaixar, o componente está errado — não a regra.

---

## Como isto é fiscalizado

- **`DESIGN_SYSTEM.md`** — tokens/classes/componentes canônicos.
- **`scripts/ds-scorecard.mjs`** — mede aderência (hoje → meta) a cada sprint.
- **Governança (Sprint 9)** — lint/CI bloqueia hex/rgba/zinc/slate/`bg-white/x` e a
  criação de novo modal/badge/card/botão fora dos oficiais.

Roadmap: Sprint 0 (este doc) → 1 Tema claro → 2 Cores hardcoded → 3 Componentes base →
4 Tabelas → 5 Modais → 6 Kanbans/Saúde → 7 Headers/Filtros/KPIs → 8 Formulários/a11y →
9 Governança.
