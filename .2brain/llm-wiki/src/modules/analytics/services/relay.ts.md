---
source: src/modules/analytics/services/relay.ts
sha256: f76a60dbe664360015fcb414866d14cf733bcaf752631ab0ca6ed6e8c544b078
generated_at: 2026-11-14T19:20:12.110571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/services/relay.ts

## Purpose

Relays a validated browsing event to the analytics port by name. It holds no knowledge of individual event types; instead it looks up a registered `BrowserEventTarget` and delegates the shaping to that target's `toReport`. It exists so that the analytics module can remain decoupled from whichever feature modules define the events.

## Key elements

- **`browserEvents`** (module-level `let`) — a `Record<string, BrowserEventTarget | undefined>` map used for name → target lookup. Replaced wholesale by `registerBrowserEvents`.
- **`registerBrowserEvents(events)`** — installs the lookup table. Called once from the registry's `onRegistered` hook after all enabled modules have been collected.
- **`relayEvent(event, context)`** — the public entry point. Resolves the target for `event.event`, calls `target.toReport(event)`, merges the result with `buildAnalyticsBase(context)`, and hands the payload to `emitAnalyticsEvent`. Silently returns if no module owns the event name.

## Relationships

- **`@infrastructure/observability/analytics`** (`src/infrastructure/observability/analytics/index.ts`) — source of `buildAnalyticsBase` (assembles the shared envelope from `CallerContext`) and `emitAnalyticsEvent` (the analytics port that actually dispatches and enforces the consent gate).
- **`@kernel/registry`** (`src/kernel/registry.ts`) — provides the `BrowserEventTarget` type that values in the lookup table must conform to.
- **`@types`** (`src/types/index.ts`, which re-exports from `src/types/auth-context.ts` among others) — provides the `AnalyticsEventRequest` and `CallerContext` types used in the public signatures.
- **`src/modules/analytics/services/index.ts`** — barrel that re-exports this module's public API (`registerBrowserEvents`, `relayEvent`) to the rest of the analytics service layer.
- **`src/modules/analytics/tests/unit/relay.test.ts`** — unit tests for the lookup and relay logic.

## Notes

- **Consent is not enforced here.** The file explicitly defers to the analytics port (`emitAnalyticsEvent`) for the consent gate. A non-consenting visitor is dropped downstream, not by this function.
- **No event names are hardcoded.** The set of valid events is entirely data-driven via the `browserEvents` map populated at registration time. Adding a new event requires no change to this file.
- **Ordering dependency:** `relayEvent` will always no-op until `registerBrowserEvents` has been called. In practice this is guaranteed by the registry calling `onRegistered` before any request can arrive.
- **The `toReport` spread is type-safe by construction:** the target was registered under the exact event name in the request, so the shape it returns matches what the target's own module fragment declares.
