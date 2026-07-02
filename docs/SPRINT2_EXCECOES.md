# Sprint 2 — Exceções documentadas (Ondas 1–3)

> Regra aplicada: *"Nunca migrar um componente só porque existe versão oficial. Se houver diferença visual/funcional/comportamental → preservar e registrar exceção. Em dúvida, preserve. Exceção documentada > regressão."*

As Ondas 1–3 foram **analisadas** com a regra das 6 perguntas. Conclusão: as implementações atuais **não são pixel-idênticas** aos componentes oficiais; migrá-las causaria **mudança visual perceptível** (proibida na Sprint 2) com ganho de duplicidade quase nulo. Portanto: **preservadas**.

## Onda 1 — Chips inline (~12 pílulas de status)
| Local | Atual | Oficial candidato | Diferença | Decisão |
|---|---|---|---|---|
| meu-painel, hora-banco, ExpensesScreen | `rounded-full px-2 py-0.5 bg-[var(--X-bg)] text-[var(--X)]` (pílula) | `Chip` (`rounded-md`, tag) | **forma** (pílula≠tag) | Preservar |
| idem (status "Pago/Em aberto" etc.) | pílula `font-semibold` | `StatusBadge` (`font-medium`, registry) | peso da fonte + API por registry | Preservar |
| idem | pílula | `Badge` (ds) | padding `px-2.5` vs `px-2`, `text-xs` vs `text-[10/11px]` | Preservar |

**Já usam tokens corretos** (sem dívida de cor). Reavaliar em uma futura "unificação de badge/chip" que padronize a métrica das pílulas.

## Onda 2 — Radio / Switch
- **Radio (6 usos, 3 arq):** `<input type=radio className="accent-[var(--primary)]">` nativo. DS `Radio` é custom (base-ui). Diferença: renderização nativa≠custom + API `onChange`→`onValueChange`. **Preservar.**
- **Switch:** não há switch ad-hoc no sistema. **Nada a fazer.**

## Onda 3 — Checkbox (39 usos, 18 arq)
- `<input type=checkbox>` nativo (accent-primary/minimal). DS `Checkbox` é custom (base-ui). Diferença: renderização nativa≠custom + API `onChange`→`onCheckedChange` (refiação de estado controlado em 18 arquivos). **Preservar.**

## Consequência
- **Zero mudança de código nas Ondas 1–3** → zero regressão (o indicador #1 da Sprint).
- Os componentes oficiais `Checkbox/Radio/Switch/Chip` permanecem disponíveis para **código novo** (padrão a partir de agora) e para uma eventual **sprint intencional de refresh de controles de formulário** (que assumiria a mudança visual conscientemente, fora do escopo "invisível" da Sprint 2).
- O foco de redução de duplicidade real da Sprint 2 concentra-se nas Ondas 4–9 (`components/ds`×`components/ui`, Button/Input/Table/Modal/Select/SearchSelect), que exigem aprovação.
