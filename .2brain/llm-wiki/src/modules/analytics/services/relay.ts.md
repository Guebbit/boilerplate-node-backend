---
source: src/modules/analytics/services/relay.ts
sha256: 3b0e40ac2d98cf9e0b2e2b04f2def631765bf7440e6b472a1072bacbef987d40
generated_at: 2026-11-08T04:59:24.400112+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/services/relay.ts

## Purpose

Relays a validated browsing event to the analytics infrastructure without knowing any specific event by name. Event definitions live in the owning modules (`AppModule.browserEvents`); this file only performs the name→target lookup and hand-off. Consent gating is the port's responsibility, not this file's.

## Key elements

- **`registerBrowserEvents(events)`** — Installs the module-level lookup table (`browserEvents`). Called once from `onRegistered` when all enabled modules are known.
- **`relayEvent(event, context)`** — Looks up the `BrowserEventTarget` for `event.event`, calls its `toReport()` to shape the payload, then emits via `emitAnalyticsEvent`. Unknown event names are silently dropped.
- **`browserEvents`** (module-level `let`) — `Readonly<Record<string, BrowserEventTarget | undefined>>`; the flattened registry of all registered browser events.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — Supplies `buildAnalyticsBase` (assembles common fields from `CallerContext`) and `emitAnalyticsEvent` (the actual port call). This file is the sole consumer of both in the analytics module.
- **`src/kernel/registry.ts`** — Source of the `BrowserEventTarget` type (the interface with `toReport` that each module's events must satisfy).
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Provide `AnalyticsEventRequest` (the validated event body) and `CallerContext` (the caller identity passed in from the controller).
- **`src/modules/analytics/services/index.ts`** — Barrel re-exports `registerBrowserEvents` and `relayEvent` for consumers.
- **`src/modules/analytics/tests/unit/relay.test.ts`** — Unit tests for the lookup-and-emit logic.

## Notes

- The `event as never` cast inside `relayEvent` is intentional: TypeScript can't narrow a `Record<string, …>` lookup to the specific `toReport` overload, but the runtime contract guarantees the target was registered for exactly that event name.
- Unknown event names fall through silently (`if (!target) return`). The API contract is expected to reject them upstream; the early return is a defensive guard for contract drift.
- `relayEvent` is fire-and-forget (`void`). Errors from `emitAnalyticsEvent` are not caught here.
