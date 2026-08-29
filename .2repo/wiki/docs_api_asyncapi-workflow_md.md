# docs/api/asyncapi-workflow.md

## Purpose

Documents the full lifecycle of the AsyncAPI event-driven contract in this repo: where section sources live, how they are merged into the two published bundles (`asyncapi.yaml` and `asyncapi.public.yaml`), how TypeScript types are generated from them, and which npm commands enforce consistency in CI.

## Key elements

- **`SHARED_SECTIONS`** (`scripts/contracts/asyncapi-bundles.ts`) — the single array (`['observability']`) that determines which sections land in the public bundle; everything else is backend-only.
- **Section source documents** — `src/modules/observability/asyncapi.yaml` (SSE), `shared/contracts/asyncapi.workers.yaml` (RabbitMQ queues), `shared/contracts/asyncapi.root.yaml` (version/id/info/tags). Each is a standalone valid AsyncAPI document.
- **`asyncapi.yaml` / `asyncapi.public.yaml`** — merged outputs at the repo root; the public one is a strict subset (SSE channels only). Never hand-edited.
- **`scripts/generate-asyncapi-types.ts`** — reads `asyncapi.yaml`, converts `components.schemas` to TypeScript interfaces via `@asyncapi/modelina`, appends `WORKER_CHANNELS` / `OBSERVABILITY_CHANNELS` constants, writes `src/types/asyncapi.generated.ts`.
- **`@asyncapi/cli`** — used for `lint:asyncapi` and `docs:asyncapi` (Studio).
- **`SHARED_FILES`** (`scripts/spec-identity.ts`) — lists `asyncapi.public.yaml` and the generator script as cross-repo identity-locked files; the generated output is deliberately *not* included.
- **RabbitMQ channels** — `worker.email.send` and `worker.pdf.generate`; queue-name constants (`EMAIL_QUEUE`, `PDF_QUEUE`) are aliases of `WORKER_CHANNELS.*`, so the contract string and the runtime string are the same value.

## Relationships

- **`asyncapi.yaml`** — this page is the operational guide for that file: how it is assembled from section sources, why it is not hand-edited, and which commands validate and regenerate from it.
- **`docs/api/contract-fragmentation.md`** — cross-referenced for the broader ownership/fragmentation model and the rationale behind the bundle-verb choices.
- **`package.json`** — defines every npm script this page references (`lint:asyncapi`, `gen:asyncapi`, `check:asyncapi-types`, `contracts:bundle`, `check:contracts-bundle`, `docs:asyncapi`, `check:spec-identity`, `complete`).
- **`docs/index.md`** — parent index; this page is linked as the AsyncAPI workflow reference under the API documentation section.

## Notes

- The merge is a **map copy**, not `asyncapi bundle` (which dereferences `$ref`s and inflates the file ~3×, breaking the type generator's `$ref`-following logic). The merge script refuses on key collision.
- `asyncapi.public.yaml` is in `SHARED_FILES`; `asyncapi.yaml` is marked `shared: false`. Editing the public bundle without the frontend copy will fail `check:spec-identity`.
- The generated `.ts` output is intentionally **not** shared-file-checked across repos because the two outputs legitimately differ (frontend lacks worker types). Local freshness is enforced by `check:asyncapi-types` instead.
- No Redis channel exists here: Redis is used as a shared cache, not a message bus. A former `cache.tags.invalidated` channel was removed; see `../tools/redis-cache.md` for the re-introduction condition.
- Channel names are runtime identifiers (SSE event names, AMQP queue names). In-process-only events are not channels and should not appear in the spec.
