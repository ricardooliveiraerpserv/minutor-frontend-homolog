# Sprint 2 — Documento Oficial de Encerramento

> **Status: ENCERRADA (2026-07-02).** Consolidação técnica do Design System. Princípio que guiou tudo: *reduzir dívida técnica sem alterar a experiência do usuário — estabilidade acima de pureza arquitetural.*

---

## 1. Objetivo inicial
Eliminar a dívida técnica do Design System após o congelamento da identidade v1.0: unificar tokens, consolidar componentes duplicados, criar componentes faltantes e instituir governança — **sem nenhuma mudança visual perceptível**.

## 2. O que foi realmente eliminado ✅
- **Tokens duplicados `--brand-*` → `--*`**: 3.464 usos migrados (prod + homolog), *value-identical* nos 2 temas → **zero mudança visual**. 13 tokens depreciados dos componentes.
- **Código morto**: `components/ui/table.tsx` removido (0 imports / 0 ref dinâmica / 0 re-export / 0 doc — checklist 4/4).
- **Superfície de risco futura**: `ds-guard` + CI + pre-commit passam a **impedir** novas cores/tokens/hardcode fora do padrão.

## 3. O que foi preservado deliberadamente
- Controles de formulário **nativos** (checkbox/radio) — migrar p/ os componentes custom seria mudança visual perceptível.
- Chips inline (pílulas com tokens corretos).
- Os dois sistemas de componentes (`ds/` × `ui/`) onde a convergência não é invisível.
- **Motivo:** a regra da Sprint — *preservar comportamento; exceção documentada > regressão*.

## 4. Legacy Aceito (C1) — implementações diferentes, baixo churn, baixo ROI, sem intenção de convergir
`Button` · `Input` · `Select` · `Modal` · **Form Controls** (Checkbox/Radio/Switch nativos) · `Badge` (ds×ui×StatusBadge).
→ Permanecem como estão. **Não reabrir** (ver regra §8).

## 5. Evolução Estratégica (C2) — diferentes, mas com potencial ganho futuro (roadmap)
`SearchSelect` (8 impl., churn médio, forms críticos) · `FilterBar` · `KpiCard` (3 impl.) · `Card` · `PageHeader`.
→ Convergir **apenas junto de uma evolução funcional/refresh** que já toque nesses fluxos.

## 6. ROI obtido
| Frente | ROI |
|---|---|
| Unificação de tokens | **Alto** (invisível, 1 lugar, base p/ tudo) |
| Governança (guard/CI/scorecard) | **Alto** (previne regressão futura permanentemente) |
| Componentes oficiais novos (Checkbox/Radio/Switch/Chip) | **Alto** p/ código novo |
| Remoção de morto | Baixo, **zero risco** |
| Convergência Ondas 4–9 (ds×ui) | **Baixo/negativo** — churn 1–3 commits/3mo; risco visual alto → **não executado** |

**Métrica-chave:** o melhor resultado foi descobrir que ~85% da "duplicidade" da Etapa 3 é **diversidade histórica de implementação (dois sistemas)**, não dívida real. Evitar essa convergência **preveniu regressões** e economizou esforço sem perda de valor.

## 7. Dívida técnica restante (consciente)
- Dois sistemas de componentes (`ds/` × `ui/`) coexistindo — **aceito** (C1) enquanto o churn for baixo.
- ~1.065 `<button>`, 395 `<input>`, 100 `<select>` crus — estáveis, estilizados localmente; migrar = mudança visual (C1).
- 328 avisos do `ds-guard` (não-bloqueantes): text-white sobre cor, hex de gráfico/PDF, radius/shadow pontuais.
- Estados vazios/loading/404/403 sub-acabados (UX, não arquitetura) — backlog de produto.

## 8. Nova regra para futuras sprints (governança de escopo)
Um componente **não volta à discussão** só porque existem duas implementações. Só reabre se cumprir ≥1:
- alto churn;
- nova funcionalidade exige mexer nas duas implementações;
- dificuldade recorrente de manutenção;
- inconsistência **percebida pelos usuários**;
- impacto mensurável na produtividade da equipe.
Caso contrário → permanece **Legacy Aceito**.

## 9. Recomendações para a Sprint 3
1. **Não** perseguir aderência 100% nem convergência de componentes (encerrado).
2. Priorizar **valor de produto**: estados vazios/loading/erro (404/403/offline) com os componentes oficiais — a lacuna de UX mais visível ao usuário.
3. Usar **exclusivamente** os componentes oficiais + tokens em **todo código novo** (guard/CI já exigem).
4. C2 (SearchSelect/FilterBar/KPI/Card/PageHeader): convergir **oportunisticamente** quando uma feature já for tocar o fluxo.
5. Manter o `ds-guard` verde como gate de PR.

---

### Estado dos ambientes ao encerrar
Identidade v1.0 congelada · tokens unificados · governança ativa · componentes base oficiais criados · morto removido — **prod + homolog sincronizados, zero regressão visual/funcional**.
