---
source: src/modules/returns/index.ts
sha256: bb0f34065cac21e90f1a9726c7f974405dd381671004903602c5c8fa4a45af5c
generated_at: 2026-10-15T11:53:46.222987+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/index.ts

## Purpose

Public barrel for the **returns** module. It is the *only* import surface exposed to sibling modules (per the strategic-DDD boundary rule in `docs/theory/strategic-ddd.md` §5). It re-exports the service API, domain types, events, email helpers, and model *types*—keeping the `returnRepository` and the model's runtime internals encapsulated behind the service layer.

## Key elements

- **`export * from './services'`** — Re-exports the service functions (open / decide / receive). This is the primary "door" through which all return operations must flow.
- **`export * from './domain'`** — Re-exports domain types and value objects (e.g. return status, reason enums) for callers to use in signatures.
- **`export * from './events'`** — Re-exports the domain/webhook event definitions emitted during the return lifecycle.
- **`export * from './emails'`** — Re-exports email-template helpers or send functions used when notifying parties about a return.
- **`export type * from './model'`** — Re-exports *type-only* declarations from the model (entities, repository interface). No runtime values leak; the concrete `returnRepository` instance stays internal.

## Relationships

- **`./services/index.ts`, `./domain/index.ts`, `./events.ts`, `./emails.ts`, `./model.ts`** — Direct re-export sources; this file is a thin aggregator over them.
- **`scripts/ops/reap-returns.ts`** — Imports the service API through this barrel to drive operational reaping of stale returns.
- **`src/modules/stats/services/breakdowns.ts` / `sales.ts`** — Sibling-module consumers; import return types/events from this barrel for reporting (allowed boundary crossing).
- **`tests/integration/return-refund-retry.test.ts`** — Exercises the service surface exported here to verify exactly-once semantics across open → decide → receive.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — Imports event definitions via this barrel to assert webhook payloads.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Imports email helpers via this barrel to unit-test rendered templates.

## Notes

- The `model` export is `export type *`, deliberately stripping all runtime values. Importing a *value* (e.g. a repository instance or entity constructor) from `./model` at the call-site will fail—by design.
- The barrel is intentionally minimal: no selective named re-exports, no conditional logic. Adding a new sub-module requires an explicit `export` line here before it becomes visible to siblings.
- The doc comment ties the "exactly-once" guarantee to the service layer; if you find yourself reaching for `returnRepository` directly from outside `./services`, that's the boundary being violated.
