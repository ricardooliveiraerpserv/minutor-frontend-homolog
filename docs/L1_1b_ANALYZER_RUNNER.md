# L1.1b — AnalyzerRunner (execução sem VM) · Implementação + Equivalência

> **Escopo:** implementar SÓ o novo runner + validar equivalência LOCAL. **Sem deploy no Render,
> sem L1.1c, sem tocar frontend/BFF A2/API JSON externa.** Repo: `~/PROJETOS/Minutor/codeanalysis-service`
> (commit `572d7a8`). Frontend Minutor (congelado) e contratos A2 **não** foram tocados. Data: 2026-08-25.

## 1. Arquitetura

```
CodeAnalysis API (Flask /api/v1)  →  analyze()  →  AnalyzerRunner.run(src,out,conf)
                                                     ├── DockerAnalyzerRunner   (dev/compat; docker run)
                                                     └── InProcessAnalyzerRunner(prod; entrypoint.sh no próprio container)
                                                            [futuro: ManagedJobAnalyzerRunner]
```
Contrato do runner: `run(src_dir, out_dir, conf_dir=None, timeout=900) -> (ok, log)`; `output.json` em
`out_dir`. Seleção por `CA_ANALYZER_RUNNER` (`docker`|`inprocess`). **O contrato do CodeAnalysis não
depende mais da infraestrutura de execução.**

## 2. Diff (arquivos)

| Arquivo | Mudança |
|---|---|
| `web/runner.py` (novo) | `AnalyzerRunner` + `DockerAnalyzerRunner` + `InProcessAnalyzerRunner` + `get_runner()` |
| `web/analyzer.py` | `analyze()` passa a chamar `runner.get_runner().run(...)`; `run_docker()` vira compat que delega ao `DockerAnalyzerRunner` (fonte única). Pipeline (parse/enrich/resume) inalterado |
| `web/wsgi_api.py` (novo) | WSGI mínimo: só `/api/v1/*` + `/health` (SEM UI standalone/`/analyze`/`/fix`) |
| `Dockerfile.inprocess` (novo) | `FROM totvsengpro/advpl-tlpp-code-analyzer` + pip/Flask/gunicorn; `CA_ANALYZER_RUNNER=inprocess`, `CA_ENABLE_FIX=0`, `-w 1`, `ENTRYPOINT []`, healthcheck |

**Não alterados:** API JSON (`api.py`), store/SQLite, pipeline de findings, BFF A2, frontend.

O `InProcessAnalyzerRunner`: copia `src→/tmp` → limpa `/bin/{src,includes,output}` → roda
`bash /bin/entrypoint.sh` (mesmo binário) → copia `/bin/output/output.json → out_dir` → **cleanup** dos
fontes em `/tmp`. Caminhos BAKED (`/tmp`, `/bin/output`) ⇒ **concurrency=1**.

## 3. Teste A/B (equivalência) — RESULTADO

Mesmo fonte → `DockerAnalyzerRunner` (`docker run`) × `InProcessAnalyzerRunner` (in-process):

| Conjunto | Docker | In-process | `output.json` |
|---|---|---|---|
| small (1 arq) | 220 B | 220 B | **BYTE-IDÊNTICO** (1 finding) |
| medium (5 arq) | 1147 B | 1147 B | **BYTE-IDÊNTICO** (5 findings) |
| large (40 arq, 18,4k linhas) | 4522 B | 4522 B | **BYTE-IDÊNTICO** (40 findings) |

`diff` exato + comparação estrutural (severity/rule/line/message) → **igualdade total**. **Paridade
funcional comprovada** — as 35 capacidades (que vivem na API/store/pipeline inalterados) ficam intactas.

## 4. Recursos (INDICATIVO — emulação amd64 no Mac; números reais virão do amd64 nativo)

| Conjunto | RAM mínima OK | Pico observado | Duração | Exit |
|---|---|---|---|---|
| small | 384 MB | ~360 MB | ~5–6 s | 0 |
| medium | 512 MB | ~415 MB | ~10–11 s | 0 |
| large | 512 MB | ~460–470 MB | ~102–115 s | 0 |

JVM `-Xmx6144M`, mas nessas cargas nunca passou de ~470 MB. **Piso prático seguro: 512 MB**; provisionar
folga (1–2 GB) e **medir no amd64 nativo** com bases reais grandes (o teto pode subir). Disco: só um
workspace temporário por job (apagado); SQLite persiste.

## 5. Concorrência

