# L1 — CodeAnalysis SEM VM · Discovery + Prova Técnica + Arquitetura

> **Natureza:** discovery + prova técnica controlada + proposta de arquitetura. **NADA implementado,
> nada provisionado, nada alterado** (frontend, BFF A2, API JSON, analyzer, Render, VM). Data: 2026-08-25.
> **Regra de parada respeitada:** se algum caminho sem VM sacrificasse paridade, o documento diria.
> A conclusão é que **existe caminho sem VM preservando 100% da paridade** — apresentado para sua aprovação.

## 1. Como o analyzer funciona hoje

Serviço (`~/PROJETOS/Minutor/codeanalysis-service`): Flask/gunicorn + SQLite, expõe a API JSON
`/api/v1/analyses` (com `CA_SERVICE_TOKEN`) que o **BFF A2 do Minutor** consome. A análise em si é feita
assim (`web/analyzer.py:110-131`, hoje contra um **dind dedicado** via `DOCKER_HOST`):

```
docker run --rm  [CA_ANALYZER_RUN_FLAGS]  -v <src>:/tmp  -v <conf>:/bin/conf  -v <out>:/bin/output  <IMAGEM>
```
- Entrada: fontes em **`/tmp`**; config opcional em `/bin/conf` (há default **baked** em `/bin/conf/config.json`).
- Saída: **`/bin/output/output.json`** (+ `execution.log`).
- `CA_ANALYZER_RUN_FLAGS` já injeta hardening (`--network=none --memory=2g --cpus=2 --pids-limit=256`);
  `CA_ANALYZER_TIMEOUT` (default 900s).

**A costura já existe:** só a função `run_docker` conhece o "como executar". Trocá-la por um
**AnalyzerRunner** plugável NÃO toca a API JSON, o store, o BFF nem o frontend.

## 2. Restrições reais da imagem TOTVS (prova técnica controlada)

Imagem `totvsengpro/advpl-tlpp-code-analyzer:latest` (pública) — inspecionada e **executada** em teste efêmero:

| Item | Evidência |
|---|---|
| Arch/OS | **amd64/linux** (native lib JNI `libappre.so` amd64) — **sem variante arm64 (bloqueio duro)** |
| Tamanho | ~444 MiB, 18 layers |
| Entrypoint | `/bin/bash entrypoint.sh` (Cmd null) · roda como **root** · sem `VOLUME`/`EXPOSE` |
| Runtime | Ubuntu 20.04, OpenJDK 11, Python3; motor = JAR Java + JNI (`-Xmx6144M`) |
| Fluxo | copia `/tmp/*.pr?/.tlpp/.ch` → `/bin/src` + `/bin/includes`; roda Java; grava `/bin/output/output.json` |
| **Rede** | **NÃO precisa** — rodou com `--network none` → exit 0, JSON gerado |
| **Privileged / docker.sock / dind** | **NÃO precisa** — processo Java+Python puro; nenhum daemon/estado |
| Disco | escreve em `/bin/src`, `/bin/includes` (rootfs) + `hsperfdata` em `/tmp`; `--read-only` funciona **se** `--tmpfs /bin/src --tmpfs /bin/includes` |
| Memória | 512m **falha**; 1–2g OK p/ arquivo trivial; **até ~6–8g** p/ bases grandes (`-Xmx6144M`) |
| Exit codes | 0 sucesso · 1 erro/JVM-fail/`breakOnError` · 123 falha ao copiar fontes |
| Duração | ~5s cold (arquivo trivial, sob emulação); análise real domina o tempo |
| Config | default **baked** (`breakOnError:true`) — só montar `conf` se for sobrescrever |

**Veredito:** é um **job batch stateless ideal** — input arquivos → output JSON, **sem docker.sock,
sem dind, sem privileged, sem rede**. A imagem NÃO precisa ser alterada.

## 3. Opção A — Analyzer worker persistente (RECOMENDADA)

**A CodeAnalysis API roda o analyzer IN-PROCESS, na mesma imagem** — sem `docker run`, sem daemon:
- Imagem do serviço = `FROM totvsengpro/advpl-tlpp-code-analyzer` (já traz Java+Python+JNI+analyzer)
  **+** nossa camada Flask/gunicorn + `api.py`.
