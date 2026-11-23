---
source: src/modules/analytics/services/relay.ts
source_sha256: 500111bb59ec96d4bfd3447dfa33a3c46e37d079578a300feb0ba2d9edd55e43
context_sha256: 05b2b8f60f3fe16fb2c2a0cc0fd8a2c6022938d733d4b5beb40056d858a46d30
generated_at: 2026-11-22T04:18:34.422789+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/services/relay.ts

## Purpose
Hands a relayed browsing event (sent from the browser) to the analytics port. It is deliberately generic: it knows no event names. Each module declares its own browser events and how they map to provider events, and this file only looks up the matching target and emits. The consent gate lives in the analytics port, so visitors who haven't agreed are dropped there, not here.

## Key elements
- `registerBrowserEvents(events)` — installs the module-level lookup (event name → `BrowserEventTarget | undefined`). Meant to be called once from `onRegistered`, when every enabled module is known.
- `relayEvent(event, context)` — looks up the target for `event.event`, and if one exists, calls `emitAnalyticsEvent` with `buildAnalyticsBase(context)` spread together with `target.toReport(event)`. Returns `void`; unknown events are silently dropped.
- `browserEvents` (private) — mutable module-level lookup, empty until registered.

## Relationships
- `@kernel/registry` (`src/kernel/registry.ts`) — supplies the `BrowserEventTarget` type used for the lookup's values.
- `@infrastructure/observability/analytics` (`src/infrastructure/observability/analytics/index.ts`) — provides `buildAnalyticsBase` (builds the base payload from the caller context) and `emitAnalyticsEvent` (emits to the analytics port, where consent is enforced).
- `@types` (`src/types/index.ts`, `src/types/auth-context.ts`) — supplies the `AnalyticsEventRequest` and `CallerContext` types.
- `src/modules/analytics/services/index.ts` — the services module that sits alongside this file in the graph.
- `src/modules/analytics/tests/unit/relay.test.ts` — unit tests for this file.

## Notes
- Until `registerBrowserEvents` runs, the lookup is empty and every event is dropped.
- The lookup uses `Object.hasOwn`, so inherited keys such as `constructor` or `__proto__` in an event name cannot match a target.
- Dropping an unowned event is a fallback: the request contract already refuses such events, so this only happens if the contract and the registry disagree.
- The `CallerContext` is built once in the controller and passed in; the emitted event is attributed to the caller who sent it.