`InProcessAnalyzerRunner` usa caminhos fixos (`/tmp`, `/bin/output`) → 2 análises no **mesmo** container
colidiriam. `Dockerfile.inprocess` já impõe `gunicorn -w 1` (**concurrency=1**). Evidência: 2 `large`
concorrentes (containers separados) → ~671+674 MB (≈1,35 GB somado). **Não escalar workers** antes de
medir; escalar = mais instâncias (ou Opção B jobs), não mais workers por container.

## 6. Segurança (validado)

- `/api/v1/*` exige `CA_SERVICE_TOKEN` → **401 sem token** (confirmado).
- **UI standalone NÃO exposta:** `GET /` e `POST /analyze` → **404** (só `/api/v1` + `/health`).
- **IA OFF:** `CA_ENABLE_FIX=0`, sem `GEMINI_API_KEY`, e o WSGI nem expõe `/fix`.
- Analyzer roda **sem rede** (`--network none` → A/B MATCH) e **sem docker.sock/dind/privileged**.
- **Código só em workspace temporário** + **cleanup** (fontes purgados de `/tmp`; `out_dir` só com
  `output.json`+`execution.log`). Sem secrets em log (o serviço já não loga token).
- Analyzer **não recebe** Firebase/Git/RPO/Windows.
- Nota: roda como **root** (o analyzer escreve em `/bin/{src,includes,output}`, root-owned na imagem);
  container isolado. Endurecer non-root (chown) é evolução, não bloqueia o L1.

## 7. Regressões / bugs encontrados e CORRIGIDOS

1. **`ENTRYPOINT` herdado não resetado** → o `CMD gunicorn` virava argumento do `entrypoint.sh` e o
   gunicorn não subia. **Corrigido:** `ENTRYPOINT []` no `Dockerfile.inprocess`. Revalidado: `/health`→200.
2. **`ok=True` mascarava falha silenciosa** (entrypoint sai 0 em OOM/sem saída). **Corrigido:** ambos os
   runners marcam `ok=False` quando `output.json` **não** é gerado. (O pipeline já tratava output ausente
   como erro; agora o sinal é explícito no runner.)
3. **(ambiente, não é bug)** Docker Desktop no Mac não compartilha `/private/tmp` (bind cai vazio) —
   irrelevante em Linux/Render; afeta só testes locais que montem `/tmp`.

## 8. Plano de deploy Render (L1.1c — NÃO executado)

1. Build `--platform linux/amd64 -f Dockerfile.inprocess` (imagem amd64).
2. Serviço no Render (**amd64**, RAM ≥ 1–2 GB — validar com carga real; se estourar, plano maior ou
   Opção B job amd64). **concurrency=1** (`-w 1`).
3. Disco persistente para `CA_DB`/`CA_WORK` (SQLite/histórico).
4. Envs: `CA_ANALYZER_RUNNER=inprocess`, `CA_SERVICE_TOKEN` (secret forte, rotação 90d), `CA_ENABLE_FIX=0`,
   **sem** `GEMINI_API_KEY`; `CA_ANALYZER_TIMEOUT=900`.
5. Canal BE→CodeAnalysis: **TLS (Render) + Bearer**; **rede privada Render** entre serviços quando a
   topologia permitir (sem exposição pública do CodeAnalysis). **Sem mTLS/proxy** (decisão aprovada).
6. BE homolog: setar `CODEANALYSIS_BASE_URL` (+ `CODEANALYSIS_SERVICE_TOKEN` = o `CA_SERVICE_TOKEN`) +
   `CODEANALYSIS_ENABLED=true` + `service_enabled`. **Nenhuma mudança de código no BE/frontend.**
7. Smoke L1.1d: 1 fonte real → never→queued→running→completed na aba Qualidade congelada.

## 9. Plano de rollback

- **Kill-switch imediato:** `CODEANALYSIS_ENABLED=false` no BE → "indisponível" controlado, sem quebra,
  sem tocar FE.
- **Runner por flag:** `CA_ANALYZER_RUNNER=docker` reverte ao caminho `docker run` (o `DockerAnalyzerRunner`
  permanece no código) — reversível por env.
- **Imagem:** manter tag/digest anterior; o `Dockerfile` antigo (dind) segue no repo.
- **Código:** reverter o commit `572d7a8` (adição isolada; nada removido do caminho antigo).
- **Nenhum rollback de frontend/BFF** (não foram tocados).

## 10. Parada

**PARADO após o L1.1b.** Não deployado no Render, não iniciado L1.1c, L2 ou L3. Aguardando sua aprovação
para o L1.1c (deploy).
