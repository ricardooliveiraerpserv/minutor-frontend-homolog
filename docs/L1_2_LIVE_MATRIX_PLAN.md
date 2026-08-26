# L1.2 — Matriz de teste LIVE sistemática (8 capacidades) + R1/R2

> Pré-req: L1.1d PASS COM RESSALVAS (circuito real provado; ENABLED=true). Este é o **PLANO** — nada executado.
> Ambiente: homolog. CA `srv-da6tve0u01pc73dpgas0` (private). BE `srv-d7jlu2d8nd3s73abm7h0`.

## Princípios e restrições (valem para todo o L1.2)
- **Frontend Freeze mantido.** Única alteração de FE autorizada = **R1** (mínima, localizada). Nada mais no FE; não redesenhar QualityTab; não tocar navegação/computeHealth/timeline/GMUD.
- **Não alterar** analyzer TOTVS, schema do BFF, contratos de API, `CA_ANALYZER_RUNNER`.
- `CODEANALYSIS_ENABLED=true` fixo (só C6 muda flag/infra temporariamente, com restauração garantida).
- **Disciplina de rastreabilidade:** UMA fonte por cenário, identificada por caso; **nenhuma** análise fora do caso corrente. Cada disparo registra qual ação gerou qual `source_doc_quality_analyses.id`.
- **Colaborativo:** ações de UI = usuário (+ screenshot); backend/DB/fault-injection/auditoria = agente. Cada caso declara o split.
- **Injeção de falha reversível:** C5/C6 mudam env/estado do CA por janela curta e **restauram** ao fim (registrar antes/depois).
- Cada caso entrega: objetivo · pré-condição · passos · ESPERADO · evidência · **PASS/FAIL**.

## Passo 0 — Setup (agente, read-only no DB)
Identificar no BD homolog contas/fontes para os cenários (sem criar nada ainda; se faltar perfil, o usuário provê):
- usuário **coordenador**; usuário **com** `source_docs.view_git`; usuário **sem** `source_docs.view_git`; usuário **escopado a outro cliente** (para IDOR).
- fontes por cenário: uma "normal" (C1/C8), uma cujo achado tenha **snippet real** (C2), uma que possamos marcar **outdated** (C4), uma **grande** (C5), fontes distintas para concorrência (C7). Todas AUSTER-like, pequenas/médias, sem GMUD ativa.
- Mapear os endpoints reais do BFF A2 (`/source-docs/{id}/quality`, `/quality/history`, `/quality/{analysis}/findings`) e as chaves de permissão (`source_docs.*`) — confirmar no código, não inventar.

---

## Matriz das 8 capacidades LIVE

### C1 — Permissões / perfis (coordenador e demais)
- **Objetivo:** a aba Qualidade e o disparo respeitam as permissões existentes; perfil coordenador vê/analisa conforme contrato; gating **não** foi alterado pela integração.
- **Passos:** logar como coordenador → abrir fonte → aba Qualidade → verificar visibilidade e botão Analisar conforme permissão. Repetir para 1–2 perfis relevantes.
- **ESPERADO:** cada perfil vê exatamente o que a permissão define; nenhum perfil ganhou/perdeu acesso por causa do CodeAnalysis.
- **Evidência:** UI (usuário) + checagem read-only das permissões no BD (agente). **PASS:** gating == contrato pré-existente.

### C2 — Gating de `source_docs.view_git` (snippets)
- **Objetivo:** com um achado que **tem snippet/linha**, usuário **com** `view_git` vê snippet + "Ver no código/GitHub"; usuário **sem** `view_git` vê score/findings **sem** snippet/código.
- **Pré-cond.:** fonte cujo analyzer retorne achado com snippet real (a fonte do smoke tinha snippet vazio — escolher outra).
- **Passos:** analisar a fonte (1 disparo); abrir Qualidade como usuário-com-view_git (screenshot) e como usuário-sem-view_git (screenshot).
- **ESPERADO:** snippet/linha só para quem tem `view_git`; o resto do resultado idêntico; sem vazamento de código para quem não tem.
- **Evidência:** 2 screenshots + confirmação no BFF de que o mascaramento é server-side. **PASS:** masking correto e inalterado.

### C3 — Anti-IDOR / escopo de cliente
- **Objetivo:** usuário sem escopo do cliente da fonte **não** acessa quality/history/findings daquela fonte.
- **Passos (agente, autenticado como o usuário de outro cliente):** chamar os 3 endpoints do BFF para uma `source_doc_id` de cliente ao qual o usuário não tem acesso.
- **ESPERADO:** **403/404 controlado** (conforme padrão do sistema), sem vazar existência/conteúdo; nunca 200 com dados.
- **Evidência:** respostas HTTP. **PASS:** negação consistente + nada vazado. *(Requer um token/sessão do usuário de teste — usuário provê ou autorizamos login de teste; não usar API para burlar a UI onde a UI é o objeto do teste.)*

### C4 — Outdated / blob desatualizado
- **Objetivo:** quando o blob da fonte muda após a última análise, a UI sinaliza **desatualizado** e uma nova análise usa o **novo** blob.
- **Passos:** analisar (blob A) → simular avanço de versão (nova `source_doc_versions` com blob B — via fluxo real de reimport/documentação, **sem** editar a fonte do cliente à mão) → abrir Qualidade → verificar sinalização outdated → nova análise → confirmar `source_blob_sha` = B.
- **ESPERADO:** estado "desatualizado" claro; reanálise vincula ao blob corrente; histórico preserva a análise do blob antigo.
- **Evidência:** DB (2 análises, blobs A e B) + UI. **PASS:** outdated sinalizado e blob novo usado. *(Se não houver caminho não-destrutivo para gerar blob B em homolog, documentar e propor alternativa antes de executar.)*