- O `AnalyzerRunner.run(job)` chama o **`entrypoint.sh` localmente** (subprocess) sobre um dir temporário
  (`/tmp/<job>` com os fontes) e lê `/bin/output/<job>/output.json`. Mesmo binário, mesmo `output.json`.
- Deploy como **1 container** (Render Web/Worker amd64). Concorrência limitada por semáforo/fila (cada
  análise é pesada de RAM/CPU). Sem dind, sem socket, sem privileged, sem VM.
- Determinar: fila/concorrência (bounded), timeout (reusa `CA_ANALYZER_TIMEOUT`), isolamento
  (rlimits/cgroup do plano + `--network none` equivalente no processo), cleanup (apaga `/tmp/<job>` pós),
  persistência (SQLite/histórico em disco persistente do plano), restart (jobs in-flight que morrem no
  restart → o índice único in-flight já os deixa reexecutáveis), escala (nº de instâncias).

## 4. Opção B — Job efêmero gerenciado

**A CodeAnalysis API (pequena, sempre-on) submete um Job por análise** (Cloud Run Jobs / Fargate Task /
Azure Container Apps Job / Render Job):
- O Job = a imagem TOTVS + **wrapper fino** (baixa fonte do object storage → `entrypoint.sh` → sobe
  `output.json`), **sem alterar a imagem**.
- Input/output **sem bind-mount de host**: via object storage (GCS/S3) ou volume gerenciado (GCS FUSE /
  EFS / persistent disk).
- Escala a zero (idle ~0), paga por análise; porém **+ object storage + orquestração + cold start por
  análise** (a imagem precisa subir a cada job).

## 5. Comparação A × B

| Critério | A (worker in-process) | B (job efêmero) |
|---|---|---|
| VM administrada | **Não** | **Não** |
| dind/socket/privileged | Não | Não |
| Complexidade | **Baixa** (1 container) | Média/Alta (jobs + storage + orquestração) |
| Idle cost | Instância sempre-on | ~Zero |
| Custo/análise | Amortizado na instância | Paga por job (+ storage) |
| Cold start | Nenhum (worker quente) | Por análise (sobe imagem ~444MB) |
| Paridade | 100% (mesmo binário in-process) | 100% (mesmo binário) |
| Observabilidade | Simples (1 serviço) | Espalhada (jobs) |
| Menor acréscimo de infra | **Sim** | Não |

**Recomendação: Opção A.** É a mais simples que cumpre zero-VM + segurança + paridade + confiabilidade,
e evita trocar "uma VM simples" por "arquitetura cloud complexa". B fica como **evolução futura** se
surgir necessidade real de scale-to-zero / picos.

## 6. Viabilidade no Render (respostas objetivas)

- **A. CodeAnalysis API no Render sem VM?** SIM — Web Service container amd64.
- **B. Analyzer como Render Worker?** SIM — mesmo container (in-process, Opção A) ou Background Worker.
- **C. Imagem TOTVS executável nesse modelo?** SIM no Render (amd64/Linux), **in-process** (Render
  **não** permite dind/privileged/docker.sock — e **não precisamos**).
- **D. Render suporta o necessário?** filesystem temporário gravável ✓; background worker ✓; memória/CPU
  por plano ✓ (escolher plano com RAM suficiente — ver §12); a análise roda em background (POST 202 +
  polling), então **não** é limitada pelo timeout de request HTTP ✓; disco persistente p/ SQLite ✓.
- **E. Se Render não bastar:** o único gargalo possível é **RAM p/ bases muito grandes** (`-Xmx6144M`
  sugere até ~6–8 GB). Se o maior plano de RAM do Render for insuficiente, o **menor acréscimo** é um
  **Job gerenciado amd64** só para a execução (Cloud Run Jobs até 32 GB), mantendo a API no Render.

## 7. Arquitetura recomendada

```
Minutor Frontend (congelado)
  → Minutor BE/BFF A2 (contrato JSON inalterado, Bearer + [TLS/mTLS])
    → CodeAnalysis API (Flask, imagem FROM analyzer TOTVS, no Render amd64)
      → AnalyzerRunner.run()  [LocalProcessAnalyzerRunner: entrypoint.sh in-process, sem docker]
        → output.json  →  persiste findings/histórico (SQLite)
```
Sem VM, sem dind, sem docker.sock. O usuário continua 100% no Prosight → Fontes → Fonte → Qualidade →
Analisar.

