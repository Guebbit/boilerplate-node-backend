---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: docs/
files: 34
updated: 2026-08-28T11:56:31.869703+00:00
---

# docs/

## Purpose

The `docs/` module is the project's VitePress-based documentation site. It covers the full documentation surface: API contract workflows, architectural theory and DDD rationale, a file-by-file glossary, and developer onboarding. All navigation, Mermaid diagrams, and cross-references are configured here.

## Key parts

- **Site infrastructure** — `.vitepress/config.mts` (navigation, sidebar, Mermaid plugin) and `.vitepress/theme/index.ts` (click-to-zoom overlay for Mermaid SVGs).
- **Entry points** — `index.md` (site landing, section map) and `getting-started.md` (clone → running API in ~5 min).
- **`api/`** — Contract ecosystem docs: OpenAPI and AsyncAPI workflows, endpoint design rationale, observability routes, contract fragmentation/ownership, and a regeneration cheat-sheet. `index.md` inside this directory is the routing hub for API questions.
- **`reference/`** — File glossary. Each sub-page (`root.md`, `src-app.md`, `src-infrastructure.md`, `src-modules.md`, `scripts.md`, `ops.md`, `data.md`, `contracts.md`, `tests.md`) catalogs a directory's files and defers depth to theory or tool pages. `index.md` is the "I see a filename, what is it?" lookup.
- **`theory/`** — Architectural reasoning: four-tier module model, layer/tier rules, request flow, clustering, DDD (strategic + tactical), domain-layer rules, module lifecycle, glossary, and a prescribed reading path. `index.md` defines load-bearing terms and provides the topic-to-file table.

## How it connects

- **`/` (repository root)** — Reference pages (`root.md`, `scripts.md`, `ops.md`) catalogue and explain the root-level files, compose stacks, and npm scripts that live there. The API workflow pages describe the bundle → lint → codegen pipeline that operates on root-level `openapi.yaml` and `asyncapi.yaml`.
- **`docs/modules/`** — The reference page `src-modules.md` acts as the index into per-module documentation pages that live in `docs/modules/`. Theory pages (e.g. `modules.md`, `module-lifecycle.md`) describe the module shape that those per-module pages document in detail.
- **`docs/tools/`** — Reference pages (`src-infrastructure.md`, `scripts.md`, `ops.md`) explicitly defer to `docs/tools/` for workflow and tooling depth. The API workflow pages (`openapi-workflow.md`, `asyncapi-workflow.md`) reference the tooling commands documented there.

## Where to start

1. **`docs/index.md`** — the site's landing page; it orients you to the five top-level sections and links to the fastest path for whatever you need.
2. **`docs/theory/reading-path.md`** — a nine-file, first-hour reading order with "take away" summaries and the five architectural invariants the codebase assumes. It eliminates the guesswork of where to open first.

