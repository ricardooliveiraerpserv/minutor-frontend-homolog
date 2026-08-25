# L1 — CodeAnalysis (Qualidade) · Discovery + Plano de Conexão Live

> **Natureza:** discovery/desenho. **Nada implementado.** Parar após este documento e aguardar
> aprovação + liberação de infraestrutura. Data: 2026-08-24.
> **Frontend Freeze respeitado por construção:** a aba Qualidade (FE A3, `quality-tab.tsx`) já está
> congelada e já consome os endpoints REAIS do backend Minutor — não há fixture de qualidade no FE.
> Todo o trabalho do L1 é **serviço + backend + infra**, sem tocar no frontend.
> L2 e L3 permanecem **bloqueados** até o gate de aceite do L1.

## 0. Localização do código (verificado)
- **Serviço CodeAnalysis (A1, Flask/Python):** `~/PROJETOS/Minutor/codeanalysis-service` (Dockerfile, `docker-compose.homolog.yml`, `web/api.py`, `web/analyzer.py`, docs A4/A5).
- **Backend Minutor / BFF (A2, Laravel):** `~/PROJETOS/wt-codeanalysis` (branch `feat/codeanalysis-integration`): `SourceDocQualityController.php`, `SourceDocQualityService.php`, `SourceDocQualityAnalysis.php`, migration `..._create_source_doc_quality_analyses_table.php`, `config/services.php:59-64`, `routes/api.php:625-634`, `PermissionService.php:148`.
- **Frontend (A3):** este repo congelado — `src/components/central-fontes/quality-tab.tsx`.

## 1. Arquitetura atual do CodeAnalysis
```
Browser ──(Sanctum, /api/v1)──▶ Minutor BE (Laravel = BFF)
                                   │  (obtém o fonte via GitHub App, server-side)
                                   ▼  rede privada, Bearer token
                          CodeAnalysis Service (Flask, :8080 interno)
                                   ▼  docker run (host)
                     Imagem TOTVS ADVPL/TLPP Analyzer (determinístico)
```
- O **browser nunca** fala com o Flask; recebe só metadados/achados via BE (código removido sem `view_git`).
- Qualidade é **determinística** — **sem IA** (`CA_ENABLE_FIX=0`, `gemini: disabled`; Gemini não configurado).
- Assíncrono roda **no Flask** (thread por job); o BE **não** tem fila própria — sincroniza por polling bounded (1 chamada por GET) e índice único in-flight por `(source_doc_id, source_blob_sha)`.

## 2. As 8 capacidades L1 (matriz de paridade) → endpoint
| # | Capacidade | Endpoint BE | Estado |
|---|---|---|---|
| 1 | Estados da análise | `GET /source-docs/{id}/quality` → `state` | PENDENTE LIVE |
| 2 | Execução / reanálise | `POST /source-docs/{id}/quality` (`force?`) | PENDENTE LIVE |
| 3 | Findings | `GET /source-docs/{id}/quality/{analysisId}/findings` | PENDENTE LIVE |
| 4 | Severidade / categoria | idem findings (`severity`/`category`/`rule`) | PENDENTE LIVE |
| 5 | Snippets | idem findings (só com `view_git`) | PENDENTE LIVE |
| 6 | Histórico | `GET /source-docs/{id}/quality/history` | PENDENTE LIVE |
| 7 | Outdated | `state=outdated` / `stale` (blob ≠ vigente) | PENDENTE LIVE |
| 8 | Indisponibilidade do serviço | 503 no run / GET degrada sem quebrar | PENDENTE LIVE |

## 3. Contrato fixture → live (por capacidade)
**Não há "fixture" de qualidade no FE.** A aba já chama os endpoints reais; hoje eles respondem
"indisponível" porque o serviço está OFF (`CODEANALYSIS_ENABLED=false` / sem host). Portanto o
"contrato fixture→live" aqui é, na prática, **contrato atual = contrato live** — a mudança é ligar o
serviço, sem alterar contrato de FE nem de BE:

