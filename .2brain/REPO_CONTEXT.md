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

- **First contact with an unfamiliar codebase** → `.2brain/llm-wiki/OVERVIEW.md` for orientation, then `.2brain/modules/boilerplate-node-backend_INDEX.md` for the module map.
- **Editing or reading a source file** → read `.2brain/llm-wiki/<path>.md` first (page path = source path + `.md`). It carries the file's purpose, key elements, graph neighbours, and gotchas not in the source.
- **"How is this structured?" / "where does X live?"** → `.2brain/arch/overview.md`, then the component page it points to.
- **"How do I run / build / test / deploy this?"** → `.2brain/EXECUTION.md`.
- **Anything else, or you don't know which file** → `2brain query <repo-path> "question"`.

Artifacts describe commit `9574ae12071f19ea8514818664f83641050c94fb`. Before relying on a wiki page, check its source: `git diff --quiet 9574ae12071f19ea8514818664f83641050c94fb -- <file>` (and `git status` for uncommitted edits). Changed → prefer the source for that file and say so. Unchanged → trust the page.

## Most-used code
Change these with care — widely depended on:
- `t` (272 edges)
- `successResponse()` (207 edges)
- `catchAs()` (192 edges)
- `generateReject()` (172 edges)
- `callerContextOf()` (154 edges)
- `setupTestDb()` (145 edges)
- `refused()` (139 edges)
- `generateSuccess()` (131 edges)
- `createUser()` (125 edges)
- `recordAudit()` (117 edges)

## Cross-cutting flows
- Contract Fragmentation → Bundle → Generate → Sync Pipeline
- AsyncAPI Event Channels (SSE + Webhooks)
- Layered Architecture (kernel / infrastructure / modules / app)
- SSE Observability Event Flow
- Webhook Delivery Pipeline (Event to Subscriber)
- Production Service Dependency Mesh
- Observability Stack (Traces, Metrics, Logs)
- CI Merge Gate Jobs
- Contract Validation Pipeline (OpenAPI + AsyncAPI)
- Local Observability Stack (Traces, Metrics, Logs, Alerts)
- Weekly Mutation Testing Pipeline
- Grafana Traces-to-Logs Correlation Chain
- Favicon Set (Multi-Platform Brand Icons)
- Seed Thumbnails v1 Image Collection
- Seed Thumbnail Collection v1
- System UI Placeholder Image Set
- Seed Content Thumbnail Collection (v1)
- Authorization Definition Triple (Keys, Roles, Conformance)
- Dual-Backend Conformance Pair
- Tenant Scope Role Set
- Contract Bundling and Linting System
- Worker Queue Publish/Consume Flow
- OpenAPI Shared Schemas and Security
- Account Authentication & Credential Management Flow
- Supporting Subdomain Module Cluster
- Account Module REST API Surface
- Address Book CRUD Operations
- Antibot Challenge Provider Flow
- API Key Mint-Use-Revoke Lifecycle
- Cart CRUD Operations (all return CartResponseEnvelope)
- Delivery Order Lifecycle (ship → deliver state transitions)
- Feedback Admin CRUD Operations
- Inventory Stock Counter Write Operations
- Observability SSE Event Stream
- Locales Two-Tier Dictionary Architecture
- Order Lifecycle and State Transitions
- Payment Confirmation Flow (intent → confirm → sync)
- Admin Payment Management (offline, refund, reference lookup)
- Product CRUD Operations
- Webhook Event Fan-out Catalogue
- Webhook Delivery Pipeline (Publish → Queue → Consume)
- Users CRUD Operation Set
- Wishlist-Cart-Product Dependency Triangle

## Index Metadata
- Provider: `ollama`
- Model: `qwen3.8:27b`
- Index revision: `f22e4be64c45e1d427b46b670dbc0c28d0640d2fa198989b4fb569e03359f466`
- Indexed chunks: `7090`
- Memory entries: `0`

## Query
- Semantic query: `2brain query <repo-path> "your question" --top-k 5`
- Add durable memory: `2brain remember <repo-path> "fact/decision/runbook" --kind fact`

