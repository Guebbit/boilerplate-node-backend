# docs/tools/analytics.md

## Purpose

Documents the product-analytics event system: how business events are emitted from the service layer, how the provider (Umami / PostHog / none) is selected at deployment time, the naming and namespace conventions, and the cross-repo coordination rules that keep the Node, PHP, and frontend event catalogues coherent. It exists so business-question tracking has a single documented home, separate from operational (Prometheus) and per-request (Tempo) observability.

## Key elements

- **`emitAnalyticsEvent()`** – the single helper every module calls; the caller never knows which provider is active.
- **`CallerContext`** (defined in `src/infrastructure/http/request.ts`) – carries `X-Forwarded-For`, user-agent, and trace id into service-layer emits; built once via `callerContextOf(request)` at the controller and passed as an ordinary parameter.
- **`NODE_ANALYTICS_PROVIDER`** – runtime switch (`umami` | `posthog` | `none`); an unrecognised value throws at first emit rather than silently dropping.
- **`shared/contracts/analytics.frontend.ts`** – event names that only a browser can produce; published to the paired frontend as part of the shared Umami namespace.
- **`contracts:bundle`** – CI gate that fails when two sections in the same repo claim one name or value.
- **`check:spec-identity`** – hashes the published catalogue against the paired repo's copy to keep both halves byte-identical.
- **`src/modules/<name>/analytics.ts`** – per-module event definitions; one module, one owner.
- **Naming convention** – `<subject>_<past-tense-verb>`, snake_case, lower-case ASCII; singular vs. plural subject encodes one-instance vs. collection; compound subject for container/item (`cart_item_added`).

## Relationships

- **`docs/tools/events-and-logging.md`** – defines the audit-trail system. Analytics counts *per event name* (Umami keys on the string); audit slices *across actions* via a mandatory `outcome` field. The two are asked different questions and must not be collapsed.
- **`docs/tools/frontend-observability.md`** – documents the browser half, which reports to the same Umami website. Both halves share one namespace; `contracts:bundle` and `check:spec-identity` enforce coherence.
- **`docs/tools/prometheus.md`** – answers operational questions (CPU, latency, errors). Analytics answers business questions (signups, checkout abandonment). They are separate systems with no shared pipeline.
- **`docs/tools/tempo.md`** – answers per-request tracing questions. Analytics is event-level, not span-level.
- **`shared/contracts/analytics.frontend.ts`** – the source of truth for browser-only event names. Published to the paired frontend; both backends must keep their copies byte-identical.
- **`src/infrastructure/http/request.ts`** – defines `CallerContext` and `callerContextOf(request)`. The analytics module imports these to thread caller identity into service-layer emits without an ambient accessor.

## Notes

- **Emit from the service, not the controller.** The controller sees per-route; the service sees per-operation. Multiple routes can reach one operation (e.g. checkout *and* admin-order form both create an order). A controller-level emit silently misses paths the controller doesn't know about.
- **`NODE_UMAMI_INGEST_HOST` ≠ `NODE_UMAMI_HOST`.** The latter is the public origin the browser loads the tracking script from; the former is the internal address the API dials from inside the network. Unset, the ingest host falls back to the public one, which breaks under compose (`localhost` inside the API container is the API itself).
- **Missing `User-Agent` header silently discards the event** (verified against Umami 2.14) while still returning `200`. The provider must always forward the caller's UA or substitute a server placeholder.
- **Renaming an event after deployment is not free.** Umami keys on the string with no history-forwarding; a rename ends one series and starts another.
- **Node deliberately threads `CallerContext` as a parameter** rather than using `AsyncLocalStorage` (the PHP twin uses an ambient accessor). A missing context is a compile error here, not a silent mis-attribution.
- **A `check:spec-identity` failure right after switching backends** is usually the frontend's `BACKEND_PATH` still pointing at the other backend, not a new defect. Point `BACKEND_PATH` at this repo, then run `sync:frontend`.
