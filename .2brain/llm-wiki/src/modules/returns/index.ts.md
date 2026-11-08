---
source: src/modules/returns/index.ts
sha256: bb0f34065cac21e90f1a9726c7f974405dd381671004903602c5c8fa4a45af5c
generated_at: 2026-11-08T07:59:36.979825+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/index.ts

## Purpose

Public barrel (re-export) for the returns module. It is the **only** import surface a sibling module is allowed to use, enforcing the DDD module-boundary rule described in `docs/theory/strategic-ddd.md` §5. Internal plumbing (`returnRepository`, the model's runtime) is deliberately excluded; consumers interact with returns exclusively through the service layer exposed here.

## Key elements

- `export * from './services'` — Re-exports the returns service API (the "door" through which a return is opened, decided, or received).
- `export * from './domain'` — Re-exports domain types/constructors (value objects, entities, domain services).
- `export * from './events'` — Re-exports domain event definitions (e.g. `ReturnOpened`, `ReturnDecided`, `ReturnReceived`).
- `export * from './emails'` — Re-exports email/template helpers associated with returns.
- `export type * from './model'` — Re-exports **type-only** members from the model (no runtime values leak to consumers).

## Relationships

- **Upstream (re-exports):** `domain/index.ts`, `emails.ts`, `events.ts`, `model.ts`, `services/index.ts` — all five are the source submodules whose members surface here.
- **Downstream (consumers):** Sibling modules that import from this barrel include `shop-tasks/module.ts`, `shop-tasks/services/digest.ts`, `shop-tasks/services/work-summary.ts`, `stats/services/breakdowns.ts`, and `stats/services/sales.ts`.
- **Test consumers:** `tests/cross-cutting/webhook-event-producers.test.ts` (event shapes), `tests/unit/infrastructure/adapters/mailer-templates.test.ts` (email templates), and `shop-tasks/tests/integration/staff-notices.test.ts` (integration flow) all import through this barrel.

## Notes

- The model is exported with `export type *`, meaning no runtime value from `model.ts` is reachable by consumers — only its types. This keeps the repository and entity constructors internal to the module.
- Do not add direct imports of `./model`, `./domain`, etc. from sibling modules; the barrel is the enforced single entry point.
- Canonical module documentation lives at `docs/modules/returns.md`.
