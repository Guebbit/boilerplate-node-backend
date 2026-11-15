---
source: src/kernel/registry.ts
sha256: f03d7ba0707cee275358bfbd90e43ce805d2c603b99be10dcecc5346b772bf1f
generated_at: 2026-11-14T18:24:01.753145+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines a set of typed contract interfaces (the "module manifest" slots) that let application-tier modules declare capabilities to infrastructure code without the infrastructure importing the modules. This is the dependency-inversion seam behind the project's module boundary: infrastructure adapters (image worker, queue, webhooks, analytics, translation) cannot import `src/modules/*`, so each module registers a small interface instead, keyed under a named slot on its manifest. The file is a pure type-level registry — it exports no runtime logic beyond re-exporting a couple of helper imports.

## Key elements

- **`ImageTarget`** — A single `writeback` callback that persists a finished image digest (`imageUrl`/`thumbnailUrl`) onto a module-owned document, guarded by a `pendingImageKey` match so stale/duplicate jobs are no-ops.
- **`ModuleConsumer`** — Queue-consumer declaration (`queue`, `handler`, `schema`, `prefetch?`). The `handler` is a method (bivariant) so each module keeps its own generated payload type. Returning `true` acks; `false` parks (permanent rejection); throwing nacks for retry.
- **`TranslatableTarget`** — Five callbacks (`collection`, `revisionOf`, `cacheTag`, `writeDerived`, `markEdited`, `fieldRules`) that let the generic translation resolver read, validate, write, and invalidate a module's translatable content without importing the owning module's Mongoose model.
- **`PublicEventProjection`** — Shape of a public webhook event (`eventType`, `data`).
- **`PublicEventTarget`** — A `toPublicEvent(payload: never)` projection that maps one domain event into zero or one public event. The `never` parameter follows the same variance trick as `kernel/events.ts` handler maps.
- **`BrowserEventReport`** — `Pick<AnalyticsEventInput, 'event' | 'properties'>`, the payload handed to the analytics provider.
- **`BrowserEventTarget`** — A `toReport(body)` method (bivariant, so it accepts only its own event's shape) that builds a `BrowserEventReport` from a validated browser-analytics request.
- **`PersonalDataSubject`** — `{ userId, email, verifiedEmail }` identity for GDPR export/erasure operations; `email` is present because some modules (e.g. `tasks`) match rows by address rather than id. *(Content truncated in source; additional fields may follow.)*

## Relationships

- **`src/kernel/events.ts`** — Imports `markDomainEventsWired` at the top of this file; the `PublicEventTarget` / `never`-payload pattern mirrors the handler-map convention already established there.
- **`src/infrastructure/config/define.ts`** — Imports the `ConfigSlice` type, used by module manifests to declare their config slice.
- **`src/infrastructure/observability/analytics/index.ts`** — Imports `AnalyticsEventInput` (and the `AnalyticsEventRequest` type from `@types`) to type `BrowserEventReport` and `BrowserEventTarget`.
- **`src/infrastructure/security/reencrypt.ts`** — Imports `ReencryptReport` (presumably used by a further registry slot below the truncation point).
- **`src/app/workers.ts`** — The runtime consumer that collects `ModuleConsumer` entries from all module manifests and calls `consumeFromQueue` for each; this file only supplies the shape.
- **`src/app/jobs.ts`** / **`src/app.ts`** — Application entry points that assemble the manifest list and wire the registry slots into running services.
- **`scripts/ops/run-job.ts`**, **`scripts/ops/prepare-job.ts`**, **`scripts/ops/reapply-erasures.ts`** — Operational scripts that exercise the job/erasure paths whose contracts are declared through these registry types.
- **`scripts/docs/generate-jobs.ts`**, **`scripts/docs/generate-rate-limit-budgets.ts`**, **`scripts/docs/jobs-render.ts`** — Documentation generators that read the same manifest/registry declarations to render job and rate-limit docs.
- **`scenarios/support/demo.ts`** — Test/demo scenario that exercises the module wiring these interfaces describe.

## Notes

- **Pure type file at runtime.** Every export here is an interface or type alias; the only value import is `markDomainEventsWired` (a function call, not a re-export). The file exists so that both sides of the boundary can `import type { … }` without creating a runtime edge.
- **`never` and method-bivariance are deliberate.** `PublicEventTarget.toPublicEvent` and `BrowserEventTarget.toReport` use `never` parameters and method syntax (not property-arrow types) specifically so a concrete-typed implementation is assignable into the registry slot. Switching to property syntax would collapse the parameter to `unknown` and break per-module type safety.
- **One slot per concern, one key per module.** Each interface maps to exactly one manifest key (`imageTargets`, `consumers`, `translatables`, `publicEvents`, browser-events key, personal-data key). Adding a new cross-boundary capability means adding a new interface here and a new key in `src/modules.ts` — not reaching into another module's barrel.
- **File is truncated in the reviewed snapshot.** The `PersonalDataSubject` definition and any subsequent exports (e.g. a re-encryption or rate-limit budget slot implied by the `ReencryptReport` import) are cut off; treat the export list above as partial.
