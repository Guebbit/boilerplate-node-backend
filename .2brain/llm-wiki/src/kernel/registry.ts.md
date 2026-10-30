---
source: src/kernel/registry.ts
sha256: 1aa4fef657eba5b8a5672a945c9c9d6381b683cc71dc505ecca95b018703bd34
generated_at: 2026-10-29T02:20:55.294135+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines the set of typed interfaces that modules use to declare their cross-cutting needs (image writeback, queue consumption, translation targets, public events, browser analytics, data-subject requests) to the application without importing infrastructure directly. It is the inversion-of-control contract that lets infrastructure adapters (image worker, queue consumer, translation resolver, webhook publisher, analytics) resolve module behavior generically by string key, preserving the "app tier sees every module, infrastructure sees none" boundary enforced by ESLint.

## Key elements

- **`ImageTarget`** — Callback contract (`writeback`) a module registers so the image-digest worker can persist `imageUrl`/`thumbnailUrl` on the owning collection after a successful digest. The `key` guard makes stale/duplicate deliveries no-ops.
- **`ModuleConsumer`** — Declaration of a queue name, a Zod `schema`, a `handler` (method, not property, to preserve per-module payload types), and optional `prefetch`. Collected by `app/workers.ts`, which is the sole caller of `consumeFromQueue`.
- **`TranslatableTarget`** — Module-supplied contract for an entity collection that carries translatable fields: `exists`, `fields`, `cacheTag`, `writeDerived`, `markEdited`, and optional `checkFields`. Lets `kernel/translation.ts` operate without importing the owning module's Mongoose model.
- **`TranslationFieldIssue`** — Single `{ field, message }` pair returned by `TranslatableTarget.checkFields`.
- **`PublicEventProjection`** — `{ eventType, data }` shape a webhook subscriber receives under the envelope's `data` key.
- **`PublicEventTarget`** — `toPublicEvent(payload: never)` mapping a domain event to a `PublicEventProjection | undefined`; the `never` trick keeps one registry slot per event while the owning module gets full type safety.
- **`BrowserEventReport`** — Type alias: `Pick<AnalyticsEventInput, 'event' | 'properties'>`.
- **`BrowserEventTarget`** — `toReport(body: never) → BrowserEventReport`, letting the analytics service forward browser-reported events without importing the owning module.
- **`PersonalDataS…`** (truncated) — Contract for data-subject export/erasure, matching rows by `id` or `email`.

## Relationships

- **`src/modules.ts`** — The explicit module list that this registry "turns into a running application"; each module's manifest keys entries under the interfaces defined here.
- **`src/kernel/events.ts`** — Provides `markDomainEventsWired` (imported here) and the `never`-typed handler-map pattern that `PublicEventTarget` mirrors.
- **`src/kernel/module-config.ts`** — Provides `assertModuleConfig`, the runtime check that a manifest's shape is valid.
- **`src/app/workers.ts`** — The sole consumer of `ModuleConsumer` entries; calls `consumeFromQueue` for each registered consumer.
- **`src/infrastructure/observability/analytics/index.ts`** — Supplies `AnalyticsEventInput` (from which `BrowserEventReport` is derived); the analytics service resolves `BrowserEventTarget` entries generically.
- **`src/infrastructure/security/reencrypt.ts`** — Supplies `ReencryptReport`, imported for the data-subject/erasure contract.
- **`src/infrastructure/config/define.ts`** — Supplies `ConfigSlice`, used in module-config assertions.

## Notes

- **`never` as a universal input type** is used deliberately in `PublicEventTarget.toPublicEvent` and `BrowserEventTarget.toReport`. A concrete-payload function is assignable to a `(payload: never) => …` slot, so the owning module retains full type safety at the call site while the registry stays homogeneous. Do not "fix" this to `unknown` — it would lose the assignability direction.
- **`ModuleConsumer.handler` is a method, not a property**, so each module's distinct generated payload type is preserved. A property-function type would collapse all handlers to `unknown`.
- **Guarded writeback** (`ImageTarget.writeback`) checks the `pendingImageKey` before writing; a `false` return means the document was deleted or superseded, not an error.
- **`TranslatableTarget.markEdited`** exists because a translation edit mutates rows *outside* the entity document; without it the ETag would not advance and optimistic-concurrency protection would silently fail.
