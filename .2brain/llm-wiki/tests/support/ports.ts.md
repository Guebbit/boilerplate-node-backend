---
source: tests/support/ports.ts
sha256: 3608e37db3a82346227b103d4f8e89411b3c6be9435b98bd2f6552fec80ddeee
generated_at: 2026-11-08T09:57:26.039121+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ports.ts

## Purpose

Provides a portable way to observe (spy on) observability port functions in Jest tests. It exists because `jest.spyOn` on a CommonJS/SWC namespace object fails with `TypeError: Cannot redefine property` under `@swc/jest` and Stryker's instrumented sandbox. Instead of redefining a non-configurable getter, this helper works with a pre-mocked module (via `jest.mock`) and clears its call history at the point of use, restoring the "record from this line" semantics that `spyOn` would have provided.

## Key elements

- **`observePort<T>(port: T): jest.MockedFunction<T>`** — Accepts a function that has already been replaced by `jest.mock`, clears its call history (`mockClear()`), and returns it typed as a mock. Throws a descriptive error if the argument is not actually a mock (i.e., the test file forgot to declare the `jest.mock` replacement).
- **`auditPortMock()`** — Returns a replacement module object for `@infrastructure/observability/audit`. Spreads all real exports (via `jest.requireActual`), overrides `emitAuditEvent` with a fresh `jest.fn()`, and rebuilds `recordAudit` so it routes through that local mock. A `recordAudit` call with a falsy context is a no-op, matching the real implementation.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The module being replaced. `auditPortMock()` loads its real exports and substitutes only `emitAuditEvent` / `recordAudit`.
- **All listed test files** (access, account, cart, example integration/contract suites) — Each declares `jest.mock('@infrastructure/observability/audit', () => jest.requireActual('@tests/ports').auditPortMock())` in its own file, then imports `observePort` to obtain a cleared spy reference for assertions.

## Notes

- `jest.mock` is hoisted per module registry and **cannot** be applied from a shared helper; every consuming test file must declare the `jest.mock` line itself. This file only supplies the factory (`auditPortMock`) and the clearing step (`observePort`).
- `mockClear()` inside `observePort` is essential: without it, calls emitted earlier in the same `it()` block (before the spy line) would still be in the history, breaking `not.toHaveBeenCalledWith` assertions.
- The `__esModule: true` flag on the returned object ensures named-import interop works under both ts-jest (`__importStar`) and swc transforms.