- FE `QualityView` = `{ state, source_doc_id, current_blob_sha, analysis, service_enabled? }` — estável.
- FE `Analysis` = `{ id,status,source_blob_sha,external_job_id,score,grade,risk,counts{critical,warnings,recommendations,total},engine,engine_version,rules_version,requested_at,started_at,completed_at,failed_at,error_code,error_message,stale }` — estável.
- BE↔Flask: `POST {base}/api/v1/analyses {filename,content,context,reuse,force}` → `{job_id,status,engine,...}`; `GET {base}/api/v1/analyses/{job_id}` → `{status,score,grade,risk,counts,findings[],started_at,finished_at,error}`. Buckets: `critical=BLOCKER+CRITICAL`, `warnings=MAJOR`, `recommendations=MINOR+INFO`.
- **Observação de contrato (não é incompatibilidade):** o FE checa opcionalmente `service_enabled===false`, mas o BE **não** emite esse campo hoje; a indisponibilidade chega por **503** (POST) ou GET que falha → FE cai no estado "indisponível" mesmo assim. O FE degrada bem nos dois casos. *Melhoria opcional de BE (não obrigatória, não-FE):* o GET `show` retornar `service_enabled:false` quando desligado, para o painel mostrar "indisponível" sem depender de erro. Fica registrado; só entra se você aprovar (é mudança de BE, não do frontend congelado).

## 4. Infraestrutura necessária
- **VM Linux amd64 com Docker** (o Flask faz `docker run` do analyzer → precisa de Docker no host; **não** roda em PaaS — Render/Vercel/Supabase não fazem dind). Caminho alvo `/opt/minutor-modules/codeanalysis/`.
- **Imagem do analyzer** `totvsengpro/advpl-tlpp-code-analyzer` **fixada por digest** (A4/A5).
- **Reverse proxy nginx (443/TLS)** na frente do Flask; o Flask (`:8080`) **não publica porta** (só rede interna + nginx).
- **Rede privada** BE↔serviço (ou TLS/mTLS ponta-a-ponta se atravessar rede pública).
- **Status:** deploy **BLOQUEADO por falta de host Docker de homolog** (A5-DEPLOY-RUNBOOK). É o acesso que preciso para sair do discovery.

## 5. Autenticação Minutor → BFF → CodeAnalysis
- **Browser → BE:** `auth:sanctum` + permissões (`source_docs.quality.view` p/ ver, `source_docs.quality.run` **estrita/admin** p/ disparar) + **escopo multi-tenant** `SourceDocCustomerScope` (fora do escopo → **404**, não vaza existência).
- **BE → Flask:** header `Authorization: Bearer <CODEANALYSIS_SERVICE_TOKEN>` (== `CA_SERVICE_TOKEN` do serviço), server-to-server, **rede privada**. Token **nunca** vai ao browser e **nunca** é logado.
- **Flask fail-closed:** sem `CA_SERVICE_TOKEN` configurado → **503**; compara com `hmac.compare_digest`; UI HTML do serviço só na rede interna.

## 6. Timeout, indisponibilidade e análise em andamento
- **Timeout BE:** 120s (`CODEANALYSIS_TIMEOUT`). `ConnectionException`/timeout → `unavailable('connection_error')`; 5xx do Flask → `upstream_5xx`; resposta sem `job_id` → `invalid_response`; desligado → `disabled`.
- **POST run que falha antes de haver job remoto:** registro local vira **`failed`** (com `error_code`) — **nunca "running eterno"** — e a rota devolve **503** (`unavailable`) ou **502** (fonte indisponível/contrato).
- **GET show com serviço off:** mantém o estado atual, **sem quebrar** a ficha (nada de stacktrace/toast técnico; FE mostra "indisponível").
- **Em andamento:** `queued`/`running`; **1 polling por GET** no BE (FE repete a cada 4s enquanto in-flight, para no unmount). **Índice único parcial** `(source_doc_id, source_blob_sha) WHERE status IN (queued,running)` impede análise duplicada (anti-duplo-clique também no A2).
- **Reanálise idempotente:** `reuse` reaproveita análise concluída do mesmo blob; `force` refaz.

