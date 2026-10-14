---
source: src/kernel/registry.ts
sha256: 48c2bcbdf33ebffd7fff95179eb4802465196a9e7b63b6eaea8209b6c0a3ffaa
generated_at: 2026-10-14T08:24:29.524376+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines the typed interfaces a module uses to declare cross-cutting needs (image writeback, queue consumption, translation hooks, webhook projections, analytics forwarding, personal-data export) without requiring direct imports from infrastructure or other modules. It is the contract layer that lets `src/modules.ts` remain a statically-typed list and lets infrastructure resolve module capabilities by string key instead of by import.

## Key elements

- **`ImageTarget`** — A `writeback` callback the image-digest worker calls to persist `imageUrl`/`thumbnailUrl` on a module's collection. Guarded by a `pendingImageKey` check so stale/duplicate deliveries are no-ops.
- **`ModuleConsumer`** — A queue-consumption declaration (`queue`, `handler`, `schema`, `prefetch?`) that `app/workers.ts` collects and feeds to `consumeFromQueue`. `handler` returns `true` to ack, `false` to park, or throws to retry.
- **`TranslatableTarget`** — Declares a collection as translation-writable: `exists`, `fields`, `cacheTag`, `writeDerived`, `markEdited`, and optional `checkFields`. Supplied by the owning module so the `locales` module never resolves a Mongoose model by name.
- **`TranslationFieldIssue`** — A single `{ field, message }` pair returned by `checkFields` for a rejected value.
- **`PublicEventProjection`** / **`PublicEventTarget`** — Maps one domain event to a public webhook event (`eventType` + `data`) or `undefined`. `toPublicEvent` is typed `(payload: never) → …` so the registry stays payload-agnostic while the owning module retains full type safety.
- **`BrowserEventReport`** / **`BrowserEventTarget`** — Lets a module declare that the browser may report an event the server cannot observe (cache-hidden reads). `toReport(body: never)` produces the `{ event, properties }` pair forwarded to the analytics port.
- **`PersonalDataSubject`** — Identifies the data subject (`userId`, `email`) for data-subject export; `email` accommodates modules that match rows by address rather than account id.

## Relationships

- **`src/modules.ts`** — The explicit module list this registry turns into a running application; each module's manifest is validated against these interfaces.
- **`src/kernel/events.ts`** — Provides `markDomainEventsWired` (imported here) and shares the `never`-payload typing pattern used by `PublicEventTarget`.
- **`src/kernel/module-config.ts`** — Provides `assertModuleConfig`, used to validate a module's config slice at registration time.
- **`src/infrastructure/config/define.ts`** — Source of the `ConfigSlice` type that modules declare per-domain configuration with.
- **`src/infrastructure/observability/analytics/index.ts`** — Source of `AnalyticsEventInput`, from which `BrowserEventReport` is `Pick`-ed.
- **`src/app/workers.ts`** — The consumer of `ModuleConsumer` entries; it iterates collected consumers and calls `consumeFromQueue` for each.
- **`src/app.ts`** — The application assembly point that imports this registry's contracts when wiring modules together.

## Notes

- **Architectural wall:** Every interface in this file exists because of an ESLF-enforced import boundary (`eslint.config.ts` → `boundaries/dependencies`). Infrastructure (image worker, queue adapter, translation resolver, webhooks publisher, analytics) must not import `src/modules/*`. These indirection callbacks are the *only* sanctioned channel.
- **`never`-payload pattern:** `PublicEventTarget.toPublicEvent` and `BrowserEventTarget.toReport` accept `never` so a single registry slot can be called with any concrete payload type. A function typed for a specific payload is assignable to `(payload: never) => …`, giving the owning module full type safety at the call site.
- **Idempotency guard:** `ImageTarget.writeback` must check `pendingImageKey` before writing; a mismatched key means the document was superseded or deleted, and the callback must return `false` (no-op) rather than throwing.
- **`ModuleConsumer.handler` is a method, not a property:** Deliberate — each module's job payload is a distinct generated type, and only a method member preserves the per-module generic. A property function type would collapse all handlers to `unknown`.
- **Modules are typed values, not folder conventions.** Enabling a domain is a one-line edit to `src/modules.ts`; no filesystem discovery is involved.
