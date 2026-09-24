---
source: tests/support/ports.ts
sha256: 780f38ae6d0258525ced34d93978a8baa52cf957a34b63c1389ab7933bcff9e2
generated_at: 2026-09-23T20:12:30.537355+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ports.ts

## Purpose

Provides a portable `observePort` helper for asserting on observability port calls (audit, analytics) in tests. It exists because `jest.spyOn` on namespace-imported port functions throws under CommonJS/swc transforms (non-configurable getters) and inside Stryker's instrumented sandbox, so the recommended pattern is module-level `jest.mock` + this helper to restore per-assertion spy semantics.

## Key elements

- **`observePort(port)`** — Accepts a function from a `jest.mock`-replaced module, validates it is a mock (throws a descriptive error if not), calls `mockClear()` so the call history starts at the point of invocation, and returns it typed as `jest.MockedFunction<T>`. Call sites use it identically to the old `jest.spyOn` line.

## Relationships

Imported by integration and contract tests across every module that asserts on observability port calls:

- `src/modules/access/tests/integration/access.test.ts`
- `src/modules/account/tests/contract/oauth.contract.test.ts`
- `src/modules/account/tests/integration/oauth-link.test.ts`
- `src/modules/account/tests/integration/self-service.test.ts`
- `src/modules/account/tests/integration/service-flows.test.ts`
- `src/modules/account/tests/integration/service.test.ts`
- `src/modules/feedback/tests/integration/service.test.ts`
- `src/modules/inventory/tests/integration/service.test.ts`
- `src/modules/orders/tests/integration/cancel.test.ts`
- `src/modules/orders/tests/integration/create-audit.test.ts`
- `src/modules/users/tests/contract/api.contract.test.ts`
- `src/modules/users/tests/integration/service.test.ts`
- `src/modules/webhooks/tests/integration/delivery.test.ts`

Each test file is responsible for declaring its own `jest.mock('@infrastructure/observability/…')` (or equivalent) before importing; `observePort` only handles the clear-and-return step.

## Notes

- **`jest.mock` is hoisted per module registry** — the helper cannot call `jest.mock` on behalf of a test. The test file must declare the module replacement itself. Passing a real (non-mock) function triggers a runtime error with a pointer back to this file's header comment.
- **Clearing semantics matter**: a `jest.fn()` created at module load time accumulates calls from earlier tests in the same file. `observePort` calls `mockClear()` before returning, so `not.toHaveBeenCalledWith` assertions behave as they would with a `spyOn` declared at that line.
- **Do not reach for `jest.spyOn(port, 'fn')`** in these test files; it will break under `@swc/jest` (used by `jest.config.mutation.js`) and in Stryker mutation runs.