## 8. Fluxo de dados

`SourceDoc` → o BFF já obtém o **conteúdo** do fonte (server-side, GitHub App) e envia no `POST
/api/v1/analyses {filename, content, context, ...}` (contrato atual). A CodeAnalysis API escreve o
`content` em `/tmp/<job>/<filename>` (+ includes quando houver), roda o analyzer, lê `output.json`,
persiste findings/histórico e **apaga** `/tmp/<job>`. **Não** precisa object storage na Opção A (payload
é 1 fonte, pequeno). `source_blob_sha` segue a identidade da análise. Código temporário; findings e
histórico persistem; nada de código além do necessário. (Na Opção B: object storage temporário +
cleanup pós-job.)

## 9. Segurança (igual ou mais segura que o planejado)

- **Browser nunca** fala com analyzer/worker — só Minutor BE → BFF → API.
- BE→API autenticado por **Bearer `CODEANALYSIS_SERVICE_TOKEN`** (fail-closed) sobre TLS.
  ⚠️ **mTLS no Render:** a plataforma Render **não expõe mTLS nativo** facilmente — no modelo Render o
  canal fica **TLS (plataforma) + Bearer** (+ allowlist/rede privada Render quando aplicável). Se mTLS
  for requisito rígido, um **proxy** (nginx) na frente seria necessário — o que reintroduz um host. **Este
  é o principal trade-off do "sem VM": mTLS puro é mais simples com um proxy/host; sem host, ficamos com
  TLS+Bearer.** Decisão sua (ver §15/decisões).
- Analyzer worker **não recebe** Firebase / Git token / credencial Windows / secrets desnecessários.
- Execução **sem rede** (o analyzer não acessa rede — comprovado); filesystem temporário; limites de
  CPU/RAM/pids; timeout; cleanup; **sem secrets em log** (o serviço já não loga token).
- Isolamento: 1 análise não compromete Minutor/Prosight/Operações/outras análises (processo isolado por
  job, dir temporário próprio, sem estado compartilhado).

## 10. Paridade — 35 capacidades preservadas

A troca é **só do runner** (como o analyzer é lançado). API JSON, BFF A2, frontend, store (SQLite) e a
**própria imagem/binário** ficam intactos → o `output.json` é idêntico. Logo, **todas** as 35 capacidades
(never_analyzed…service_enabled, kill-switch, view_git, anti-IDOR, in-flight, timeout, source_blob_sha,
etc.) vivem nas camadas inalteradas. **Nenhuma é removida ou degradada.** A equivalência do `output.json`
é comprovada pelo teste A/B (§13).

## 11. Impacto de código

| Camada | Impacto |
|---|---|
| **Frontend** | **0** (congelado) |
| **Minutor BE (A2)** | **0 código** — só config (`CODEANALYSIS_BASE_URL` aponta p/ o serviço no Render) + o `service_enabled` já acordado (ajuste de adapter, se ainda não feito) |
| **CodeAnalysis** | novo `AnalyzerRunner` (interface) + `LocalProcessAnalyzerRunner` (substitui a chamada `run_docker` por execução in-process do `entrypoint.sh`); Dockerfile passa a `FROM` a imagem TOTVS |
| **Infra** | 1 serviço no Render (amd64) em vez de dind/compose; sem VM |
| **Tests** | testes do runner + **teste A/B de paridade** (§13) |

## 12. Concorrência / Timeout / Retry / Persistência / Custo

- **Concorrência:** limitar análises simultâneas (semáforo/fila) — cada uma pode usar GBs de RAM.
- **Memória:** provisionar **≥ 2 GB**, **até ~6–8 GB** p/ bases grandes.
- **Timeout:** reusa `CA_ANALYZER_TIMEOUT` (900s) no subprocess.
- **Retry:** o índice único in-flight já evita duplicidade; retries controlados no BFF (existente).
- **Persistência:** SQLite/histórico em disco persistente do plano.
- **Custo:** A = 1 instância sempre-on (custo fixo previsível, sem idle de VM ociosa maior); B = paga por
  análise (idle ~0) + storage. Para uso on-demand, A é o menor acréscimo operacional.

## 13. Plano de teste A/B (paridade)

