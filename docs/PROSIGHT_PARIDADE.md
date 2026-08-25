# Prosight — Matriz Final de Paridade e Auditoria Funcional (C4.5)

> **Natureza deste documento:** auditoria. Não corrige gaps — audita, classifica, documenta e
> propõe tratamento. `build ✓` **não** fecha o gate; cada capacidade foi verificada no código.
> Data: 2026-08-24. Branch: `feat/minutor-modules-integration`. Auditoria base: `ee7bd5ac` (C4.4).
> **Atualizado após C4.6 (`78182a9e`):** as 4 pendências funcionais (A1–A4) foram fechadas no
> frontend — ver §8. Placar de pendências funcionais: **4 → 0**.
> Modo de dados: **100% fixture** em todo o Prosight/Operações; adapters de dados live **lançam erro**
> (nunca fallback silencioso). Central de Fontes é o único domínio **live** (backend Minutor real).

## Legenda de estados
| Estado | Significado |
|---|---|
| **PRESERVADA** | Continua existindo praticamente como antes |
| **CONSOLIDADA** | Continua existindo, incorporada a uma experiência maior |
| **DECOMPOSTA** | Uma tela/capacidade antiga foi distribuída em áreas mais específicas |
| **SUBSTITUÍDA** | A capacidade continua, agora via mecanismo nativo do Minutor |
| **PENDENTE LIVE** | Front/contrato prontos; falta infraestrutura/dado real (não funciona em fixture) |
| **PENDÊNCIA FUNCIONAL** | Capacidade real ainda sem destino/lar adequado (produto incompleto) |
| **LEGADO COMPATÍVEL** | Mantida só para deep-link/compatibilidade |
| **DESCARTADA** | Só com justificativa explícita (expectativa: zero) |

Coluna **Dep. live** = dependência de infraestrutura para dado/efeito real (trilha L1 CodeAnalysis /
L2 Prosight Engine / L3 Windows-AppServer). É a categoria **B (fixture → live)**, separada das
**pendências funcionais (A)**.

---

## 1. Visão da arquitetura final

Prosight é um **módulo de frontend nativo** no Minutor ("Gestão e Governança Técnica Protheus") que
consolida a **experiência/navegação** de cinco frentes — **motores permanecem separados**:

- **Central de Fontes** (LIVE, backend Minutor) — catálogo, doc determinística+semântica, qualidade,
  GMUD. A **Fonte (SourceDoc)** é a entidade central; a ficha virou o **Prontuário Técnico**.
- **CodeAnalysis** (serviço externo, L1) — qualidade por fonte/blob; FE pronto, serviço off.
- **Prosight Engine** (Git×RPO, L2) — inventário/licenciamento; fixture, engine não conectado.
- **Operações Protheus** (Windows/AppServer, L3) — ambientes/appservers/compilação; fixture.
- **GMUD** (Minutor DB + Git) — publicação governada ancorada no chamado do Help Desk.

Camadas transversais criadas na consolidação: **Visão Geral executiva** (rollup), **Atividade &
Auditoria** (read-model de timeline via adapters, **sem fundir storage**), **Prontuário** (facetas da
fonte). Autoridade dos dados preservada e rotulada na UI — o Minutor **não** se apresenta como
autoridade sobre Git, RPO, Windows ou CodeAnalysis (ver §4).

## 2. Árvore final de navegação

```
Prosight
├─ Visão Geral
├─ Ambientes
├─ Fontes
│   ├─ Acervo
│   ├─ Inventário
│   ├─ Busca
│   ├─ Impacto
│   └─ Publicações
├─ Licenciamento
├─ Operação
│   ├─ AppServers
│   ├─ Compilação
│   ├─ Patches
│   └─ RPO
├─ Atividade & Auditoria
└─ Configuração
    ├─ Prosight
    ├─ Ambiente
    └─ Governança            (hoje = IA & Custos)
```
Fora do nav de topo (drill-down por CTA/deep-link, capacidade preservada): **Mudanças** e
**Auditoria** de Operações. Órfãs de navegação (ver §9): **Repositórios inativos**, **Aprovações de
IA**, **Campanha semântica**. O Prontuário abre em `Fontes → Acervo → Fonte` (tabs internas, sem 3º
nível de nav).

## 3. Matriz completa de paridade

