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

Artifacts describe commit `20ac75dd577ae2cf177b1daa0f81bdd44962c97f`. Before relying on a wiki page, check its source: `git diff --quiet 20ac75dd577ae2cf177b1daa0f81bdd44962c97f -- <file>` (and `git status` for uncommitted edits). Changed → prefer the source for that file and say so. Unchanged → trust the page.

## Most-used code
Change these with care — widely depended on:
- `createUser()` (401 edges)
- `setupTestDb()` (388 edges)
- `t` (368 edges)
- `createProduct()` (336 edges)
- `catchAs()` (326 edges)
- `api()` (318 edges)
- `generateReject()` (288 edges)
- `successResponse()` (256 edges)
- `refused()` (239 edges)
- `callerContextOf()` (234 edges)

## Cross-cutting flows
- Layered Architecture (kernel → infrastructure → modules → app)
- Contract-First Generation Pipeline (shared → api → frontend)
- Quality Gate System (pre-commit, testing, linting, commits)
- Production App/Cron/Setup Service Trio (same image, same secrets)
- Dual Redis Architecture (Cache + Limits)
- Multi-Client Isolation via COMPOSE_PROJECT_NAME
- Failure Notification Pattern (shared composite action)
- CI Setup Reuse (composite action shared across workflows)
- Security Scanning Suite (complementary checks)
- Mutation Testing CI Pipeline
- Local Observability Stack
- Shared CI Workflow Actions
- API Availability Alert Chain
- Webhook Delivery Monitoring Alerts
- Scheduled Job Staleness Monitoring
- Observability Stack (Prometheus, Alertmanager, Loki, Tempo, Promtail)
- Alerting Pipeline Self-Monitoring Rules
- Container Log Shipping to Loki
- Seed Image Collection (public/images/seed)
- Seed Thumbnails v1 Collection
- Seed Thumbnail Collection v1
- Seed Thumbnail v1 Collection
- HTTP API Standards Compliance Framework
- Problem+JSON Error Handling Pattern
- Idempotent Writes Pattern
- Scope Invariant Conformance Cases (tenant↛platform)
- Staff vs Own-Rows Action Separation (display/admin vs read/update/delete)
- Step-Up Critical Tier Actions (irreversible or high-damage)
- Cross-Implementation Conformance Test Suite
- Tenant Scope Role Hierarchy
- HKDF Key Derivation and Usage Chain
- Async Worker Queue Processing Pattern
- Three-Layer Authorization Permission Model
- SSRF Outbound Call Defense (Address + URL)
- Spectral Linting Rule Hierarchy (OpenAPI + AsyncAPI)
- Authentication and Session Infrastructure
- Image Upload and Processing Pipeline
- Transactional Outbox Lifecycle
- Account Module Dependency Graph
- Staff Role Demo Personas
- Account Email Change Workflow
- Account Step-Up Authentication Flow
- Antibot Challenge Issuance and Verification
- API Key CRUD Lifecycle (List, Mint, Get, Revoke)
- Cart Checkout Dependency Chain
- Account Data Export Bundling Across Modules
- Delivery Shipment Webhook Events (shipped, delivered, lost)
- Delivery Module Contract Bundle (webhooks + auth + openapi + module)
- Module Pattern: example as template for delivery
- Example Lifecycle State Machine (draft → published → archived → draft)
- Inventory Stock Movement Ledger (receive, adjust, sweep → StockMovement rows)
- Shop Bounded Context (inventory, invoicing, products, orders, payments, account)
- Locales CRUD Operation Set
- Notifications SSE Event Flow
- Locales Permission Hierarchy
- Observability SSE Stream Flow (channels, messages, payload)
- Staff Notification Code Variants (task lifecycle + webhook + outbox)
- ObservabilityHealth Schema Composition
- Orders Module Contract Surface (REST + Events + Auth)
- Order-Payment Lifecycle Event Flow
- Order PII Retention and Redaction Flow
- Payments Authorization Permission Sets
- Products Authorization Permission Sets
- Payments Staff Operations Requiring display:Payment
- Return Lifecycle Webhook Events
- Returns Permission Sets
- Returns REST API Operations
- Shop-Tasks Notification Contract (buyer messages + staff notices + params schemas)
- Shop-Tasks Module Dependency Set
- Shop Group Modules (shop-tasks, sitemap, stats)
- Stats Module Dashboard Operations
- Task Lifecycle State Transitions
- Stock-Alerts Request Lifecycle
- Webhook Event Delivery Flow (fire → subscribe → enqueue → deliver)
- Users Module Contract Surface
- Webhooks Module Contract Surface
- Webhook Subscription Lifecycle (CRUD + Enable/Disable + Secret Rotation)
- Wishlist-to-Cart Product Flow
- Webhook Retry and Auto-Disable Policy

## Index Metadata
- Provider: `ollama`
- Model: `qwen3.8:27b`
- Index revision: `6bb3f940666dbcec8760408212b2747f01f4395ecfea5a347e849da6df3ddbb0`
- Indexed chunks: `16848`
- Memory entries: `0`

## Query
- Semantic query: `2brain query <repo-path> "your question" --top-k 5`
- Add durable memory: `2brain remember <repo-path> "fact/decision/runbook" --kind fact`