## Connected modules
```mermaid
flowchart LR
    m_docs["docs/"]
    m_root["/ (repository root)<br/>39 files"]
    m_docs_modules["docs/modules/<br/>18 files"]
    m_docs_tools["docs/tools/<br/>38 files"]
    m_docs --- m_root
    m_docs --- m_docs_modules
    m_docs --- m_docs_tools
    style m_docs stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_docs_modules|docs/modules/]] · [[boilerplate-node-backend_docs_tools|docs/tools/]]

## Files
- `docs/.vitepress/config.mts` — VitePress site configuration that defines the documentation site's identity, navigation, sidebar structure, and plugin stack. It wraps the standard `defineConfig` call in the `withMermaid` plugin so Mermaid diagrams render natively in the docs.
- `docs/.vitepress/theme/index.ts` — VitePress custom theme entry point that extends the default theme and adds a click-to-zoom interaction for Mermaid diagrams rendered in the docs. It injects a full-screen overlay (cloning the SVG) when a user clicks a diagram, with backdrop-click or Escape-key dismissal.
- `docs/api/asyncapi-workflow.md` — Documents the full lifecycle of the AsyncAPI event-driven contract in this repo: where section sources live, how they are merged into the two published bundles (`asyncapi.yaml` and `asyncapi.public.yaml`), how TypeScript types are generated from them, and which npm commands enforce consistency in CI.
- `docs/api/contract-fragmentation.md` — Documents **who owns** the shared API/event contracts, **where** the per-module fragments live, and **how** the eight bundles (OpenAPI, AsyncAPI, AsyncAPI-public, analytics-events, Bruno, Insomnia, Mockoon, Postman) are assembled and delivered to the frontend repo. It is the ownership-and-flow counterpart to the "how to change" workflow page.
- `docs/api/endpoints.md` — Design-rationale companion to the API route table. `openapi.yaml` says *what* each route accepts and returns; `src/modules/<name>/routes.ts` says *how* the middleware chain enforces it; this page says *why* the surface is shaped the way it is, domain by domain. It exists to prevent future changes from contradicting decisions that are otherwise invisible in code or contract.
- `docs/api/index.md` — Landing page for the API documentation section. It gives a one-glance overview of the API contract ecosystem (OpenAPI spec → tooling → implementation → tests), states the core conventions for REST style, and routes readers to the correct sub-page based on their task. It exists so neither humans nor AI need to guess which doc covers a given API question.
- `docs/api/observability.md` — API reference for the five `/observability/*` routes that expose operational data (health, KPIs, audit, SSE metrics, Prometheus text) for internal dashboards and monitoring scrapers. All routes are non-public and use one of three bespoke auth mechanisms rather than the standard admin JWT.
- `docs/api/openapi-workflow.md` — Documents the OpenAPI contract workflow for this boilerplate: the rule that per-module YAML fragments (not the bundled `openapi.yaml`) are the single source of truth, and the exact sequence of bundle → lint → mock → codegen → implement → test steps that keeps backend, generated types, and frontend consumers in sync.
- `docs/api/regenerating.md` — A quick-reference cheat sheet that maps "what I just edited" → "what command to run next" for the contract-generation pipeline. It exists because the pipeline has a non-obvious multi-step ordering (bundle → generate → seed → collections → sync) and the correct sequence depends on *which* file changed. Developers keep this page open mid-session rather than re-deriving the dependency chain.
- `docs/getting-started.md` — Onboarding guide that takes a developer from a fresh clone to a browsable, seeded API in roughly five minutes. It documents the primary (container-first) setup path, a secondary host-mode path, verification steps, and a map to deeper documentation.
- `docs/index.md` — Landing page for the Docusaurus-based documentation site. It orients a reader (human or AI) to the boilerplate's stack, the five top-level doc sections, and the fastest paths to the info they need. All navigation, feature bullets, and diagrams live here; deeper content lives in the linked sub-pages.
- `docs/reference/contracts.md` — Single reference page for the contract pipeline: how `openapi.yaml` and `asyncapi.yaml` are bundled from a root preamble plus per-module fragments, what downstream artifacts are generated (Zod schemas, TS types, client collections), and which Spectral ruleset applies at each stage. Read this instead of tracing the bundling and codegen commands yourself.
- `docs/reference/data.md` — Reference page documenting the `db/` directory: the split between **schema ownership** (migrations via `migrate-mongo`) and **data ownership** (seeding via per-module fixtures), plus the supporting tools for cache clearing and one-shot scripts. It exists so a reader can orient in the database layer without opening each file.
- `docs/reference/index.md` — Entry point for the **File Glossary** section. When a reader encounters an unfamiliar filename, this page answers "what is it, what breaks without it, and where is the concept explained" in a single hop. It is a navigation map over the repository, not an explanatory document—every entry defers to the theory, tools, or API pages for depth.
- `docs/reference/ops.md` — A reference index for every non-application-code asset in the repository: the Docker compose stacks, Dockerfiles, the full observability config chain, CI/CD workflows, rendered EJS templates, and static public assets. It exists so a reader (human or AI) can locate and understand an operational file by name without searching the tree.
- `docs/reference/root.md` — A reference catalogue of every file that lives directly in the repository root. It exists to answer "why is this file here and what does it do?" in one glance, with a pointer to deeper documentation for each entry. It groups root files by concern (entry points, package/TS, lint, test runners, codegen, Git) so a reader does not have to open `package.json`, `eslint.config.ts`, or `migrate-mongo-config.js` individually to understand their roles.
- `docs/reference/scripts.md` — Reference catalog of every file in `scripts/` (the repo's own `npm run` tooling), `eslint/rules/`, and `.husky/`. It explains what each file does, how they are named, and which page to read next for workflow details. None of these scripts ship in the image.
- `docs/reference/src-app.md` — A single-page reference that maps the top of `src/`, the `src/app/` assembly directory, the `src/kernel/` module system, and `src/types/`. It exists so a reader can orient themselves in the four-tier architecture (`infrastructure → kernel → modules → app`) without opening each file individually. It pairs with the deeper theory docs under `docs/theory/` and tool docs under `docs/tools/`.
- `docs/reference/src-infrastructure.md` — Reference catalog for the `src/infrastructure/` directory — the domain-agnostic substrate tier. It lists every file across the five subdirectories (`runtime/`, `adapters/`, `http/`, `persistence/`, `observability/`), gives a one-line description of each, and links to deeper tool docs. Read it to find which file owns a given concern before opening the file itself.
- `docs/reference/src-modules.md` — Catalogs the **file shapes** (recurring file patterns) shared across all thirteen modules under `src/modules/`, explaining each shape once so readers don't need to re-learn the structure per domain. Serves as the index into the per-module pages and the enforcement test that keeps new shapes visible.
- `docs/reference/tests.md` — Reference index for the entire test suite. It exists so a developer or AI assistant can look up *which* test covers a given rule without grepping the codebase. The page is organized as a table (one row per test file) where the column of interest is "what it guarantees."
- `docs/theory/architecture.md` — Describes the five major architectural blocks (Contract, Entry, Business core, Persistence, Cross-cutting tools) and the boundaries between them. Exists to answer *"which blocks talk to each other?"* — a conceptual question distinct from the folder-mapping question handled by `layers.md`.
- `docs/theory/clustering.md` — Explains the primary/worker clustering model and the graceful-shutdown sequence so a reader (human or AI) understands *why* the app forks one process per CPU core, how crash backoff works, and the exact order in which a worker tears down its resources on `SIGTERM`.
- `docs/theory/domain-layer.md` — Defines the placement rule for the `domain/` folder, the lint-enforced dependency boundary that protects it, the verdict pattern its functions follow, and the "floor" test that decides whether a rule actually earns a place there. Also clarifies the relationship between this folder and DDD as a broader discipline.
- `docs/theory/glossary.md` — Defines the ubiquitous language of every bounded context (module) in the codebase, with each term scoped to the module that owns it. It exists to make explicit the meaning and constraints behind domain terms that identifiers alone cannot carry, and to enforce the DDD principle that the same word may legitimately mean different things in different contexts.
- `docs/theory/index.md` — Landing page for the **Theory** documentation section. It defines the two load-bearing terms used across every theory page (*domain* and *barrel*), lists the architectural strategies the boilerplate follows, and provides a topic-to-file navigation table so readers can jump directly to the page they need without reading every theory document sequentially.
- `docs/theory/layers.md` — The folder map for the codebase. It defines the two orthogonal axes that determine where code lives and what it may import — **tiers** (app → modules → kernel → infrastructure) and **layers** within a module (routes → controllers → service → repository → model) — and documents the enforcement mechanisms behind those rules.
- `docs/theory/module-lifecycle.md` — A step-by-step procedural guide for adding and removing a module. While `modules.md` explains *why* the module shape looks the way it does, this page is the operational checklist: which registries to touch, what files to create, in what order, and which commands to run. It exists so that the "one folder + one registry line" claim stays enforceable rather than aspirational.
- `docs/theory/modules.md` — Explains the four-tier module architecture (app → modules → kernel → infrastructure) and the dependency rules that make adding or removing a domain a one-folder-plus-one-line operation. It exists so a reader never has to guess which tier a file belongs to.
- `docs/theory/reading-path.md` — A prescribed first-hour reading order for new contributors. It names nine files in sequence, gives a one-paragraph "take away" for each, tells the reader what to skip until they have a mental model, and states five architectural invariants the rest of the codebase assumes. It exists so that nobody has to guess where to start in ~21 k lines across 13 modules.
- `docs/theory/request-flow.md` — Documents the end-to-end path a single HTTP request takes through the middleware chain, the four-layer module internals (controller → service → repository → model), and the shared substrates (Redis, RabbitMQ, MongoDB). Also covers the three parallel observability signal streams and the cross-cutting conventions (audit emission, validation placement, error interpretation) that every module follows.
- `docs/theory/request-input.md` — Single written statement of which input sources (route params, query string, body) each endpoint reads, in what precedence order, and how values are treated on the way in. It exists so that controllers name a **surface** rather than re-deriving the polymorphism rules per call site, and so the closed set of source combinations stays reviewable against the spec.
- `docs/theory/strategic-ddd.md` — Documents the four strategic DDD patterns adopted in this codebase — bounded contexts, typed context maps, ubiquitous language, and subdomain classification — and how each is declared on the module manifest and enforced by cross-cutting tests. It exists so that architectural claims ("orders owns the order lifecycle", "authentication is generic") remain verifiable in code rather than drifting silently in prose.
- `docs/theory/tactical-ddd.md` — Documents the two tactical DDD patterns this repo deliberately adopts (a lifecycle transition table and server-computed capability actions) and explicitly prices the patterns it does **not** adopt (aggregates, domain repositories, mappers, read models). Exists to justify the selective scope, prevent un-warranted expansion, and record the rationale for each structural choice so a reader can evaluate whether adding a third pattern clears the adoption bar.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