### 3.1 Central de Fontes (LIVE)
| Capacidade | Estado | Onde / evidência | Dep. live |
|---|---|---|---|
| Acervo | PRESERVADA | `/central-fontes/acervo` (split-view árvore + ficha) | — |
| Busca técnica | PRESERVADA | `/central-fontes/busca` | — |
| Impacto | PRESERVADA | `/central-fontes/impacto` (+ chips do Prontuário linkam p/ cá) | — |
| Ficha / Prontuário | CONSOLIDADA | `SourceDocDetail` → 7 abas (C4.3) | — |
| Documentação | PRESERVADA | abas Visão Geral/Conhecimento (semântico+determinístico) | — |
| Regras de negócio | CONSOLIDADA | aba Conhecimento (portada do órfão) | — |
| Funções / trace | CONSOLIDADA | aba Conhecimento (accordion) | — |
| Dependências | CONSOLIDADA | aba Dependências (chips + cross-source) | — |
| Evidências | CONSOLIDADA | aba Dependências (ACCEPT/REJECT) | — |
| Código | CONSOLIDADA | aba Código (`GET /source-docs/{id}/source`) | — |
| Versões / histórico | CONSOLIDADA | aba Mudanças (`/versions`) | — |
| Qualidade | PRESERVADA | aba Qualidade (`QualityTab` 1:1) | **L1** (serviço) |
| Inativos (Repositórios) | CONSOLIDADA | `/central-fontes/inativos` → leaf **Configuração → Governança → Repositórios** (C4.6) | — |
| Aprovações (IA) | CONSOLIDADA | `/central-fontes/aprovacoes` → leaf **Governança → Aprovações IA** (C4.6) | — |
| Campanha (semântica) | CONSOLIDADA | `/central-fontes/campanha` → leaf **Governança → Campanhas** (C4.6) | — |
| Config IA & Custos | PRESERVADA | `/central-fontes/configuracoes` (leaf Governança) | — |

### 3.2 Prosight original — Git×RPO (Engine L2)
| Capacidade | Estado | Onde / evidência | Dep. live |
|---|---|---|---|
| Inventário Git×RPO | PRESERVADA | `/prosight/inventario` (`InventarioView`) | **L2** |
| Scan | PRESERVADA | `scanInventory()` (fixture; live lança) | **L2** |
| Cinco estados | PRESERVADA | `sincronizado/recompilar/verificar_rpo/nao_compilado/so_rpo` | **L2** |
| REST APIs | PRESERVADA | filtro `rest_api` / `isRestApi` | **L2** |
| Download de fonte | **PENDENTE LIVE** | `onDownload` → toast "Download disponível na conexão real (F6)" (stub) | **L2** |
| Licenciamento | PRESERVADA | `/prosight/licenciamento` | **L2** |
| Utilização de customizações | PRESERVADA | seção customizações do Licenciamento | **L2** |
| Configuração Git | PRESERVADA | `configuracao-view` (URL/branch/token) | **L2** (save real) |
| Configuração RPO | PRESERVADA | `configuracao-view` (API url/user/pass) | **L2** |
| Exclusões | PRESERVADA | `rpoExclusionPatterns` | **L2** |
| Teste da API | **PENDENTE LIVE** | `checkApi()` simulado; resultado real depende de infra | **L2** |

