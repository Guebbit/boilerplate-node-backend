---
source: src/modules/example/events.ts
sha256: 7f41a41b134b077aaf9b7d55d6f16b10a6cf9da0efef9602ce9b81657aad4a21
generated_at: 2026-11-08T05:50:11.932563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/events.ts

## Purpose

Declares the domain events this module emits by augmenting the kernel's shared `DomainEventMap` interface, and exports the event name as a string constant. This keeps event payload types registered app-wide (rather than in a central list) so any consumer gets typed access to `example.published`.

## Key elements

- **`declare module '@kernel/events'`** — Augments the kernel's `DomainEventMap` interface with the key `'example.published'` and its payload shape `{ exampleId, userId, title }`.
- **`EXAMPLE_PUBLISHED`** (exported const) — The literal string `'example.published'`. Use this instead of re-typing the string when emitting or listening.

## Relationships

- **`src/modules/example/module.ts`** — Lists this event in its `publicEvents` array, which promotes `example.published` to a public webhook for external consumers.
- **`src/modules/example/index.ts`** — Barrel file; re-exports `EXAMPLE_PUBLISHED` so other modules can `import { EXAMPLE_PUBLISHED } from '…/example'`.
- **`src/modules/example/services/transition.ts`** — The service that triggers the `example.published` event (the emitting side of the payload declared here).
- **Tests** (`capabilities.test.ts`, `service.test.ts`, `manifest.test.ts`) — Assert on the event name and/or its payload shape.

## Notes

- The event is intentionally **not** declared in a central registry; each module augments `@kernel/events` independently (see `modules/orders/events.ts` for the same pattern).
- If the module never announces state changes to the rest of the app, this file can be deleted entirely.
- Payload typing lives *only* in the `DomainEventMap` augmentation; the `EXAMPLE_PUBLISHED` const is just the string key—do not duplicate the payload type elsewhere.
