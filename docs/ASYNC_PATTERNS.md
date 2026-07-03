# Padrões de Ação Assíncrona — Fase 2 (Confiança)

> **Padrão OFICIAL do projeto.** Toda ação assíncrona (salvar, aprovar, rejeitar, excluir,
> gerar, enviar, mover, toggle, upload…) segue este documento. Descoberto e validado na
> migração do módulo **Aprovações**. Não introduzir loading manual novo.

---

## 1. O ciclo de vida único (Regra 4)

```
idle → running → success | error
```

Sem exceções. É o que `useAsyncAction` entrega. Estados:

| Estado | Significado | Pode renderizar? |
|---|---|---|
| `idle` | parado | — |
| `pending` | **concorrência** — do clique até o fim (imediato) | **NUNCA renderiza UI** — só `disabled` |
| `running` | executando **e** já passou do `spinnerDelay` (~120ms) | **spinner** |
| `success` | concluído com sucesso | **✓** |
| `error` | falhou | **erro persistente** (`ErrorState`) |

### ⚠️ Regra de renderização (obrigatória)

> **`pending` NUNCA renderiza UI.** Ele controla **apenas concorrência** (`disabled` / cross-disable).
> Quem muda layout/spinner/ícone/texto é **`running` / `success` / `error`** — nunca `pending`.

Motivo: `pending` é imediato (evita duplo-clique já no 1º ms). Se ele também renderizasse,
uma ação de 30ms causaria flash. A separação `pending` (concorrência) × `running` (visual)
é o que elimina o flicker (Regra 5).

```tsx
// ✅ certo
<button disabled={action.pending}>{action.running ? <Spinner/> : 'Salvar'}</button>
// ❌ errado — pending renderizando (pisca em ações rápidas)
<button disabled={action.pending}>{action.pending ? 'Salvando…' : 'Salvar'}</button>
```

---

## 2. `pending` vs `running`

| | `pending` | `running` |
|---|---|---|
| Quando vira `true` | **imediato** (no clique) | após `spinnerDelay` (~120ms) |
| Para que serve | `disabled`, cross-disable, guarda de concorrência | spinner / feedback visual |
| Renderiza UI? | **não** | sim |

Anti-flicker (Regra 5) já vem no hook: `spinnerDelay` (só mostra `running` se passar de
~120ms) + `minVisible` (uma vez visível, o spinner dura no mínimo ~320ms).

---

## 3. Quando usar cada peça

### `useAsyncAction` (hook) — o núcleo
Para **qualquer** mutação, não depende de botão (Regra 2): drag&drop, atalhos de teclado,
toggle, upload, menu de contexto, ações automáticas — **e** para **shared-busy** (ver §5).

```tsx
const save = useAsyncAction(async () => {
  await api.post('/x', body)
  toast.success('Salvo')
  reload()
}, { onError: e => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') })

// save.run() · save.pending · save.running · save.status · save.error · save.reset()
```

### `AsyncButton` — casca visual (Regra 3: só ciclo de vida, zero regra de negócio)
Para **botão standalone** que dispara **uma** ação. Estados idle/running/success/error prontos.

```tsx
<AsyncButton onClick={async () => { await api.delete(`/x/${id}`) }}>Excluir</AsyncButton>
```

- **`unstyled`** → migrar botão **custom existente** preservando 100% o visual (v1.0 congelada):
  renderiza `<button>` cru com a `className` atual + a máquina de estado.
  ```tsx
  <AsyncButton unstyled className="[classes exatas do botão antigo]" onClick={salvar}>Salvar</AsyncButton>
  ```
- Botão **novo** → use o `Button` oficial via `AsyncButton` sem `unstyled` (variant/size do DS).

### `ErrorState` / `InlineError` — erro persistente (P2)
Erro crítico **não some** como toast. Mensagem amigável + Tentar novamente (com loading) +
detalhes técnicos recolhidos + copiar erro.
```tsx
{loadErr && <ErrorState error={loadErr} message="Não foi possível carregar." onRetry={reload} />}
```

### `useOptimisticList` — update otimista genérico (P1)
Tabela/lista/kanban/grid/card. **Só Categoria A** (ver §6).

---

## 4. Quando usar `AsyncButton` vs `useAsyncAction`

| Situação | Use |
|---|---|
| Botão isolado, 1 ação | **`AsyncButton`** |
| Botão custom existente (preservar visual) | **`AsyncButton unstyled`** |
| Drag&drop / atalho / toggle / upload / menu | **`useAsyncAction`** |
| Grupo de ações que compartilham "ocupado" (modal) | **`useAsyncAction`** + busy derivado (§5) |

---