### 3.3 Dashboards / Operações Protheus (Windows/AppServer L3)
| Capacidade | Estado | Onde / evidência | Dep. live |
|---|---|---|---|
| Ambientes | CONSOLIDADA | seção própria `/operacoes-protheus/ambientes` (C2) | **L3** |
| AppServers | DECOMPOSTA | página própria (`appservers-view`, split do F4) | **L3** |
| Start/Stop/Restart | PRESERVADA | `operations.tsx` (confirmação→progresso→resultado, simulado) | **L3** |
| Start/Stop all | PRESERVADA | `serviceAll()` | **L3** |
| Renomear serviço | PRESERVADA | implementado no FE (C4.6): botão + modal + validação + `renameService` (fixture); execução real no L3 | **L3** |
| INI (Info do ambiente) | PRESERVADA | `InfoCard` "Informações do Ambiente (INI)" | **L3** |
| Monitor System | PRESERVADA | `FolderMonitorCard` | **L3** |
| Console | PRESERVADA | `ConsoleViewer` (reload **manual**) | **L3** |
| Auto-refresh 30s | **PENDENTE LIVE** | só "Recarregar" manual hoje; auto-refresh depende de live | **L3** |
| Exclusivo | PRESERVADA | `operations.exclusive` (+ banner/estado) | **L3** |
| Debug | PRESERVADA | `operations` debug on/off | **L3** |
| Limpeza System/TSK | PRESERVADA | `clean-system` / `clean-tsk` | **L3** |
| Compilação | DECOMPOSTA | página própria (`compilacao-view`) | **L3** |
| Patches | DECOMPOSTA | página própria (`patches-view`) | **L3** |
| Promoção RPO | PRESERVADA | `promote` | **L3** |
| Rollback | PRESERVADA | `rollback-rpo` | **L3** |
| Fontes Disco×RPO | SUBSTITUÍDA | absorvido pelo Inventário **Git×RPO**; `/operacoes-protheus/fontes`→redirect (decisão O1/C0) | **L2** |
| Mudanças | CONSOLIDADA | timeline **Atividade & Auditoria** (C4.2) + página especializada (drill-down) | **L3** |
| Auditoria | CONSOLIDADA | timeline **Atividade & Auditoria** + página especializada (drill-down) | **L3** |
| Configuração (ambiente) | PRESERVADA | `/operacoes-protheus/configuracao` (view); **edição = D-live** | **L3** (edição) |
| Usuários / permissões | SUBSTITUÍDA | identidade/perfis do Minutor (`canOperacoes`); módulo próprio não recriado | — |

### 3.4 GMUD / Publicações (Minutor DB + Git)
| Capacidade | Estado | Onde / evidência | Dep. live |
|---|---|---|---|
| Solicitações | CONSOLIDADA | "Publicações" (`/central-fontes/solicitacoes`, C4.1) | — |
| Commits | CONSOLIDADA | view "Commits GMUD" (`/source-docs/gmud-commits`) | — |
| Publicação vinculada ao chamado | PRESERVADA | Help Desk `tickets/[id]` (`GmudPublishModal`/`GmudPublicacaoPanel`) | — |
| Matching por blob | PRESERVADA | BE `GmudPublishService` (new/existing/identical/ambiguous) | — |
| Classificação projeto/avulso | PRESERVADA | BE + `GmudPublishModal` | — |
| Escolha de destino | PRESERVADA | BE (árvore Git) + modal | — |
| Commit atômico | PRESERVADA | BE `GithubAppAuth::commitFiles` | — |
| Vínculo Fonte↔GMUD↔commit | CONSOLIDADA | `source_doc_versions.gmud_id`; aparece no Prontuário/Mudanças + timeline | — |

### 3.5 CodeAnalysis (serviço externo L1)
| Capacidade | Estado | Onde / evidência | Dep. live |
|---|---|---|---|
| Estados da análise | PRESERVADA | `QualityTab` (never/queued/running/completed/failed/outdated) | **L1** |
| Execução / reanálise | PRESERVADA | `POST /source-docs/{id}/quality` | **L1** |
| Findings | PRESERVADA | `/quality/{id}/findings` | **L1** |
| Severidade / categoria | PRESERVADA | render de `Finding` | **L1** |
| Snippets | PRESERVADA | snippet + linha no GitHub (`view_git`) | **L1** |
| Histórico | PRESERVADA | `/quality/history` | **L1** |
| Outdated | PRESERVADA | flag `stale`/`outdated` | **L1** |
| Permissões | PRESERVADA | `quality.run` / `quality.view` / `view_git` | — |
| Indisponibilidade do serviço | PRESERVADA | estado 503 tratado no `QualityTab` | **L1** |

### 3.6 Consolidação C1–C4 (novas camadas)
| Capacidade | Estado | Onde / evidência |
|---|---|---|
| Visão Geral (executiva) | PRESERVADA | `/prosight/visao-geral` (C3) |
| Ambientes (seção) | PRESERVADA | `/operacoes-protheus/ambientes` (C2) |
| Prontuário | PRESERVADA | ficha 7 abas (C4.3) |
| Atividade & Auditoria | PRESERVADA | `/prosight/atividade` (C4.2, read-model) |
| Publicações | PRESERVADA | `/central-fontes/solicitacoes` renomeada (C4.1) |
| Canonicalização de rotas | PRESERVADA | redirects de compat (C4.4) |
| Permissionamento do shell | PRESERVADA | `ProsightNav` gates por permissão (C1.1) |

