# Sprint 3 · FASE 1 — "O sistema parece rápido" (plano para aprovação)

> Percepção-alvo: **Rapidez**. Critério: o usuário nunca deve pensar *"travou"*. Nada de mudança de layout/regra/DS (congelado). Métrica = **espera/tela-congelada eliminada** (Fase 1 quase não mexe em cliques — isso é Fase 3).
> Já entregue (parte 1, prod `6f95b94`): transição de entrada no `Modal` + fim do overlay ESCURO de carregamento (kanban, gestão).

## Diagnóstico (números atuais)
- **128** overlays/modais custom **sem transição** (aparecem/somem abruptos); só 2 animam.
- **~20 telas** com loading de página como spinner/tela-branca/"Carregando…" (não skeleton).
- **85** ocorrências de "Carregando…" como texto cru.
- Modais de **visualização** (aprovações) abrem **vazios** e buscam depois.

---

## Itens da Fase 1 (priorizados por ganho de percepção × risco)

### F1.1 — Skeleton de página nas telas de maior uso ⭐ (maior ganho)
- **Telas/arquivos:** dashboard, meu-painel, aprovações (`ApprovalsScreen`/`approvals`), sustentação, gestão-projetos, dashboards (BH fixo/mensal/on-demand), fechamento/*. (~12 de maior tráfego)
- **Atual:** ao abrir/filtrar, mostra "Carregando…" ou tela branca → parece parada.
- **Proposto:** skeleton **inline** que lembra o conteúdo (linhas de tabela p/ listas; cards p/ dashboards; colunas p/ kanban), no fundo claro. Reusar `SkeletonTable`/`Skeleton` do DS + 1 helper `PageSkeleton` (variantes: table | cards | board).
- **Risco:** Baixo-Médio (troca do bloco de loading; não toca dados/lógica). **Rollback:** reverter o commit por tela.
- **Ganho:** percepção de resposta imediata; fim da "tela parada". **Economia:** espera percebida ~1–3s → **0 percebido** (conteúdo aparente na hora).

### F1.2 — Transição de entrada nos modais/overlays custom (128) ⭐ (polimento amplo, baixo risco)
- **Arquivos:** ~40 arquivos com `fixed inset-0` custom (pipeline, kanban, gestão, fechamento, screens…).
- **Atual:** modal "pipoca" (aparece/some instantâneo) → sensação tosca.
- **Proposto:** adicionar `animate-in fade-in-0 duration-150` ao **overlay** (codemod, só a classe) — entrada suave universal. (O zoom do box fica p/ quem usa `<Modal>`, já feito.)
- **Risco:** Baixo (só classe de animação de entrada; sem mudar estrutura). **Rollback:** 1 commit (codemod reversível).
- **Ganho:** interface "polida/fluida". **Economia:** —(percepção de qualidade/velocidade).

### F1.3 — Modal de visualização com skeleton (abre já "cheio")
- **Telas/arquivos:** aprovações — visualizar apontamento (`ApprovalsScreen`/`approvals` linha ~305 fetch pós-abertura).
- **Atual:** modal abre **vazio** e busca os dados → janela de "modal em branco".
- **Proposto:** abrir com **skeleton da estrutura** (rótulos + placeholders) enquanto busca; opcional **prefetch no hover** da linha.
- **Risco:** Baixo. **Rollback:** 1 commit.
- **Ganho:** modal "instantâneo". **Economia:** ~300–800ms de incerteza → 0 percebido.

### F1.4 — "Carregando…" cru → spinner discreto/skeleton (85 pontos)
- **Arquivos:** diversos (inline nos blocos de conteúdo).
- **Atual:** texto "Carregando…" pulsando.
- **Proposto:** onde for bloco de conteúdo → mini-skeleton; onde for ação pontual → spinner discreto on-brand. Padronizar via 1 componente `InlineLoader`.
- **Risco:** Baixo. **Rollback:** por arquivo.
- **Ganho:** consistência + percepção mais fluida.

---

## Ordem sugerida de execução (cada uma com gate: build/tsc/guard + sua validação)
1. **F1.2** (codemod de transição — 1 passada, baixo risco, efeito imediato amplo)
2. **F1.1** (skeletons de página — começar por Aprovações + Dashboard + Meu Painel)
3. **F1.3** (skeleton no modal de aprovação)
4. **F1.4** (padronizar "Carregando…")

## Fora da Fase 1 (não misturar)
- Feedback otimista / remover item aprovado na hora / retry / erros persistentes → **Fase 2 (Confiança)**.
- Salvar-e-novo / lote / defaults / atalhos → **Fase 3 (Produtividade)**.
- Projeto Real no início / stepper / empty states com CTA → **Fase 4 (Clareza)**.
- aria / teclado / foco / contraste → **Fase 5 (Inclusão)**.

## Nova auditoria (as 7 fricções) — como se distribuem
- **Ações sem feedback** → Fase 2. **Esperas desnecessárias** → Fase 1 (F1.3) + Fase 2 (otimista). **Info escondida** → Fase 4. **Decisões desnecessárias / campos repetidos** → Fase 3. **>3 cliques / fluxos interrompidos** → Fase 3/4. (Detalho cada uma no plano da fase respectiva.)
