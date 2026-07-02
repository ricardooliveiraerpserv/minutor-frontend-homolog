# Sprint 3 — Auditoria de UX (atritos, não bugs)

> Sprint de **Produto/Experiência**. DS/tokens/componentes congelados (fora de escopo). Métrica: menos cliques, menos dúvida, mais velocidade percebida. **Nada implementado — aguarda aprovação do plano.**
> Base: 6 auditorias paralelas (estados · apontamento · aprovações · fechamento/anexos · performance percebida · acessibilidade).

## 🔴 Atritos críticos (fazer primeiro)

| # | Atrito | Onde | Impacto | Freq. | Esforço | ROI |
|---|---|---|---|---|---|---|
| 1 | **Overlay "Carregando…" bloqueante** (fundo escuro trava a tela) na edição de projeto, pipeline e kanban | gestao-projetos, contratos/pipeline, contratos/kanban | Alto (parece travado) | Alta | **Baixo** | ⭐⭐⭐ |
| 2 | **Erro só em toast, sem "Tentar novamente"** persistente | ExpensesScreen, TimesheetsScreen, geral | Alto | Alta | Médio | ⭐⭐⭐ |
| 3 | **Feedback pós-ação não-visual** (aprovou despesa e a linha não some/muda até refetch → aprova 2×) | approvals, ExpensesScreen | Alto | Alta | Médio | ⭐⭐⭐ |
| 4 | **Despesas sem seleção múltipla / aprovação em lote** (~30 cliques p/ 10) | ExpensesScreen / ApprovalsScreen | Alto | Alta | Médio-Alto | ⭐⭐ |
| 5 | **Apontamento sem "Salvar e novo"** (quem aponta 10×/dia gasta ~50% cliques a mais) | timesheets/new, mobile/apontamento | Alto | Alta | Baixo-Médio | ⭐⭐⭐ |
| 6 | **Ícones-botão sem `aria-label` (50+) + modais como `<div>` sem `role=dialog` (15+)** | row-menu, modais, geral | Alto (a11y) | Alta | **Baixo** | ⭐⭐⭐ |
| 7 | **"Projeto Real" aparece de surpresa** no fim do apontamento (investimento) → retrabalho/rejeição | timesheet-form-modal | Alto | Média | Médio | ⭐⭐ |
| 8 | **Fechamento: 5 abas sem visão consolidada** + modal de validação ambíguo ("posso fechar ou não?") | fechamento/page | Alto | Mensal | Alto | ⭐ |

## 🟡 Atritos importantes

| Atrito | Onde | Esforço |
|---|---|---|
| Lista de apontamentos default "Todos" (traz meses passados = caos p/ novo usuário) → default "Pendente/período atual" | TimesheetsScreen | Baixo |
| Rejeição/ajuste em lote sem **templates de motivo** (digita o mesmo N×) | ApprovalsScreen | Baixo-Médio |
| **Modais sem transição CSS** (aparecem/somem abruptos; ~200 modais; Sheet já tem) | ui/modal.tsx | Baixo-Médio |
| **Empty states crus sem ícone/CTA** (clientes, contratos, usuários) → usar `EmptyState` | várias listas | Baixo |
| Modais de visualização abrem "vazios" e carregam depois → skeleton/prefetch | approvals view, geral | Médio |
| **Anexos "artesanais"** no fechamento-cliente (não usam `EntityAttachmentsPanel`) + limite validado só no envio | fechamento/cliente | Médio |
| **Investimento-comercial: 7 abas** + modais aninhadas + lista **stale** pós-criação | investimento-comercial | Alto |
| Fechamento-cliente: e-mails "cadastrado × avulso" confusos (renomear/explicar) | fechamento/cliente | Baixo |
| Contratos sem ações em lote + menu 14px difícil no mobile | contratos/page | Médio |
| SearchSelect sem navegação por teclado (↑↓/Enter) + sem focus-trap em modais | search-select, modais | Alto |
| Skeletons genéricos (não lembram o conteúdo) em dashboard/aprovações | dashboard, approvals | Médio |

## 🟢 Polimento
- SearchBox: "Buscando…" texto → spinner/skeleton sutil; dropdowns "Carregando…" idem.
- Revisar contraste de `--text-light` sobre superfícies (WCAG AA em baixa luz).
- Observação do apontamento: textarea grande → opcional/templates.
- Mensagens de erro por campo via `aria-describedby`.
- Feedback pós-salvar com preview do que foi criado.

## Padrões positivos já existentes (preservar)
Optimistic UI no kanban de etapas · debounce 300ms na busca · `disabled={loading}` nos botões (evita duplo-clique) · `SkeletonTable` no fechamento · toasts rápidos.

## Plano sugerido (ondas por ROI — a executar só após aprovação)
- **Onda A — Quick wins de percepção (maior ROI, ~1 sem):** remover overlays bloqueantes → skeleton inline (#1); transição CSS nos modais; empty states com `EmptyState`; `aria-label` nos ícones-botão + `role=dialog` (#6); default de filtro "Pendente" na lista de apontamentos.
- **Onda B — Eficiência operacional:** "Salvar e novo" (#5) + feedback otimista ao aprovar (#3) + error-state com retry (#2) + templates de motivo de rejeição.
- **Onda C — Aprovação em lote:** seleção múltipla + bulk approve de despesas (#4) + ações em lote de contratos.
- **Onda D — Jornadas longas:** "Projeto Real" antecipado (#7); fechamento com painel consolidado/stepper (#8); investimento-comercial (reduzir abas + refetch); anexos → `EntityAttachmentsPanel`.
- **Onda E — A11y profunda:** navegação por teclado no SearchSelect, focus-trap, contraste, `aria-describedby`.

Métrica de sucesso por onda: redução de cliques/tempo na tarefa, feedback imediato percebido, zero regressão visual (DS congelado).