## 4. Autoridade dos dados

| Informação | Autoridade | Nível | Situação |
|---|---|---|---|
| Catálogo / identidade da fonte | Minutor DB | Fonte | existente (live) |
| Documentação (determinística + semântica) | Minutor DB | Fonte | existente (live) |
| Regras / funções / dependências / evidências | Minutor DB (semântico) | Fonte | existente (live) |
| Código / versionamento / blob / commit | Git | Fonte | existente (live, via backend) |
| GMUD (pacote, matching, publicação) | Minutor DB + Git | Fonte/commit | existente (live) |
| Qualidade (score/findings) | CodeAnalysis | Fonte/blob | **PENDENTE LIVE (L1)** |
| Inventário Git × RPO | Prosight Engine (Git × RPO) | Fonte × Ambiente | **PENDENTE LIVE (L2)** |
| Licenciamento / utilização | Prosight Engine | Empresa/Ambiente | **PENDENTE LIVE (L2)** |
| Estado AppServer / serviços | Windows/AppServer | Ambiente | **PENDENTE LIVE (L3)** |
| Console / pasta System / INI | Windows/AppServer | Ambiente | **PENDENTE LIVE (L3)** |
| Compilação / patch / RPO / rollback | Windows/AppServer | Ambiente | **PENDENTE LIVE (L3)** |
| Mudanças / Auditoria operacional | dashboards-service (Minutor DB, fatos do Windows) | Ambiente | **PENDENTE LIVE (L3)** |

**Regra de honestidade da UI:** a timeline (Atividade & Auditoria) e o Prontuário rotulam a
`autoridade`/`origem` por evento/faceta; nada apresenta o Minutor como autoridade sobre Git, RPO,
Windows ou CodeAnalysis.

## 5. Rotas canônicas e legadas

**Canônicas (páginas reais):** `/prosight/visao-geral`, `/prosight/atividade`, `/prosight/inventario`,
`/prosight/licenciamento`, `/prosight/configuracao`, `/operacoes-protheus/ambientes`,
`/operacoes-protheus/{appservers,compilacao,patches,rpo,configuracao}`, `/central-fontes`(Acervo),
`/central-fontes/{acervo,busca,impacto,solicitacoes,configuracoes}`, `/central-fontes/[id]` (Prontuário).

**Legado compatível (redirect direto, 1 hop, preserva query string):**
| Rota legada | → Destino canônico | Motivo |
|---|---|---|
| `/operacoes-protheus/visao-geral` | `/prosight/visao-geral` | executiva canônica; operacional decomposta |
| `/operacoes-protheus` (raiz) | `/operacoes-protheus/ambientes` | porta canônica |
| `/operacoes-protheus/fontes` | `/prosight/inventario` | Disco×RPO absorvido por Git×RPO |

**Drill-down fora do nav de topo (deep-link/CTA):** `/operacoes-protheus/mudancas`,
`/operacoes-protheus/auditoria`.
**Órfãs de navegação (deep-link cru):** `/central-fontes/inativos`, `/central-fontes/aprovacoes`,
`/central-fontes/campanha` (ver §9).
**Dev-only:** `/prosight/preview`, `/operacoes-protheus/preview` (fora do AppLayout).
**Sem cadeia de redirect:** todos os destinos são páginas reais (0 `redirect()`). Verificado live.

## 6. Permissões

| Domínio | Chave | Perfis (do `PermissionService`) |
|---|---|---|
| Shell/Visão Geral/Atividade | `source_docs.view` \| `.quality.view` \| `operacoes_protheus.view` \| admin | admin=tudo |
| Fontes (Acervo/Busca/Impacto) | `source_docs.view` / `.quality.view` | admin, coordenador |
| Inventário | admin | admin |
| Publicações (GMUD) | `source_docs.gmud_publish` | admin (+ quem tiver a chave) |
| Governança (IA/Custos) | `cost_settings.view` / `semantic_campaign` / `cost_approval.view` | admin |
| Operação/Ambientes | `operacoes_protheus.view` \| admin | admin (TODO perfis no D-live) |
| Qualidade (executar) | `source_docs.quality.run` | admin, coordenador |
| Código / GitHub | `source_docs.view_git` | admin, coordenador |
| Validar / Reprocessar / Download doc | `source_docs.validate` / `.reprocess` / `.download` | admin |