## 5. Shared busy (grupo de ações mutuamente exclusivas)

Quando um modal/painel tem **várias ações** que devem desabilitar **todas** enquanto uma roda
(ex.: Aprovar / Rejeitar / Solicitar Ajuste), **não** use um `AsyncButton` por botão — cada um
teria seu próprio estado e não haveria cross-disable. Use **um `useAsyncAction` por ação** e
**derive** o busy do `.pending`:

```tsx
const approve = useAsyncAction(doApprove, { onError: t1 })
const reject  = useAsyncAction(doReject,  { onError: t2 })
const adjust  = useAsyncAction(doAdjust,  { onError: t3 })

// cross-disable imediato (pending, NÃO running):
const busy = approve.pending || reject.pending || adjust.pending

<button disabled={busy} onClick={() => approve.run()}>…</button>
```

Caso real: `ApprovalsScreen` — 7 ações, `approving = a.pending || b.pending || …`.

---

## 6. Optimistic UI — categorias (P1)

| Categoria | Regra | Exemplos |
|---|---|---|
| **A — sempre otimista** | aplica já, rollback em falha | aprovar, mover card, arquivar, marcar como lido, favoritar, mudar status |
| **B — avaliar** | só com rollback simples | editar registro, alterar cronograma/horas/prioridade |
| **C — NUNCA otimista** | espera o servidor | exclusão definitiva, faturamento, fechamento, geração de documentos, integrações, financeiro |

---

## 7. O que **NÃO** fazer

```tsx
// ❌ loading manual novo
const [saving, setSaving] = useState(false)
const save = async () => { setSaving(true); try { … } finally { setSaving(false) } }

// ❌ spinner/texto via pending (pisca)
{action.pending ? 'Salvando…' : 'Salvar'}

// ❌ AsyncButton por botão num grupo shared-busy (perde cross-disable)

// ❌ AsyncButton (estilizado) por cima de botão custom → muda o visual v1.0. Use `unstyled`.

// ❌ otimista em Categoria C (exclusão/faturamento/fechamento) → inconsistência FE×BE

// ❌ engolir o erro no try/catch e nunca deixar o hook ver → status nunca vira 'error'
//    (deixe o api.* lançar e trate no onError)
```

---

## 8. ✅ Checklist obrigatório de módulo (gate)

Todo módulo migrado responde no **relatório único** de encerramento. Se **qualquer** resposta
for "não", o módulo **não** está concluído.

- [ ] Todas as mutações do módulo migradas? (100%)
- [ ] Nenhum `setLoading`/`set*Loading` de **mutação** restante?
- [ ] Nenhum `finally { setLoading(false) }` de mutação restante?
- [ ] Nenhum botão sujeito a duplo-clique? (todo dispatch passa por `pending`/`inFlight`)
- [ ] Nenhum spinner **manual** (não vindo de `running`)?
- [ ] `pending` não renderiza UI (só `disabled`)?
- [ ] Todo toast de erro tem feedback adequado (persistente onde crítico)?
- [ ] Rollback em erro onde há otimista? (Categoria A)
- [ ] Build (tsc) OK — sem novos erros vs baseline?
- [ ] Guard (`ds:guard`) OK — sem novos erros?

**No relatório único do módulo, incluir também:** ações migradas · estados manuais eliminados ·
hooks reutilizados · componentes reutilizados · padronizações descobertas · % de cobertura.

> Loading de **lista/página/detalhe** (skeleton) é **Fase 1**, não conta como mutação aqui.

---

## 9. Fluxos que NÃO usam `useCrudActions` (exceções)

`useCrudActions` cobre o CRUD **comum** (create/update/delete de modal). Não force o hook em
fluxos genuinamente diferentes — o excepcional permanece excepcional. Estes usam
`useAsyncAction` direto (ou estado próprio quando o per-id/streaming exige):

| Fluxo | Por que fica fora | Padrão a usar |
|---|---|---|
| **Upload de arquivo** | progresso, multipart, cancelamento | `useAsyncAction` + estado de progresso |
| **Importação em lote** | N itens, parcial, relatório | `useAsyncAction` (ex.: Feriados `importing`) |
| **Toggle por linha** | per-id, não é modal CRUD | `useAsyncAction` + id rastreado (ex.: Executives `toggling`) |
| **Processo longo / job assíncrono** | polling, timeout, etapas | `useAsyncAction` + polling próprio |
| **Wizard / multi-step** | estado entre passos | máquina de estado da tela |

Regra: **o hook adapta o fluxo comum; o fluxo excepcional permanece excepcional.** Se aparecer
a tentação de crescer `useCrudActions` para acomodar uma exceção, **pare** — crie/estenda algo à parte.

