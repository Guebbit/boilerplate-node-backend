---
source: src/modules/example/events.ts
sha256: d4b34fe59a3c1e1d376ae487f90a173f55674d10c12cf40ad46e23ec008d34b1
generated_at: 2026-10-15T10:30:30.044018+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/events.ts

## Purpose

Declares the domain events emitted by the `example` module. It augments the kernel's app-wide `DomainEventMap` with this module's event payloads (a pattern chosen over a central event list, per the convention in `modules/orders/events.ts`). Each event declared here is also exposed as a public webhook via `module.ts`.

## Key elements

- **`declare module '@kernel/events'`** — TypeScript module augmentation that adds `'example.published'` to `DomainEventMap` with payload `{ exampleId: string; userId: string; title: string }`. Fires when an example first moves to `published` or is restored from `archived`.
- **`EXAMPLE_PUBLISHED`** (exported const) — String literal `'example.published'`; the canonical key for referencing the event in emitting code.

## Relationships

- **`src/modules/example/module.ts`** — Reads the events declared here and registers them as public webhooks via its `publicEvents` export.
- **`src/modules/example/index.ts`** — Module barrel; re-exports or aggregates the public surface this file contributes.
- **`src/modules/example/tests/unit/manifest.test.ts`**, **`tests/integration/service.test.ts`**, **`tests/integration/capabilities.test.ts`** — Test suites in the dependency graph that exercise the event declaration and its emission.

## Notes

- The event is added by *augmenting* the kernel's `DomainEventMap` interface rather than importing it from a central registry. When adding new events to this module, follow the same `declare module` pattern.
- The payload type is defined once, in the augmentation block. The `EXAMPLE_PUBLISHED` constant is just the string key for convenience in dispatch code.
- See `docs/tools/events-and-logging.md#the-domain-event-bus-and-what-it-is-not` for scope and limitations of the event bus.
