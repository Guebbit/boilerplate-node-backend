---
source: src/kernel/registry.ts
sha256: 5995937461bb314315f96b43b6342f51fe4f7c67e5795e58926a757c928c70e4
generated_at: 2026-11-08T03:55:09.517316+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines the typed interface contracts that modules register to declare what the application must do *for* them — image writeback, queue consumption, translation targets, public-event projection, browser-event reporting, and personal-data handling. It exists to enforce the boundary rule that infrastructure adapters and cross-domain services (image worker, queue, translation, webhooks, analytics) **cannot** import from `src/modules/*`; instead, modules supply implementations through these registry interfaces and infrastructure resolves them generically at runtime.

## Key elements

- **`ImageTarget`** — A module's writeback callback for the image digest pipeline. `infrastructure/adapters/image.worker.ts` resolves it by the `collection` string in the job payload and calls `writeback(documentId, key, urls)`. The `key` guard makes stale/duplicate deliveries a no-op.
- **`ModuleConsumer`** — Declares a queue name, a `handler` method (typed per-module via method syntax to preserve the concrete payload type), a `ZodType` schema, and an optional `prefetch`. `src/app/workers.ts` collects these and calls `consumeFromQueue` for each; the module itself never invokes the broker at import time.
- **`TranslatableTarget`** — Lets `kernel/translation.ts` validate, write derived columns, stamp `ETag`, and clear caches on a module's collection without importing the owning module. Exposes `exists`, `fields`, `cacheTag`, `writeDerived`, `markEdited`, and an optional `checkFields` validator.
- **`TranslationFieldIssue`** — A single `{ field, message }` pair returned by `TranslatableTarget.checkFields`.
- **`PublicEventProjection`** — The `{ eventType, data }` shape a webhook subscriber receives.
- **`PublicEventTarget`** — A module's `toPublicEvent(payload: never)` callback that projects a domain event into a public webhook event (or `undefined` to suppress). `webhooks/services/publish.ts` resolves these via `resolvePublicEvents` instead of importing each event name.
- **`BrowserEventReport`** — `Pick<AnalyticsEventInput, 'event' | 'properties'>`, the payload `analytics` forwards to its provider.
- **`BrowserEventTarget`** — A module's `toReport(body: never)` callback that assembles the analytics report from a browser-reported event body. Resolved through `resolveBrowserEvents`.
- **`PersonalDataSub…`** *(truncated in source)* — Describes the subject of a data-subject export/erasure; includes an `email` match path for modules (e.g. `tasks`) that key rows by address.
- **`assertModuleConfig`** (imported from `@kernel/module-config`) — runtime assertion used to validate a module's config slice at registration time.
- **`markDomainEventsWired`** (imported from `@kernel/events`) — called to flag that a module's domain events have been subscribed.

## Relationships

- **`src/kernel/events.ts`** — Imports `markDomainEventsWired`; the `never`-typed callback pattern used in `PublicEventTarget` and `BrowserEventTarget` mirrors the handler map in this file.
- **`src/app/workers.ts`** — Consumes the `ModuleConsumer` declarations collected from modules and is the sole caller of `consumeFromQueue`.
- **`src/app/jobs.ts`** — Part of the job/worker wiring that interacts with `ModuleConsumer` and `ImageTarget` resolution.
- **`src/app/config.ts` / `src/app.ts`** — The application bootstrap that iterates the module list and invokes the registry assertions.
- **`src/infrastructure/config/define.ts`** — Supplies the `ConfigSlice` type used in module config validation.
- **`src/infrastructure/observability/analytics/index.ts`** — Supplies `AnalyticsEventInput`; resolves `BrowserEventTarget` entries to forward to the analytics provider.
- **`src/infrastructure/security/reencrypt.ts`** — Supplies the `ReencryptReport` type referenced by the registry.
- **`scripts/docs/generate-jobs.ts`, `generate-rate-limit-budgets.ts`, `jobs-render.ts`** — Doc-generation scripts that read the registry's queue/job type contracts to produce documentation.
- **`scripts/ops/prepare-job.ts`, `run-job.ts`, `reapply-erasures.ts`** — Operational scripts that exercise the job/erasure paths the registry interfaces describe.
- **`scenarios/support/demo.ts`** — Demo/test scenario that registers modules against these interfaces.

## Notes

- **`never` as a parameter type** (`PublicEventTarget.toPublicEvent`, `BrowserEventTarget.toReport`) is a deliberate contravariance trick: a function accepting a *concrete* payload type is assignable to `(payload: never) => …`, so each module keeps full type safety at the call site while the registry stays generic. Do not "simplify" these to `unknown` — that would erase the per-module type.
- **`ModuleConsumer.handler` is a method, not a property.** Method-parameter bivariance lets each module keep its own generated payload type; a property-function signature would collapse all handlers to `unknown`.
- **Boundary rule is structural, not conventional.** The imports from `infrastructure/*` into `src/modules/*` are blocked by `eslint.config.ts` boundary rules (`boundaries/dependencies`). The registry interfaces are the *only* sanctioned crossing.
- **`ImageTarget.writeback` is idempotent by contract**: the `key` check makes a redelivered or superseded job a no-op. Implementations must perform the check-then-update atomically.
- The file is a **type + re-export module** (no runtime logic beyond the two imported functions). All behavior lives in the consuming infrastructure and the owning modules.