MESMO conjunto de fontes reais → **runner Docker atual** vs **LocalProcessAnalyzerRunner**. Comparar
byte-a-byte/estrutural: `status, score, grade, risk, counts, findings (severidade/categoria/regra/linha/
mensagem/snippet), output.json cru, duração`. **Esperado: equivalência funcional total** (mesmo binário).
Qualquer diferença → investigar (esperado: nenhuma além de duração/ambiente).

## 14. Impacto em L2 (Prosight) — sem implementar

`02-prosight.md`: Node/Fastify + Firebase + **clone/fetch de repo Git** + snapshots em disco. **Sem
docker/Windows/privileged.** → **NÃO precisa de VM**: cabe num **serviço Node no Render com disco
persistente** (cache de repos/snapshots). Firebase, repo Git e endpoint RPO/`PROSIGHTREST` são externos/
seus. Pode usar storage externo em vez de disco se preferir. Não precisa de worker separado. **Não iniciar L2.**

## 15. Impacto em L3 (Operações/Dashboards) — sem implementar

`03-dashboards.md`: Node/Fastify + Firebase, mas a essência é **operar o AppServer Protheus** (compilar,
patch, promover/rollback RPO, start/stop de serviços, métricas do host) via `powershell.js`/binários do
AppServer + mount `/opt/totvs`. Mesmo "adaptado para Linux", **permanece preso a um host co-localizado
com o Protheus** (precisa do filesystem/binários/serviços do AppServer). **NÃO vira serverless/job** — é
control-plane de um ambiente Protheus vivo. **Restrição registrada; não misturar com L1. Não iniciar L3.**

## 16. Roadmap revisado (se aprovado)

`L1.1b (novo)` = implementar **AnalyzerRunner + LocalProcessAnalyzerRunner** (CodeAnalysis) →
`L1.1c` = deploy CodeAnalysis API (imagem FROM analyzer) no Render + TLS/Bearer (+ mTLS via proxy se
exigido) + envs `CODEANALYSIS_*` no BE + `service_enabled` → `L1.1d` = smoke real (1 fonte,
never→queued→running→completed na aba congelada) → `L1.2` = paridade live completa + A/B →
`L2` Prosight Engine (Render + disco) → `L3` Operações (host co-localizado ao Protheus) →
`L4` paridade live total → `L5` aceite final / aposentadoria dos originais. **Nenhuma fase executada agora.**

## 17. Riscos

1. **amd64-only** — fixar plataforma amd64 em qualquer host (bloqueio duro; sem arm64).
2. **RAM** — bases grandes podem exigir 6–8 GB; validar o teto do plano Render (senão, Job gerenciado só p/ execução — §6E).
3. **mTLS sem host** — no Render puro fica TLS+Bearer; mTLS estrito reintroduz um proxy/host (trade-off do zero-VM). Decisão sua.
4. **Concorrência/RAM** — sem limite, análises simultâneas podem estourar a instância; fila obrigatória.
5. **Imagem derivada** — `FROM` a imagem TOTVS acopla a atualizações dela (mitigável fixando **digest**).
6. **Cold start (só na Opção B)** — subir ~444MB por análise.

## 18. Recomendação final (objetiva)

**Adotar a Opção A — CodeAnalysis API com `LocalProcessAnalyzerRunner`, imagem `FROM` a imagem TOTVS,
rodando o analyzer in-process, sem docker/dind/VM, deployado como 1 serviço no Render amd64.** Contratos
(frontend, BFF A2, API JSON) e binário do analyzer **inalterados** → paridade 100%. Único trade-off real:
**mTLS estrito** exigiria um proxy/host (sem VM, ficamos com **TLS + Bearer**). Se você aceitar TLS+Bearer
(sem mTLS), o L1 fica **100% sem VM**. Se exigir mTLS, é **1 proxy** (menor host possível) só para o
handshake — a critério seu.

## Decisões que preciso de você (antes de qualquer implementação)
1. Aprova a **Opção A** (worker in-process, sem VM)?
2. **mTLS:** aceita **TLS + Bearer** no Render (100% sem host) OU exige **mTLS** (aí entra 1 proxy)?
3. Confirma **Render** como alvo do L1 (com plano de RAM adequado), ou quer que eu compare custo com um
   Job gerenciado amd64 antes?

**PARADO para sua aprovação. Nada implementado, provisionado ou alterado.**