Permission-aware em **duas camadas**: nav oculta o que o perfil não acessa (não eleva) e o **backend
é autoridade**. A timeline filtra famílias por permissão (operador≠coordenador≠admin, provado na C4.2).

## 7. Funcionalidades fixture → live (categoria B)

Front/contrato prontos; dependem de infra. Adapter live **lança erro** (sem fallback).

- **L1 (CodeAnalysis):** qualidade — estados, execução/reanálise, findings, severidade, snippets,
  histórico, outdated, indisponibilidade (**8** capacidades).
- **L2 (Prosight Engine / Git×RPO):** inventário, scan, cinco estados, REST, download de fonte,
  licenciamento, utilização de customizações, config Git, config RPO, exclusões, teste da API
  (**11** capacidades).
- **L3 (Windows/AppServer):** ambientes, appservers, start/stop/restart, start/stop all, INI, monitor
  System, console, auto-refresh 30s, exclusivo, debug, limpeza System/TSK, compilação, patches,
  promoção RPO, rollback, configuração (edição), mudanças, auditoria (**18** capacidades).

**Total categoria B (fixture → live): 37 capacidades.** Destas, **3** são hoje meros stubs (estado
PENDENTE LIVE: download de fonte, teste da API, auto-refresh 30s); as demais funcionam sobre fixtures.

## 8. Pendências funcionais (categoria A) — FECHADAS na C4.6

| # | Item | Situação na C4.5 | Fechamento na C4.6 (`78182a9e`) |
|---|---|---|---|
| A1 | Repositórios inativos | órfã de navegação | leaf **Configuração → Governança → Repositórios** (rota mantida) |
| A2 | Aprovações de IA | só via CTA da ficha | leaf **Configuração → Governança → Aprovações IA** |
| A3 | Campanha semântica | só highlight/catálogo | leaf **Configuração → Governança → Campanhas** |
| A4 | Renomear serviço (AppServer) | não implementado | UI + modal + validação + `renameService` (fixture); **execução real no L3** |

**Total categoria A (pendência funcional): 4 → 0.** O frontend está funcionalmente completo; o que
resta é exclusivamente **fixture → live** (categoria B, §7). A4 permanece com dependência de infra
(L3) — mas o front/contrato já existem (não é mais pendência de produto).

## 9. Capacidades órfãs — RESOLVIDAS na C4.6

- `/central-fontes/inativos`, `/central-fontes/aprovacoes`, `/central-fontes/campanha` — **deixaram de
  ser órfãs**: ganharam leaves em `Configuração → Governança` (C4.6). Rotas mantidas; nenhuma
  capacidade movida/perdida. A decisão da C4.4 de **não** redirecionar `inativos` para Configurações
  (IA & Custos ≠ gestão de repositórios) fica registrada como o motivo de tê-la tratado como pendência
  funcional e não como limpeza de rota.
- `/operacoes-protheus/mudancas` e `/auditoria` — permanecem **intencionalmente** fora do nav de topo
  (drill-down por CTA/deep-link + cobertas pela timeline transversal). Decisão, não pendência.

**Órfãs remanescentes: 0.**

## 10. Riscos residuais

1. **Amplo conjunto fixture→live (37):** o Prosight "parece pronto", mas Operações (L3), Git×RPO (L2)
   e Qualidade (L1) exibem **dados de demonstração**. Banners de fixture presentes em todas as telas;
   o adapter live lança erro (evita ir a prod achando que é real).
2. **Correlação build×auditoria é heurística** (C4.2), não identidade. No live, exige
   `operationId/jobId` persistente na origem — senão risco de consolidação incorreta. Documentado.
3. **Ambientes por fonte (Git×RPO)** permanece "pendente live" no Prontuário — **não** inferir de
   empresa/ambiente. Risco se alguém "preencher" antes de L2.
4. **Perfis de Operações** hoje = admin/`operacoes_protheus.view`; o mapeamento fino de perfis para
   ações destrutivas (start/stop/clean/promote) fica para o D-live (L3, começa read-only).
5. **Órfãs de governança (A1–A3):** capacidades acessíveis só por deep-link podem ser percebidas como
   "sumidas". Tratamento proposto em §8; não implementado.
