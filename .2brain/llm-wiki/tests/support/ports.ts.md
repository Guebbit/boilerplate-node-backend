---
source: tests/support/ports.ts
sha256: 3608e37db3a82346227b103d4f8e89411b3c6be9435b98bd2f6552fec80ddeee
generated_at: 2026-10-29T07:09:38.044783+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ports.ts

## Purpose

Test helper that works around a portability problem with `jest.spyOn` on namespace-imported port functions (`emitAuditEvent`, `emitAnalyticsEvent`). Under `@swc/jest` and Stryker's instrumented sandbox, the CommonJS namespace object exposes exports as non-configurable getters, so `spyOn` throws `TypeError: Cannot redefine property`. This file provides a module-replacement + call-history-clearing pattern that works identically under every transform.

## Key elements

- **`observePort<T>(port: T): jest.MockedFunction<T>`** — Accepts a function that has already been replaced by a `jest.mock` factory. Clears its call history (`mockClear`) so the spy records only from the call site onward, then returns it typed as a mock. Throws a descriptive error if the argument is not actually a mock (i.e., the test file forgot to declare the `jest.mock` replacement).

- **`auditPortMock()`** — Returns a full module replacement object for `@infrastructure/observability/audit`. Spreads `jest.requireActual` of the real module, replaces `emitAuditEvent` with a fresh `jest.fn()`, and rebuilds `recordAudit` so that it routes through that local `jest.fn()` (the real `recordAudit` closes over its own module's `emitAuditEvent` and would bypass the mock). A `recordAudit` call with no context is a no-op, matching real behavior.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The module that `auditPortMock` replaces. `auditPortMock` calls `jest.requireActual` on it to spread real exports and to access `buildAuditEvent` for the rebuilt `recordAudit`.
- **All integration/contract test files listed as neighbors** — Each declares its own `jest.mock('@infrastructure/observability/audit', () => …auditPortMock())` (required because `jest.mock` is hoisted per module registry) and then calls `observePort(auditPort.emitAuditEvent)` at the point in the test where recording should begin.

## Notes

- `jest.mock` **must** be declared in each test file individually; it cannot be applied from a helper because of per-registry hoisting. `observePort` is the "other half" that handles clearing and typing.
- Clearing in `observePort` is intentional: a module-level `jest.fn()` records from file-load time, which would silently break `not.toHaveBeenCalledWith` assertions in "this event but not that one" cases.
- The runtime guard in `observePort` (`typeof mocked.mockClear !== 'function'`) produces an error message that points back to this file's header for the full explanation.
- `auditPortMock` sets `__esModule: true` so that interop with the namespace import in test files works correctly.
