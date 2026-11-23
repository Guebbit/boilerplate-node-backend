---
source: src/kernel/registry.ts
source_sha256: dc562aad816b1a271ebc917a7b76c38944630df17e9fa60145845c69860978b6
context_sha256: be5a6738cb74d6bd7a733682411e0326a84cbc1330a76717c56c217a22548521
generated_at: 2026-11-22T03:14:28.577150+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/registry.ts

## Purpose
The module registry: turns the explicit module list in `src/modules.ts` into a running application. A module is a typed manifest object declaring everything it needs the app to do for it. This file defines the target/consumer interfaces a manifest can carry, so that infrastructure and foundation code (image worker, translation resolver, webhooks, analytics) can use module-provided behavior without importing `src/modules/*`.

## Key elements
- `ImageTarget` — `writeback(documentId, key, urls)` persists digested `imageUrl`/`thumbnailUrl` on a module's collection. It only writes if the document's `pendingImageKey` still equals `key`, making stale/duplicate deliveries a no-op. Returns whether a document matched. Registered under `imageTargets`.
- `ModuleConsumer` — a module's own queue consumer declaration (registered under `consumers`): `queue` (one of `WORKER_CHANNELS`), `handler` (method syntax so each module keeps its own payload type; `true` = ack, `false` = park permanently, throw = nack/retry), required `schema` (zod; handler gets parsed output), optional `prefetch` (default 1), optional `fallbackSweep` (for work with its own durable row, run while the broker is down).
- `TranslatableTarget` — declares a collection whose user content translation writes validate and invalidate caches for (registered under `translatables`, keyed by `entityType`). Members: `collection`, `revisionOf`, `cacheTag`, `writeDerived`, `markEdited`, and required `fieldRules` (zod object for one locale's fields).
- `PublicEventProjection` — `{ eventType, data }`, the public webhook-visible event produced from a domain event.
- `PublicEventTarget` — `toPublicEvent(payload: never)` returns a projection or `undefined`. Registered under `publicEvents` by domain event name; resolved via `resolvePublicEvents`.
- `BrowserEventReport` — `Pick<AnalyticsEventInput, 'event' | 'properties'>`.
- `BrowserEventTarget` — `toReport(body)` for browser-reported events the server cannot see. Resolved via `resolveBrowserEvents`, and used to assemble the `POST /analytics/events` contract from the module's `openapi.browser-events.yaml`.
- The file also imports `assertModuleConfig`, `markDomainEventsWired`, `ConfigSlice`, and `ReencryptReport`, and begins a data-subject export/erasure type; the rest of the manifest and its resolver functions are not shown here.

## Relationships
- Imports `ConfigSlice` from `src/infrastructure/config/define.ts`, `AnalyticsEventInput` from `src/infrastructure/observability/analytics/index.ts`, and `ReencryptReport` from `src/infrastructure/security/reencrypt.ts`.
- Per its comments, `src/app/workers.ts` collects `consumers` and calls `consumeFromQueue` for each one.
- Other neighbors (`src/app.ts`, `src/app/config.ts`, `src/app/jobs.ts`, `src/app/worker-process.ts`, the `scripts/docs/*` and `scripts/ops/*` scripts, `scenarios/support/demo.ts`) are in the dependency graph, but the visible portion doesn't show how they interact with this file.

## Notes
- Design rule: infrastructure and foundation code may not import `src/modules/*` (enforced via `boundaries/dependencies` in `eslint.config.ts`). Modules register targets on their manifest and the app tier wires them.
- Modules are listed explicitly in `src/modules.ts`, not discovered from the filesystem, so the list stays statically typed.
- `payload: never` in `PublicEventTarget` lets the registry store entries for different event payloads. The owning module still gets full type safety when writing its own `toPublicEvent`.
- `BrowserEventTarget.toReport` and `ModuleConsumer.handler` use method syntax deliberately, for bivariant parameter checking.