6. **GMUD publish** é ancorado no chamado (regra de negócio). A "Publicações" no Prosight é consulta —
   risco de expectativa de "publicar daqui"; mitigado pelo banner de separação (C4.1).

## 11. Itens explicitamente descartados

**Nenhum (0).** Nenhuma capacidade foi descartada. O único módulo não recriado (Usuários/permissões do
Dashboards) foi **SUBSTITUÍDO** pela identidade/perfis nativos do Minutor — decisão consciente, com a
capacidade (controle de acesso) preservada via mecanismo nativo, não descartada.

## 12. Checklist de conexão live (L1 → L2 → L3)

Trilhas **independentes**; ordem sugerida L1→L2→L3 (L3 por último por ser potencialmente destrutivo).
Trocar `fixture → live` é só o datasource/adapter — **não** redesenhar telas (exceto os itens já
marcados pendente-live/decisão).

**L1 — CodeAnalysis (Qualidade)**
- [ ] Serviço CodeAnalysis no host Linux acessível ao backend Minutor (A2).
- [ ] `NEXT_PUBLIC_*` / backend: qualidade sai de OFF → responde `/source-docs/{id}/quality*`.
- [ ] Validar estados (queued/running/completed/failed/outdated) e findings reais na ficha.
- [ ] Consolidado executivo de qualidade (hoje card informativo na Visão Geral) passa a agregar.

**L2 — Prosight Engine (Git×RPO)**
- [ ] Engine Git×RPO + Firebase/repo/RPO reais; datasource `NEXT_PUBLIC_PROSIGHT_DATA_MODE=live`.
- [ ] Inventário/scan/cinco estados/REST com dado real; **download de fonte** deixa de ser stub.
- [ ] **Teste da API** retorna resultado real; config Git/RPO/exclusões salvam na infra.
- [ ] **Prontuário → Ambientes** deixa de ser "pendente live": mapear `program`(RPO) ↔ `source_doc`.
- [ ] Licenciamento/utilização com dado real.

**L3 — Operações Protheus (Windows/AppServer) — começa SOMENTE-LEITURA**
- [ ] Host Windows + AppServer/RPO; `NEXT_PUBLIC_OPERACOES_DATA_MODE=live`.
- [ ] Read-only primeiro: estado de serviços, INI, monitor System, console (com auto-refresh 30s real).
- [ ] Só então ações destrutivas (start/stop/restart/all, exclusive, debug, clean, compile, patch,
      promote, rollback) — com perfis/permissões finas de Operações.
- [ ] Decidir **renomear serviço** (A4).
- [ ] Edição de configuração de ambiente (D-live).
- [ ] Mudanças/Auditoria operacionais com fatos reais → alimentam a timeline (com `operationId`).

**Roadmap aprovado:** C4.6 (A1–A4, ✅ feito) → **Frontend Freeze** → L1 CodeAnalysis → L2 Prosight
Engine → L3 Windows/AppServer → **L4 Paridade Live** → **L5 Aceite final / aposentadoria dos legados**.
**Regra:** nenhum sistema original é aposentado antes do L5.

---

## Placar quantitativo

**Após a C4.6 (frontend funcionalmente completo):**

**72 capacidades auditadas** ·
**69 disponíveis** (48 PRESERVADAS + 16 CONSOLIDADAS + 3 DECOMPOSTAS + 2 SUBSTITUÍDAS) ·
**3 PENDENTE LIVE** (estado: stubs — download de fonte, teste da API, auto-refresh 30s) ·
**0 pendências funcionais** (as 4 A1–A4 foram fechadas na C4.6) ·
**0 descartadas**.

**Dependência de infra (categoria B, fixture → live): 38 capacidades** (L1: 8 · L2: 11 · L3: 19 —
inclui Renomear AppServer) — inclui as 3 em estado PENDENTE LIVE.

> **Marco:** 72 capacidades originais → **72 com destino funcional no Prosight** → **0 pendências de
> frontend** → **0 descartadas**. O trabalho restante é exclusivamente **trocar fixtures por
> autoridades reais** (categoria B, 38), pela trilha L1 → L2 → L3.

**Placar de referência da C4.5 (antes da C4.6):** 65 disponíveis · 4 pendências funcionais.
