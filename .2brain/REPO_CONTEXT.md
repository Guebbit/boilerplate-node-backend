# Repo Context

_Canonical 2brain context source for AI editors._

## Core Artifacts
- `.2brain/graphify-out/GRAPH_REPORT.md` — structural and semantic code graph report
- `.2brain/EXECUTION.md` — runnable build/test/CI/migration knowledge
- `.2brain/llm-wiki/` — per-file machine-oriented pages, one per source file (page path = source path + `.md`)
- `.2brain/modules/` — human-oriented module notes, mirrored into Obsidian
- `.2brain/arch/` — component/topic pages with Mermaid diagrams
- `.2brain/repo-index.json` — semantic retrieval index backing `2brain query` (a query backend, not a document to open directly)

## Where to look

- **Editing or reading a source file** → read `.2brain/llm-wiki/<path>.md` first (page path = source path + `.md`). It carries the file's purpose, key elements, graph neighbours, and gotchas not in the source.
- **"How is this structured?" / "where does X live?"** → `.2brain/arch/overview.md`, then the component page it points to.
- **"How do I run / build / test / deploy this?"** → `.2brain/EXECUTION.md`.
- **"How does X reach Y?" / "what depends on X?"** → `2brain structure <repo-path> path <fileA> <fileB>` or `show <file>` (JSON, from the dependency graph).
- **Anything else, or you don't know which file** → `2brain query <repo-path> "question"`.

## Most-used code
Change these with care — widely depended on:
- `createUser()` (441 edges)
- `setupTestDb()` (431 edges)
- `api()` (381 edges)
- `t` (375 edges)
- `createProduct()` (374 edges)
- `catchAs()` (340 edges)
- `generateReject()` (289 edges)
- `successResponse()` (266 edges)
- `refused()` (253 edges)
- `asStub()` (253 edges)

## Cross-cutting flows
- Local observability stack (Prometheus, Alertmanager, Loki, Tempo, Grafana, OTel Collector)
- Alerting pipeline heartbeat chain (Watchdog rule, Alertmanager route, Gatus watcher)
- Mutation sweep pipeline (sweep, waves, runner, failure notice)
- App-code workloads sharing the app image, env ConfigMaps, secrets and data claim
- Public traffic path: Gateway, HTTPRoute, allow-gateway policy and app Service
- Local kind rig: cluster config, Envoy proxy, GatewayClass and overlay kustomization
- Seed Image Collection originals (full-size JPEGs)
- Seed thumbnails v1 (WebP derivatives)
- Seed Thumbnails v1 Photo Collection (batch)
- Authorization model definition and verification
- Spectral contract lint rulesets
- Cross-backend shared conformance cases
- Per-module contract bundle (module.yaml, authorization.yaml, openapi.yaml)
- Account credential-defence rules (cookies, rate limits, 2FA)
- Example module template files
- Domain event contracts delivered via transactional outbox
- Module authorization rule files (rules and sets)
- SSE stream AsyncAPI contracts
- Modules emitting domain events through the transactional outbox
- Critical step-up tier for money-moving actions
- Shop group modules feeding staff work (shop-tasks, stats, sitemap)
- User erasure event and webhook flow
- Webhook delivery, retry and auto-disable flow
- User purchase hold review flow

## Index Metadata
- Provider: `claude-code`
- Model: `claude-sonnet-5-5`
- Index revision: `2e1e1044728e07da23cef932226dbd82f2aabc77d032be9d0aa14cf3e7733d6c`
- Indexed chunks: `18779`
- Memory entries: `0`

## Query
- Semantic query: `2brain query <repo-path> "your question" --top-k 5`
- Structure (how things connect, JSON): `2brain structure <repo-path> overview`, `find <words>`, `show <file-or-symbol>`, `path <from> <to>`
- Add durable memory: `2brain remember <repo-path> "fact/decision/runbook" --kind fact`

