---
source: src/modules/analytics/tests/unit/relay.test.ts
sha256: a39489d91852d8cd30d9ceb4298135ecee792e755094c249e556094620819045
generated_at: 2026-11-08T04:59:53.603159+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/unit/relay.test.ts

## Purpose

Unit tests for the relay service's dispatch protocol: verifying that `relayEvent` resolves an event name to the module that registered it, delegates to that module's `toReport`, and emits the resulting analytics payload — while safely dropping unregistered names and inherited prototype keys.

## Key elements

- **`mockEmit`** – `jest.fn()` standing in for the real `emitAnalyticsEvent`, used to assert what the relay emits.
- **Jest mock of `@infrastructure/observability/analytics`** – Replaces `buildAnalyticsBase` (returns `{ distinctId: 'anonymous' }`) and `emitAnalyticsEvent` (delegates to `mockEmit`).
- **`CONTEXT`** – A stubbed `CallerContext` object; the relay's base-builder ignores it under the mock.
- **`body(event)`** – Helper returning an `AnalyticsEventRequest` stub (`{ event, extra: 1 }`) shaped for the test target only.
- **`afterEach`** – Calls `registerBrowserEvents({})` to clear registrations and `mockEmit.mockReset()`.
- **`describe('relayEvent')`** – Three cases:
  - *emits what the owning module built* – registers a `toReport` spy, fires `page_opened`, asserts both `toReport` input and final emitted payload.
  - *drops an unowned event* – no registration, expects no emission.
  - *does not resolve an inherited property* – fires `'constructor'`, expects no emission (guards against prototype-chain leakage).

## Relationships

- **`src/modules/analytics/services/relay.ts`** – The module under test. The file imports `registerBrowserEvents` and `relayEvent` from it (after the Jest mock is installed).
- **`src/types/auth-context.ts`** – Source of the `CallerContext` type used to type the stubbed `CONTEXT`.
- **`src/types/index.ts`** – Barrel re-export; the test imports `AnalyticsEventRequest` and `CallerContext` via the `@types` alias.
- **`tests/support/stub.ts`** – Provides `asStub`, the utility used to create minimal typed objects for `CONTEXT` and the request body.

## Notes

- The `jest.mock` call for the observability module appears *before* the `import` of the relay service, relying on Jest's mock-hoisting. If you reorder imports, the mock may no longer take effect for the relay's internal reference.
- The `'constructor'` test is a deliberate guard against `Object.prototype` properties being mistaken for registered event names; it implies the relay uses a safe lookup (e.g. `hasOwn` or a `Map`) rather than a plain `in` check.
- `afterEach` clears registrations with an empty object rather than a dedicated `reset` call — adding a new registration helper to the relay service would require updating this file.
