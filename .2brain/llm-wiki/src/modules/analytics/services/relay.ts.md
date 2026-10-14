---
source: src/modules/analytics/services/relay.ts
sha256: 3b0e40ac2d98cf9e0b2e2b04f2def631765bf7440e6b472a1072bacbef987d40
generated_at: 2026-10-14T14:55:36.212732+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/services/relay.ts

## Purpose

Dispatch layer that receives a validated browsing-event request (from the analytics controller) and forwards it to the analytics port via the event's registered `BrowserEventTarget`. It owns no consent logic (the port handles that) and knows no concrete event names (modules declare those in `AppModule.browserEvents`). It exists to decouple the controller from the per-event provider-mapping logic.

## Key elements

- **`browserEvents`** (module-level `let`) — flat `Record<string, BrowserEventTarget | undefined>` lookup, populated once at startup.
- **`registerBrowserEvents(events)`** — installs the lookup table. Called once from `onRegistered` when all enabled modules are known.
- **`relayEvent(event, context)`** — entry point. Resolves the event name to a target; if none is registered the event is silently dropped. Otherwise calls `emitAnalyticsEvent` with `buildAnalyticsBase(context)` spread with `target.toReport(event as never)`.

## Relationships

- **`@infrastructure/observability/analytics`** — imports `buildAnalyticsBase` (builds the shared provider payload from `CallerContext`) and `emitAnalyticsEvent` (the port that enforces consent and hands the event to the provider).
- **`@kernel/registry`** — imports the `BrowserEventTarget` type; defines the shape (`toReport`) that each module's event target must implement.
- **`src/modules/analytics/controllers/post-analytics-event.ts`** — upstream caller; builds the `CallerContext` and invokes `relayEvent` with the validated request body.
- **`src/modules/analytics/module.ts`** — the analytics module's `onRegistered` hook calls `registerBrowserEvents`, passing in the registry's flattened map.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — provide the `AnalyticsEventRequest` and `CallerContext` types used in the function signatures.
- **`src/modules/analytics/tests/unit/relay.test.ts`** — unit tests covering lookup hit/miss and the emit path.

## Notes

- The `event as never` cast in `relayEvent` is intentional: because the target was registered under exactly the event name being dispatched, `toReport` receives the payload shape it expects, but TypeScript cannot prove that from the generic `Record` lookup. The cast is safe by construction, not by runtime check.
- Consent is **not** evaluated here. If the visitor hasn't agreed, the event is dropped inside `emitAnalyticsEvent` (the port). Don't add a consent check to this file.
- `browserEvents` is mutable module state, not a class. It is written exactly once per process lifetime; calling `registerBrowserEvents` a second time would silently replace the table.