### C5 — Timeout do BFF→CA
- **Objetivo:** quando o CA excede `CODEANALYSIS_TIMEOUT`, o BFF trata com **erro controlado** (não 500 cru; status/errcode apropriado; prontuário intacto).
- **Injeção reversível:** reduzir `CODEANALYSIS_TIMEOUT` para um valor baixo (ex.: 2s) numa janela curta + fonte grande → disparar → **restaurar** timeout (900) ao fim.
- **ESPERADO:** análise vira `failed` com `error_code` de timeout (semântica clara), UI degrada controlado; sem 500; CA não corrompe estado.
- **Evidência:** DB (row failed + error_code) + logs BE + UI. **PASS:** timeout tratado, reversão confirmada.

### C6 — Serviço caindo no meio / indisponível
- **Objetivo:** CA indisponível (antes/durante) → BFF responde controlado (503/failed), kill-switch, prontuário intacto; recuperação limpa ao voltar.
- **Injeção reversível:** suspender o CA (Render **suspend**) OU apontar `CODEANALYSIS_BASE_URL` para host inválido por janela curta → disparar → observar → **restaurar** (resume/base_url) e re-verificar saúde.
- **ESPERADO:** erro controlado (sem 500 cru, sem tela branca); nenhuma análise "fantasma" completed; ao voltar, novo disparo completa.
- **Evidência:** DB + logs + UI + saúde pós-restauração. **PASS:** degradação e recuperação controladas.

### C7 — Concorrência (serialização + dedup inflight)
- **Objetivo:** (a) 2 fontes **distintas** disparadas juntas no CA `concurrency=1` → **serializam** sem corromper resultados; (b) **mesma** fonte disparada 2× rápido (duplo clique) → **dedup**: não cria duas análises simultâneas, devolve a em andamento.
- **Passos:** (a) disparar 2 fontes quase juntas; (b) duplo-disparo da mesma fonte.
- **ESPERADO:** (a) ambas completam corretas, cada uma com seu blob/resultado; (b) 1 análise inflight (dedup), sem duplicação acidental.
- **Evidência:** DB (contagem/tempos) + logs CA. **PASS:** serialização correta + dedup.

### C8 — force / reuse
- **Objetivo:** `reuse` (default) reaproveita análise idêntica (mesmo blob+engine+rules) sem reexecutar; `force=true` (**Analisar novamente**) força nova execução.
- **Passos:** analisar fonte (row 1) → reanalisar sem mudança (esperado reuse) → **Analisar novamente** (force) → verificar nova execução.
- **ESPERADO:** reuse devolve o resultado existente (sem novo job no analyzer); force cria nova análise/execução; histórico coerente.
- **Evidência:** DB (reused vs nova) + logs CA (job novo só no force). **PASS:** semântica reuse/force correta.

---

## Ressalvas do L1.1d a tratar no L1.2

### R1 — Histórico "stale" no frontend (correção autorizada, mínima)
- **Fato:** DB correto (queued→completed); card de topo atualiza; **Histórico** mantém snapshot `queued` até refresh.
- **Correção autorizada (mínima, localizada):** quando o **polling principal** atingir estado terminal (`completed`/`failed`), **invalidar/refetch também o histórico** (React Query invalidate da query do history, ou propagar o estado). **Não** redesenhar a QualityTab; nenhuma outra mudança de FE.
- **Evidência de aceite:** após completar, o Histórico passa a `completed`/score **sem F5**.

### R2 — Tentativa com serviço `disabled` gera registro `failed` (auditar antes de corrigir)
- **Fato atual (medido):** com `ENABLED=false`, o BFF **cria** `source_doc_quality_analyses` com `status=failed`, `error_code=disabled` (ex.: ids 2,3). Isso "suja" o histórico com falhas que não são falhas do analyzer.
- **A fazer no L1.2 (SEM corrigir silenciosamente):** primeiro **mostrar comportamento atual × proposta mínima**:
  - **Proposta:** serviço desabilitado **antes** do disparo → **recusar de forma controlada** (não persistir como falha técnica do analyzer). Preservar auditoria da tentativa, **se necessário**, em mecanismo apropriado (log/telemetria), **sem poluir** `source_doc_quality_analyses`.
  - Entregar diff mínimo + impacto (o que a UI mostra hoje vs. proposto) → **aprovar antes de aplicar**.

---

## Ordem, gates e entrega
1. Passo 0 (setup/identificação) → **checkpoint** (confirmar fontes/usuários com o gate).
2. Executar C1…C8 **um caso por vez**, cada um com evidência e PASS/FAIL; injeções (C5/C6) com restauração verificada.
3. R1: implementar correção mínima de FE → validar sem F5 → evidência.
4. R2: apresentar atual × proposta → **aprovar** → só então aplicar.
5. **Entrega L1.2:** matriz preenchida (8 PASS/FAIL + evidências), estado de R1/R2, quaisquer incompatibilidades (formato ESPERADO×ENCONTRADO×CAMADA×IMPACTO×CORREÇÃO), estado final de flags, e conclusão PASS/PASS-COM-RESSALVAS/FAIL.
- **Erros/contrato:** qualquer 502/503/incompatibilidade → **não** alterar FE/shape silenciosamente → PARAR e reportar no formato padrão.
- **PARADA:** ao fim do L1.2, PARAR. Não iniciar L2/L3.
