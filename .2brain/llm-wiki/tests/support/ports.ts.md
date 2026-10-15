---
source: tests/support/ports.ts
sha256: a277cb49adb2e058586573ce8aabb7a70a3dd1d0887207a5e94131ce1ce724df
generated_at: 2026-10-15T12:59:40.814365+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ports.ts

## Purpose

Test helper that provides a safe way to observe observability port functions (e.g. `emitAuditEvent`, `emitAnalyticsEvent`) from tests. It exists because `jest.spyOn` on namespace-imported ports throws under `@swc/jest` and Stryker's sandbox (non-configurable getters), so tests instead declare a module-level `jest.fn()` via `jest.mock` and use this helper to get a cleared, properly-typed mock at the assertion point.

## Key elements

- **`observePort<T>(port: T): jest.MockedFunction<T>`** — the sole export. Accepts a function that is already a `jest.fn()` (from a `jest.mock`-replaced module), clears its call history, and returns it typed as a mock. If the argument is a real (non-mock) function, it throws a descriptive error directing the caller to add a `jest.mock` declaration to the test file.

## Relationships

All listed neighbors are integration or contract test files (access, account, cart, example, feedback, inventory, orders) that:

1. Declare their own `jest.mock('@infrastructure/observability/…', …)` at the top of the test file (required because `jest.mock` is hoisted per module registry and cannot be applied from a helper).
2. Call `observePort(auditPort.emitAuditEvent)` (or the analytics equivalent) inside an `it()` block to obtain a cleared mock for `toHaveBeenCalledWith` / `not.toHaveBeenCalledWith` assertions.

No source (`src/`) module imports this file; it is test-infrastructure only.

## Notes

- **`jest.mock` must live in the test file.** `observePort` cannot inject it. Forgetting the `jest.mock` line means the real function is passed in, and `observePort` will throw at runtime with a pointer to this file's header comment.
- **The `mockClear()` call is load-bearing.** A module-level `jest.fn()` accumulates calls from the moment the module loaded; clearing at the `observePort` call-site restores the "record from this line" semantics that `jest.spyOn` would have provided, which is what makes negative assertions (`not.toHaveBeenCalledWith`) meaningful.
- The generic constraint `T extends (...args: never[]) => unknown` is a deliberate no-op on call arguments so the returned mock is typed as the original function's signature rather than `jest.Mock`.
