---
source: src/kernel/registry.ts
sha256: 52950735cb16ceb7c09912e0ba6561c601bad39c364e04a5d3b211f6cc99f847
generated_at: 2026-10-15T09:52:08.482961+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines the typed contract interfaces that modules use to register capabilities with the application without the application (or its infrastructure adapters) importing module code directly. This file exists to enforce the "app tier sees every module, infrastructure sees none" boundary: infrastructure adapters and cross-domain services resolve module-supplied behavior through these registration interfaces rather than through direct imports, preserving the module-group dependency walls enforced by ESLint.

## Key elements

- **`ImageTarget`** — A single writeback callback a module registers so the image-digest worker can persist `imageUrl`/`thumbnailUrl` back onto the module's collection. The guard clause (matching `pendingImageKey`) makes stale or duplicate job deliveries a no-op.
- **`ModuleConsumer`** — A queue-consumer declaration (`queue`, `handler`, `schema`, optional `prefetch`). `handler` is intentionally a *method* (not a property) so each module's generated payload type is preserved per-entry rather than collapsing to `unknown`. `app/workers.ts` collects and invokes these; the module itself never calls `consumeFromQueue`.
- **`TranslatableTarget`** — A bundle of callbacks (`exists`, `fields`, `cacheTag`, `writeDerived`, `markEdited`, optional `checkFields`) a module registers so the `locales`/translation resolver can validate writes, update derived columns, and bump the entity's `ETag` without importing the owning module.
- **`TranslationFieldIssue`** — A single `{ field, message }` record returned by `TranslatableTarget.checkFields`.
- **`PublicEventProjection`** — The public (webhook-visible) name + payload a domain event maps to.
- **`PublicEventTarget`** — A module's `toPublicEvent: (payload: never) => PublicEventProjection | undefined` declaration, letting `webhooks` subscribe generically. The `never` parameter gives the owning module full type safety at the call site while keeping the registry entry payload-agnostic.
- **`BrowserEventReport`** — `Pick<AnalyticsEventInput, 'event' | 'properties'>`, the shape `analytics` forwards to its provider.
- **`BrowserEventTarget`** — A module's `toReport: (body: never) => BrowserEventReport` declaration, resolved by `analytics` via `resolveBrowserEvents` (same `never`-parameter pattern as `PublicEventTarget`).
- **`PersonalDataSubject`** — Identifies the data subject for export requests (truncated in source; at minimum carries `userId`).

## Relationships

- **`src/kernel/events.ts`** — Exports `markDomainEventsWired`, which `registry.ts` imports. The `never`-payload typing in `PublicEventTarget.toPublicEvent` mirrors the handler-map trick in `events.ts`.
- **`src/kernel/module-config.ts`** — Exports `assertModuleConfig`, imported by `registry.ts` for runtime validation of module manifests.
- **`src/infrastructure/config/define.ts`** — Exports the `ConfigSlice` type that `registry.ts` imports for per-module config declarations.
- **`src/infrastructure/observability/analytics/index.ts`** — Exports `AnalyticsEventInput`, from which `BrowserEventReport` is derived.
- **`src/infrastructure/security/reencrypt.ts`** — Exports `ReencryptReport`, imported by `registry.ts`.
- **`src/app/workers.ts`** — Consumes the `ModuleConsumer` entries registered in module manifests; it is the sole caller of `consumeFromQueue` for them.
- **`src/app.ts`** / **`src/app/config.ts`** — The running application that materialises the module list this registry types; config slices declared here flow into per-module config.
- **`scripts/ops/*`** (reap, sweep) — Operate against collections and outboxes whose writeback/consumer contracts are defined here; they depend on the same module-boundary rules that make these registration interfaces necessary.

## Notes

- The `never`-parameter pattern (`toPublicEvent`, `toReport`, `handler`) is deliberate: a function typed to accept one concrete payload is assignable to a `(payload: never) => …` slot, giving the owning module full type safety while the registry stays payload-agnostic. Do not "fix" these to `unknown` — that erases per-module types.
- `ModuleConsumer.handler` is a **method** signature, not a property. Changing it to a property arrow type (`handler: (message: unknown) => …`) would collapse all entries to `unknown` and defeat the per-module typing.
- `ImageTarget.writeback` uses a **guard-then-write** pattern: it only updates if `pendingImageKey` still matches. This is the mechanism that makes at-least-once job delivery idempotent.
- `TranslatableTarget.markEdited` is required (not optional) and must accept an optional `ClientSession` so the caller can join the tag-bump to the same transaction as the translation row writes and `writeDerived`.
- `PublicEventTarget` and `BrowserEventTarget` are keyed on the manifest by domain-event name / browser-event name respectively; the resolution helpers (`resolvePublicEvents`, `resolveBrowserEvents`) live in this file and are what cross-domain callers (webhooks, analytics) actually invoke.
