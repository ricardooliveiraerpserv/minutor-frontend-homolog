# Design System do Minutor — **v1.0 · CONGELADO** 🔒

> **Status: OFICIAL e CONGELADO (2026-07-02).** Esta é a única referência de linguagem visual do Minutor. Toda nova implementação segue esta fundação. **Não reabrir discussão de identidade** — evoluções técnicas acontecem na Sprint 2 (consolidação de arquitetura), sem alterar a linguagem aqui definida.
>
> Fonte de verdade dos valores: `src/app/globals.css` (bloco `:root` = claro, bloco `.dark` = escuro). Preview histórico: `docs/calibracao-tema-claro.html`.

---

## 1. Princípios (invioláveis)

1. **Azul/cyan não é superfície.** Fundo, painel, card, header, sidebar, modal, toolbar → branco/cinza neutro. O cyan (`--primary`) só aparece em **ação / link / foco / seleção / item ativo / progresso**.
2. **Branco não causa glare.** Cards usam branco suavizado (`--surface` = `#FBFBFD`), nunca `#FFFFFF` cru.
3. **Profundidade vem de elevação** (superfície + borda + sombra + espaço), nunca de cor.
4. **Cor comunica ESTADO** (sucesso/atenção/erro/info/roxo), não decora. Estado nunca usa `--primary`/`--primary-soft`.
5. **Conteúdo antes da decoração.** Números pretos, texto legível, cor reservada ao que importa.
6. **Consistência total** — todos os módulos pertencem ao mesmo produto.

---

## 2. Paleta oficial — TEMA CLARO (`:root`)

### Superfícies (escala de luminância)
| Token | Hex | Uso |
|---|---|---|
| `--brand-bg` / `--bg` | `#E3E5EA` | fundo da aplicação |
| `--brand-panel` / `--panel` | `#F0F1F4` | painéis/containers (colunas kanban, seções, filtros) |
| `--brand-surface` / `--surface` | `#FBFBFD` | cards, tabela, modal, drawer (branco suavizado) |
| `--surface-hover` | `#ECEDF1` | hover de linha/item |
| `--surface-sunken` | `#F1F2F5` | header de tabela / zebra / track |
| `--field` | `#F5F6F8` | superfície de input |
| `--brand-border` / `--border` | `#E2E4E9` | borda hairline (única) |
| `--border-strong` | `#CBCFD7` | divisor forte / hover de input |

### Texto
| Token | Hex | Uso |
|---|---|---|
| `--brand-text` / `--text` | `#14161B` | títulos, valores, números |
| `--text-muted` (`--brand-muted`) | `#475569` | secundário |
| `--text-light` (`--brand-subtle`) | `#64748B` | terciário / placeholder |

### Ação (cyan sóbrio) + foco
| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#157582` | botão primário, link, ativo, seleção |
| `--primary-hover` | `#0E5C67` | hover do primário |
| `--primary-soft` | `#E9F0F1` | fundo de foco/hover de ação (NEUTRO — nunca estado) |
| `--primary-fg` | `#FFFFFF` | texto sobre `--primary` |
| `--ring` | `rgba(21,117,130,.32)` | anel de foco |
| `--brand-logo` | `#06B6D4` | **só a marca/logo** (cyan vibrante) |

### Estados semânticos (fortes — só comunicam estado)
| Token | texto / -bg / -border | Uso |
|---|---|---|
| `--success*` | `#15803D` / `#DCFCE7` / `#22C55E` | ativo, saudável, aprovado, assinado, pago |
| `--warning*` | `#B45309` / `#FEF3C7` / `#F59E0B` | atenção, pendente, em testes, homologação, aberto, vencido |
| `--danger*` | `#B91C1C` / `#FEE2E2` / `#EF4444` | erro, reprovado, conflito, crítico |
| `--info*` | `#0369A1` / `#E0F2FE` / `#0EA5E9` | em andamento, execução, liberado, info, triagem, progresso |
| `--purple*` | `#6D28D9` / `#EDE9FE` / `#8B5CF6` | ajuste solicitado, aporte, aditivo, especial |
| `--neutral-bg` / `--text-muted` | — | neutro, encerrado, inativo, finalizado |

> **Tema escuro (`.dark`) — CONGELADO e intacto.** Redefine todos os tokens (ex.: `--primary` = `#00F5FF`, `--brand-bg` = `#0A0A0B`, sombras `none`). Nenhum valor dark muda nesta v1.0.

---

## 3. Escalas oficiais

**Radius:** `--radius` 10px (cards/painéis) · `--radius-sm` 8px (controles) · badge 6px · pill `rounded-full` (chips de status).
**Sombras (elevação: painel < card < dropdown < popover < modal):**
`--shadow-xs`/`--shadow-sm` (card) · `--shadow-md` (dropdown) · `--shadow-lg` (popover) · `--shadow-overlay` (modal). Dark = `none`.
**Tipografia:** `.ds-text-h1` 20/600 · `.ds-text-h2` 16/600 · body 14/400 · `.ds-text-kpi` 24/600 (letter-spacing −.02em) · números com `font-variant-numeric: tabular-nums`.
**Espaçamento (ritmo):** escala `4 · 8 · 12 · 16 · 20 · 24`.
**Transições:** `.12s` para hover/estado.

