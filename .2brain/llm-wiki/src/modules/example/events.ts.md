---
source: src/modules/example/events.ts
sha256: 7f41a41b134b077aaf9b7d55d6f16b10a6cf9da0efef9602ce9b81657aad4a21
generated_at: 2026-10-29T03:52:58.128332+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/events.ts

## Purpose

Declares the domain events this module emits by augmenting the kernel's global `DomainEventMap` interface (module augmentation pattern, per `modules/orders/events.ts`). Currently defines a single event, `example.published`, which fires when an example transitions to the published state (initially or after un-archiving) and is surfaced as a public webhook via `module.ts`.

## Key elements

- **`declare module '@kernel/events'`** — Augments the kernel's `DomainEventMap` interface to register the `'example.published'` key and its payload shape: `{ exampleId: string; userId: string; title: string }`.
- **`EXAMPLE_PUBLISHED`** (exported constant) — String value `'example.published'`, a convenience reference to the event name for emit/listen sites.

## Relationships

- **`src/modules/example/module.ts`** — The comment states this event is exposed as a public webhook through `module.ts`'s `publicEvents` list.
- **`src/modules/example/index.ts`** — Module barrel; expected to re-export `EXAMPLE_PUBLISHED` for external consumers.
- **`src/modules/example/services/transition.ts`** — The service that performs the published-state transition is the likely emit site for `example.published`.
- **Tests** (`integration/capabilities.test.ts`, `integration/service.test.ts`, `unit/manifest.test.ts`) — Verify event emission, payload shape, and webhook exposure.

## Notes

- This file contains **no runtime logic** — only a type augmentation and a string constant. Deleting it (or a specific entry) removes the event from the type map and any webhook registration that references it.
- Follow the augmentation pattern (per-module `declare module`) rather than a central event list; see `modules/orders/events.ts` for the rationale.
- The `@module` doc-comment includes a "Delete it if" guideline: remove the file entirely if the module emits no events.