## 7. Estratégia de segurança
1. Token do serviço **só no servidor** (env do BE), nunca no browser, nunca em log.
2. **Snippet/código removido** quando `!source_docs.view_git` (`stripCode`, chaves `snippet/source/code/excerpt/context/line_content/content/example`); resposta expõe `view_git:bool`.
3. **Anti-IDOR / multi-tenant:** escopo do cliente em todo handler → 404 fora do escopo; findings 404 se a análise não pertence à fonte.
4. **Fail-closed** no serviço (sem token → 503) e **kill-switch** `CODEANALYSIS_ENABLED`.
5. Serviço **sem porta pública** (só nginx/TLS); IA desligada (`CA_ENABLE_FIX=0`).
6. O BE obtém o fonte via GitHub App **server-side** (o browser não envia código).
7. **A definir na liberação:** rede/allowlist entre BE e VM, TLS/mTLS, rotação do `CA_SERVICE_TOKEN`, limites de tamanho/taxa de análise (evitar abuso/DoS no `docker run`).

## 8. Plano de testes
- **Já existentes:** A2 (BE) ~18 testes; A1 (Flask) testes próprios. Rodar ambos antes do deploy.
- **Smoke live (homolog), após ligar o serviço:**
  1. Fonte real → `POST quality` → observar `never_analyzed → queued → running → completed` com `score/grade/risk/counts`.
  2. `findings` **com** `view_git` (com snippet) e **sem** `view_git` (sem snippet) — provar o strip.
  3. **Outdated:** nova versão da fonte (blob muda) → `state=outdated`/`stale`.
  4. **Histórico** lista as execuções; marca ATUAL corretamente.
  5. **Reuse/force:** reanalisar mesmo blob (reuse) e forçar (nova análise).
  6. **Indisponibilidade:** `CODEANALYSIS_ENABLED=false` → POST 503, GET degrada limpo.
  7. **Timeout:** simular serviço lento > timeout → registro `failed`, sem running eterno.
  8. **Permissões:** coordenador só vê (`.view`), run é admin (`.run`); fora do escopo → 404.
- **Verificação de não-regressão do FE congelado:** confirmar que a aba Qualidade funciona **sem qualquer alteração** de FE (só o serviço ligado).

## 9. Rollback
- **Kill-switch imediato:** `CODEANALYSIS_ENABLED=false` (ou remover token) → volta ao estado "indisponível", **sem quebra** e **sem tocar no FE**.
- **Config:** reverter os `CODEANALYSIS_*` do `.env` do BE.
- **Serviço:** parar o container; imagem **fixada por digest** permite voltar à versão anterior.
- **Migration:** a tabela `source_doc_quality_analyses` é **aditiva** (não altera nada existente); pode permanecer mesmo com o serviço off (sem efeito). Rollback só se necessário.
- **Nenhum rollback de frontend** é necessário (congelado; não muda no L1).

## 10. Critérios objetivos de conclusão do L1
1. Serviço A1 **deployado** em host Linux/Docker, acessível ao BE por rede privada + TLS.
2. **Migration** `source_doc_quality_analyses` aplicada em homolog.
3. `CODEANALYSIS_BASE_URL` + `CODEANALYSIS_SERVICE_TOKEN` (== `CA_SERVICE_TOKEN`) + `CODEANALYSIS_ENABLED=true` + `CODEANALYSIS_TIMEOUT` configurados; `.env.example` do BE atualizado (gap hoje).
4. **Análise fim-a-fim** de uma fonte real → `completed` com score/findings, **na aba Qualidade congelada** (zero alteração de FE).
5. As **8 capacidades** verificadas live (estados, run/reanálise, findings, severidade/categoria, snippet com/sem view_git, histórico, outdated, indisponibilidade).
6. **Segurança** verificada: token só server-side, strip de código sem view_git, escopo 404, fail-closed, IA off.
7. **Off/timeout** degradam sem quebrar; sem "running eterno".
8. **Gate de aceite do Ricardo** → só então L2 é desbloqueado.

## Gaps/pendências a resolver na liberação
- **Host Docker de homolog** (bloqueio principal — A5).
- `.env.example` do BE não documenta `CODEANALYSIS_*` (documentar).
- Decidir a melhoria opcional de `service_enabled` no GET (BE, não-FE) — só se aprovado.
- Definir rede/TLS/mTLS + rotação de token + limites de taxa/tamanho.

## Regra durante o L1 (do Frontend Freeze)
Sem redesenho/navegação/remoção/reinterpretação de regra/`computeHealth`/troca de contrato/fallback
silencioso live→fixture/aposentadoria de legado. Mudança de FE **só** se a integração revelar
**incompatibilidade comprovada** contrato live × contrato congelado → **parar, documentar
esperado × encontrado × impacto × proposta, aguardar aprovação.**