---

## 4. Hierarquia visual (padrões oficiais)

- **Sidebar:** fundo `--sidebar`/`--panel`; hover `--surface-hover`; **ativo** = neutro + barra `inset 3px 0 0 var(--primary)` + texto `--text` + ícone `--primary`; grupos com divisor `--border`.
- **Page header:** ícone em chip `--panel`; título 20-21px `--text`; subtítulo `--text-muted`; **divisor inferior** `1px --border`.
- **Cards / KPIs:** `--surface` + `--border` + `--shadow-sm`; KPI = número preto, label `--text-muted`, ícone em chip de estado, tendência ▲▼ com success/danger; hover eleva.
- **Tabelas:** header `--surface-sunken`; zebra suave; hover `--surface-hover`; selecionada `--selected`/`--primary-soft` + barra `--primary`; números tabulares `--text`; link = `--primary`.
- **Tabs/toggle:** trilho `--surface-sunken`; ativa = `--primary` + `--primary-fg` (contador com texto claro) OU branca + indicador; inativa = `--text-muted`.
- **Modais/Drawers:** backdrop escuro; superfície `--surface`; `--shadow-overlay`; header/footer com padding simétrico.
- **Badges:** `*-bg` + `*` (texto), radius 6px — leves.

---

## 5. Componentes oficiais (usar SEMPRE)

`Button` · `Input` · `Select` · `SearchSelect` · `MultiSelect` · `Modal` (+Header/Body/Footer) · `Drawer/Sheet` · `DataTable` · `KpiCard` · `Badge` / `StatusBadge` (via `getStatusMeta`) · `DropdownMenu` · `Popover` · `Tooltip` · `Toast` · `DateRangePicker` · `PageHeader`.

> Registro de status = `STATUS_META` (`components/ui/status-badge.tsx`) + `BADGE_STYLES` (`components/ds/index.tsx`). Novos status entram AQUI, não em mapas locais.

---

## 6. Componentes / padrões PROIBIDOS ❌

Nunca introduzir:
- `bg-white` puro (use `bg-[var(--surface)]`)
- `text-white` fora de fundo colorido/ação (use `text-[var(--text)]`; sobre `--primary` use `--primary-fg`)
- `bg-cyan-*` / `text-cyan-*` / `border-cyan-*` estrutural (use `--primary`)
- `#00F5FF` / `rgba(0,245,255,x)` hardcoded (use `var(--primary)` / `--primary-soft`)
- `bg-*-950` / `bg-*-900` como fundo de badge (resquício dark)
- hex/rgba semânticos hardcoded (`#22C55E`, `#EF4444`, `rgba(...)`) — use tokens `--success*`/`--danger*`/etc.
- `bg-zinc-*` / `bg-slate-*` / `text-zinc-*` estrutural (use tokens neutros)
- `--primary`/`--primary-soft` para comunicar ESTADO (use o token semântico)
- sombra/borda/radius hardcoded — use os tokens de escala
- reimplementar componente que já existe (SearchSelect, Modal, KpiCard…)

---

## 7. Checklist para todo componente novo

- [ ] Usa **tokens** (cor/sombra/radius/espaçamento), zero hardcode?
- [ ] Usa os **componentes oficiais** (não reimplementa)?
- [ ] Respeita **espaçamento** (escala 4/8/12/16/20/24)?
- [ ] Respeita **tipografia** (escala + tabular-nums em números)?
- [ ] **Estado** via token semântico (nunca `--primary`)?
- [ ] Estrutura em **cinza neutro**, cor só onde há ação/estado?
- [ ] **Acessibilidade**: foco visível, contraste WCAG, `aria-*` em ícone/controle?
- [ ] Funciona em **light E dark** (só via tokens)?

---

## 8. Governança (anti-regressão) — ATIVA

- **`npm run ds:guard`** (`scripts/ds-guard.mjs`) — falha (exit 1) em padrões proibidos: bg-white puro, bg/text/border-cyan, `#00F5FF`/`rgba(0,245,255)`, bg-*-950, zinc/slate estrutural, **token antigo `var(--brand-*)`** (use `--*`). Avisos: text-white, hex semântico, radius `rounded-[Npx]`, `shadow-*` Tailwind, box-shadow inline com rgba.
- **`npm run ds:scorecard`** — % de aderência.
- **CI:** `.github/workflows/ds-guard.yml` roda o guard em push/PR na `main`.
- **Pre-commit:** `scripts/hooks/pre-commit` (instalar: `ln -sf ../../scripts/hooks/pre-commit .git/hooks/pre-commit`).
- **Exceções mantidas** (não são violação): `--brand-logo`, `--brand-purple`, `--brand-card-shadow(-md)`.

**Sprint 2 futura:** ESLint plugin (bloqueio em nível de AST) + detecção de componentes duplicados; hoje a cobertura é por grep no guard.

---

## 9. Componentes base oficiais (Sprint 2 · 2b)
`Checkbox` · `Radio`/`RadioGroup` · `Switch` · `Chip` — em `src/components/ui/`, sobre base-ui, só tokens, a11y completa. Playground: rota interna **`/design-system`** (não linkada na navegação) com todos os estados.
