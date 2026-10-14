---
source: src/modules/analytics/tests/unit/relay.test.ts
sha256: a39489d91852d8cd30d9ceb4298135ecee792e755094c249e556094620819045
generated_at: 2026-10-14T14:56:26.167196+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/unit/relay.test.ts

## Purpose

Unit tests for the analytics relay service. Verifies that `relayEvent` routes a request body to the owning module's `toReport` function (looked up by the body's `event` field) and forwards the module-built report to the analytics emitter, while silently dropping events that no registered module claims.

## Key elements

- **`mockEmit`** – `jest.fn()` stand-in for `emitAnalyticsEvent`; asserted on to confirm what was actually emitted.
- **`jest.mock('@infrastructure/observability/analytics', …)`** – factory mock that stubs `buildAnalyticsBase` (returns a fixed `distinctId`) and routes `emitAnalyticsEvent` calls into `mockEmit`.
- **`CONTEXT`** – `asStub<CallerContext>({})`; a throwaway caller the mocked base-builder ignores.
- **`body(event)`** – helper returning `asStub<AnalyticsEventRequest>({ event, extra: 1 })`, a shape only the relay-under-test reads.
- **`afterEach`** – resets registrations (`registerBrowserEvents({})`) and clears `mockEmit` between tests.
- **`describe('relayEvent')`** – three cases:
  - happy path: a registered module's `toReport` is called with the raw body, and the emitter receives the combined report.
  - unregistered event: no emit occurs.
  - `constructor` string in the body: must **not** be resolved as a registered event (prototype-inheritance guard).

## Relationships

- **`src/modules/analytics/services/relay.ts`** – module under test; provides `registerBrowserEvents` and `relayEvent`.
- **`src/types/index.ts`** – barrel re-exporting `AnalyticsEventRequest` and `CallerContext` (imported via the `@types` alias).
- **`src/types/auth-context.ts`** – defines the `CallerContext` type used in the stub.
- **`tests/support/stub.ts`** – provides `asStub<T>` to create minimally-shaped objects without satisfying full interface requirements.

## Notes

- The `constructor` test is intentional: it guards against `Object.prototype` properties (e.g. `constructor`, `hasOwnProperty`) being mistaken for registered event names. If you add a similar lookup path in the relay, keep a regression test for it.
- `mockEmit` is declared **before** the `jest.mock` call so the factory can reference it despite Jest's hoisting of `jest.mock` to the top of the file.
- Registrations are stateful across calls within a single test; `afterEach` clears them, so each `it` block starts from a clean registry.
