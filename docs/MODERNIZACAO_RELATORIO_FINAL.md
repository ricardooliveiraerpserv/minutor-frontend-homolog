# Modernização da Plataforma Minutor — Relatório Final v1.0

> **Status: Engineering Complete (2026-07-04).** Este documento é a **referência oficial** da modernização
> da camada assíncrona do frontend. Antes de introduzir qualquer hook, helper, componente ou padrão novo,
> **leia a seção "Critérios para novos desenvolvimentos".** A fundação está **congelada**.

---

## 1. Visão geral

A modernização (Fases 2 e 3) padronizou **todo o comportamento assíncrono** do frontend sobre uma
fundação única — *feedback imediato, anti-duplo-clique, rollback, erro tratado e sincronização silenciosa* —
**sem alterar a experiência visual nem as regras de negócio**.

- **8 módulos estratégicos migrados:** Aprovações · Cadastros · CRM Pipeline · CRM Propostas · Financeiro · Timesheets · Portal do Cliente · Fechamento.
- **Zero alteração na fundação** e **zero abstração nova** — os dois módulos de referência cobriram todos os casos, do CRM ao módulo mais sensível (Fechamento: faturamento, folha, competência).
- Processo por **submódulos pequenos**, commits granulares, gate objetivo (tsc + auditoria + probe + build), e promoção por marcos: `Engineering Complete → Product Validation → Production Observed`.

---

## 2. Decisões arquiteturais

1. **Fundação assíncrona única** (`useAsyncAction`) — encapsula `idle→running→success|error` + trava de reentrada (anti-duplo-clique). Não depende de botão (serve toggle, menu, drag, upload).
2. **Dois módulos de referência** cobrem o sistema inteiro:
   - **CRM Pipeline** → operações **otimistas** (Kanban, rollback, sync silencioso, concorrência).
   - **CRM Propostas** → operações **assíncronas longas** (workflow, geração, integrações, envio, PDF, assinatura).
3. **Categoria 3 (concorrência por linha)** — tabelas onde cada linha tem seu próprio ciclo usam **estado indexado (`Set`/`Map`/`id|null`)**, NÃO `useAsyncAction`. Não é dívida técnica; é a modelagem correta.
4. **Regra do dinheiro** — operações financeiras **nunca** otimistas: sempre aguardam confirmação do servidor.
5. **Feedback de erro** — mutação → `toast` (transiente); falha de carga → `ErrorState` (persistente). Nunca inverter.
6. **Upload sem progresso = Categoria B** — `FormData` simples + 1 request → só `useAsyncAction` (não criar padrão de upload).
7. **Lição #310** — ao converter função em hook, todos os hooks devem vir **antes de qualquer early-return** (rules-of-hooks). `tsc`/build não pegam isso — só uso real. Daí a separação `Engineering Complete` × `Product Validation`.

---

## 3. Padrões oficiais (imutáveis)

| Caso | Padrão |
|---|---|
| Mutação (salvar/excluir/enviar/gerar/assinar/importar) | `useAsyncAction` + `apiMessage` + `toast` |
| CRUD homogêneo (create/update/delete padrão) | `useCrudActions` (só se realmente homogêneo; senão `useAsyncAction` por operação) |
| Kanban / atualização rápida reversível e local | otimista (`useOptimisticList`) + rollback + sync silencioso |
| Concorrência por linha em tabela | estado indexado (`Set`/`Map`/`id|null`) — **sem hook novo** |
| Falha de **carga** de tela/dados | `ErrorState` (persistente, com Retry) |
| Operação financeira | **nunca otimista** — servidor confirma primeiro |

Guia técnico detalhado: **`docs/ASYNC_PATTERNS.md`** (§1–17).

---

## 4. Métricas finais

