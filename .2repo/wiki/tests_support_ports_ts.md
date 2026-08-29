# tests/support/ports.ts

## Purpose

A single-function test helper that hands out a `jest.fn()`-backed port (e.g. `emitAuditEvent`, `emitAnalyticsEvent`) with its call history cleared, so tests can assert "this event fired, that one didn't" from a known-clean baseline. It exists because the naïve `jest.spyOn(namespace, 'fn')` pattern is not portable across the project's transform pipeline (`ts-jest` vs `@swc/jest`) and Stryker's instrumented sandbox, where CommonJS namespace getters are non-configurable and `spyOn` throws a `TypeError`.

## Key elements

- **`observePort<T>(port: T): jest.MockedFunction<T>`** — Accepts a function that was already replaced by a `jest.mock(...)` declaration in the calling test file, validates it is actually a mock (throws a descriptive error if not), calls `.mockClear()`, and returns the function typed as `jest.MockedFunction<T>`. The `mockClear()` step restores "recording starts here" semantics that a module-level `jest.fn()` would otherwise lose (it records from file-load time).

## Relationships

- **`src/modules/account/tests/integration/self-service.test.ts`** — Imports `observePort` to capture and assert audit/analytics port calls emitted during self-service account flows.
- **`src/modules/account/tests/integration/service-flows.test.ts`** — Same pattern; observes port emissions across multi-step service-level account operations.
- **`src/modules/orders/tests/integration/cancel.test.ts`** — Observes audit events during order-cancel flows to verify the correct event type was (or was not) emitted.

In all three, the test file itself declares `jest.mock('@infrastructure/observability/audit', …)` (or the analytics equivalent) at the top; `observePort` is then called inside individual `it()` blocks to obtain the cleared mock.

## Notes

- **You cannot call `jest.mock` from this helper.** `jest.mock` is hoisted per module registry, so each consuming test file must declare the module replacement itself. `observePort` only handles the "get the mock and reset history" half.
- **Calling `observePort` with a non-mock throws immediately** with a message pointing back to this file's header for the full explanation—useful if a test file accidentally omits its `jest.mock` declaration.
- **The generic signature** `<T extends (...args: never[]) => unknown>` preserves the original function's parameter types on the returned `jest.MockedFunction`, so call-site assertions like `expect(auditSpy).toHaveBeenCalledWith(userId, 'token-rotated')` keep their type safety.