---

## 10. Telemetria / pontos de extensão

`useCrudActions` expõe `telemetry` (hoje **no-op**) para ligar capacidades futuras (analytics,
métricas de duração, breadcrumbs, retry central) **num só lugar** — sem tocar nas telas:

```tsx
useCrudActions('customers', {
  onSaved, onDeleted, messages,
  telemetry: {
    beforeAction, afterSuccess, afterError, afterFinally,  // { action, endpoint, durationMs, error? }
  },
})
```

Não implementar analytics agora — apenas manter os pontos preparados.

---

## 11. Adoção do padrão por módulo (Sprint 3)

| Módulo | Cobertura |
|---|---|
| Aprovações | ✅ 100% |
| Cadastros | ✅ 100% |
| CRM / Pipeline | ✅ 100% |
| CRM / Propostas | ⬜ 0% |
| CRM / Cadastros | ⬜ 0% |
| Timesheets | ⬜ 0% |
| Financeiro | ⬜ 0% |
| Portal Cliente | ⬜ 0% |

Atualizar a cada gate de módulo. Medição objetiva da fundação: `npm run fase2:adoption`.

---

## 12. Regra oficial — sequência de TODA mutação

O usuário nunca deve pensar "será que funcionou?". Toda mutação segue esta sequência
(descoberta e validada no CRM Pipeline — melhor do que simplesmente "remover o refetch"):

```
Usuário clica
   ↓
UI responde IMEDIATAMENTE (otimista)     ← só Categoria A (rápida/reversível)
   ↓
API executa
   ↓
Sincronização SILENCIOSA (background)    ← servidor continua a fonte da verdade
   ↓
Rollback APENAS se houver erro
```

- **Nunca remover o refetch por completo** — ele vira **silencioso** (sem spinner) após a
  resposta, para reconciliar campos calculados pelo servidor. Ex.: `loadBoard(true)`.
- **Concorrência sempre**: `useAsyncAction.pending` bloqueia a re-execução (sem duplo-move/clique).
- **Categorias B/C** (editar/exclusão/faturamento/…): **sem otimista** (esperam o servidor), mas
  mantêm feedback (`running`) + concorrência (`pending`).
- Referência viva: `moveStage`/`confirmLoss`/`onDragEnd` em `crm/pipeline`.

### Duas receitas de otimista
| Estrutura de dados | Padrão |
|---|---|
| **Lista plana** (tabela/grid/cards) | `useOptimisticList(source, keyOf, { revalidate })` — `mutate(optimistic, commit)` já faz snapshot+rollback+sync silencioso |
| **Aninhada/derivada** (kanban `cols`, árvore) | **inline**: `useAsyncAction` + `setState(prev => { snap = prev; return optimistic(prev) })` + `try { await commit; syncSilencioso() } catch { setState(snap); throw }` (ex.: `optimisticMoveCard` no Pipeline) |

---

## 13. Categoria da mutação → padrão (decisão única, não reabrir por caso)

| Tipo de mutação | Padrão |
|---|---|
| CRUD simples (modal) | `useCrudActions` |
| Botão isolado / ação única | `AsyncButton` ou `useAsyncAction` |
| Kanban / lista otimista | `useOptimisticList` (plano) ou inline (aninhado) + rollback |
| Upload de arquivo | `useAsyncAction` + estado de progresso |
| Geração de PDF | `useAsyncAction` (+ `ErrorState` na falha) |
| Clicksign / assinatura | `useAsyncAction` + **polling** |
| Importação em lote | `useAsyncAction` + progresso |
| Erro de carga/ação crítica | `ErrorState` (persistente) |

Boilerplate de erro → **use `apiMessage`** (de `@/lib/api`): `onError: e => toast.error(apiMessage(e, 'Erro ao salvar'))` em vez de `e instanceof ApiError ? e.message : '...'`.

---

## 14. Metas de adoção (KPI da Fase 2) — `npm run fase2:adoption`

KPIs medíveis: arquivos migrados · mutações migradas · estados manuais eliminados · linhas
removidas · tempo até feedback · **% de adoção da fundação**.

| Marco | Ação |
|---|---|
| **20% de adoção** | 1ª revisão da fundação (esta Sprint 2.5 já antecipou) |
| **50% de adoção** | **congelar a fundação** (sem mudanças de API sem forte justificativa) |
| **80%+ de adoção** | considerar a **Fase 2 concluída** |

**Estado (Sprint 2.5):** fundação **consolidada e soft-frozen** — API estabilizada (helper
`apiMessage`, `useOptimisticList.revalidate`) antes de CRM Propostas. Mudanças de API a partir
daqui exigem justificativa explícita.