| Indicador | Valor |
|---|---|
| Módulos estratégicos migrados | **8 / 8** |
| Loading manual de mutação (início Fase 3 → fim) | **68 → 56** arquivos *(os 56 restantes são telas não-estratégicas, fora de escopo; os módulos estratégicos = 0)* |
| Ações migradas (call-sites) | **109** |
| Alterações na fundação | **Nenhuma** |
| Novas abstrações criadas | **Nenhuma** |
| Regressões arquiteturais | **Nenhuma** |

---

## 5. Commits de referência

| Módulo | Commits-chave |
|---|---|
| **CRM Propostas** | `6d1f0e7` · `eb69fc7` · `05dfe01` · `2df402c` · fix #310 `092ad08` |
| **Financeiro** | `79428da` · `e0e61ad` · `34e1bb0` · `d73ac98` |
| **Timesheets** | `774cdbd` · `961875b` · `3d3a33b` · `ea84457` · `4c8ed19` |
| **Portal** | `34e52a1` · `2e2569c` |
| **Fechamento** | `137b696` · `e3a66aa` · `f410024` · `ea94014` · `b2c1b0d` · `0290848` · `f6c75b5` · `56f78d2` · `7d97604` |

Fundação: `use-async-action.ts` · `use-crud-actions.ts` · `use-optimistic-list.ts` · `lib/api.ts` (`apiMessage`) · `error-state.tsx`.

---

## 6. Dívidas técnicas registradas

Três fluxos **otimistas em operação financeira legada** — preservados intencionalmente na migração (troca só de infra), **fora do escopo desta fase**:

| # | Local | Campo |
|---|---|---|
| 1 | `fechamento/cliente` · `toggleInvoiced` | On-Demand faturado |
| 2 | `fechamento/excedentes` · `toggleFlag` | flag de cobrança |
| 3 | `fechamento/excedentes` · `setStatus` | status do excedente |

**Recomendação:** tratar **as três juntas** numa revisão funcional dedicada (converter para confirmação do servidor, alinhando à Regra do Dinheiro). **Não** corrigir de forma fragmentada.

---

## 7. Critérios para novos desenvolvimentos

**Antes de criar qualquer hook, helper, componente ou padrão, responda:**

> ### "CRM Pipeline ou CRM Propostas já resolvem este caso?"
> - **SIM** → reutilize exatamente o padrão existente.
> - **NÃO** → **pare** e prove que o mesmo problema aparece em **pelo menos dois módulos distintos** antes de propor qualquer abstração. Documente tecnicamente por que é um caso realmente novo.

**Classifique toda mutação antes de codar:**
- **Categoria A** (reversível + local + rápida + **sem impacto financeiro**) → otimista.
- **Categoria B** (depende do servidor) → `useAsyncAction`.
- **Categoria C** (carga de página) → `ErrorState`.
- **Categoria 3** (concorrência por linha) → estado indexado.

**Proibições permanentes:**
- ❌ Reabrir/alterar a fundação sem necessidade comprovada em ≥2 módulos.
- ❌ Otimismo em operação financeira nova.
- ❌ Inverter a regra de erro (mutação=toast / carga=ErrorState).
- ❌ Loading manual de mutação (`setSaving`/`setDeleting`/etc.) — use a fundação.
- ❌ Criar hook de domínio único (`useProposalWorkflow`, `useFinanceWorkflow`, …).

**Parar imediatamente e reportar** se surgir: mudança de regra financeira · integração diferente · máquina de estados diferente · dependência oculta · necessidade de nova abstração.

---

## 8. Conclusão

A modernização foi concluída **sem uma única alteração na fundação**. Os padrões de **Pipeline** e **Propostas**
se mostraram suficientes do CRM ao módulo mais sensível do sistema. A partir daqui, todo novo trabalho é
**evolução do produto (Fase 4)** — não mais modernização da plataforma — e deve seguir os critérios da seção 7.

*Relatório Final v1.0 — mantido como referência oficial. Atualizar a versão apenas em marcos relevantes.*
