---
source: tests/unit/infrastructure/runtime/shutdown-infra.test.ts
sha256: 676f57f3530882252bba6338606ab8906a215b563335577e02c351c20fb632d1
generated_at: 2026-10-15T13:19:41.509983+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/shutdown-infra.test.ts

## Purpose

Unit-test the **ordering guarantees** of `shutdownInfra` (from `server-lifecycle`): that any caller-supplied in-flight work settles before the queue and database adapters are closed, and that the same close sequence holds when no in-flight work exists. Every real adapter is stubbed so the test observes only the sequence, not adapter internals.

## Key elements

- **`beforeEach`** — resets a `calls: string[]` log and wires `stopQueue` / `stopDatabase` mocks to push labelled entries (`'queue stopped'`, `'database stopped'`) in call order.
- **`describe('shutdownInfra')`** — two cases:
  - *In-flight settles first*: passes a `settleInFlight` callback (10 ms delay) as the second argument; asserts `calls` equals `['in-flight settled', 'queue stopped', 'database stopped']` and that the callback received a numeric argument (a timeout/duration).
  - *No in-flight work*: calls `shutdownInfra()` with no arguments; asserts `calls` equals `['queue stopped', 'database stopped']`.
- **`jest.mock` block (top-level)** — stubs seven adapters/modules so their real side-effects never fire: `queue`, `database`, `cache`, `pdf` (`settleRenders`), `limits-redis`, `i18n`, `analytics`, and `otel-sdk`.

## Relationships

- **`src/infrastructure/runtime/server-lifecycle.ts`** — the module under test; `shutdownInfra` is imported and exercised directly.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` is mocked and its invocation order is asserted.
- **`src/infrastructure/runtime/database.ts`** — `stopDatabase` is mocked and its invocation order is asserted.

The remaining mocked modules (`cache`, `pdf`, `limits-redis`, `i18n`, `analytics`, `otel-sdk`) are not in this page's neighbor list but are required at module-load time because `shutdownInfra` imports them internally.

## Notes

- The order assertion is **exact** (`toEqual`), not subset-based: adding or reordering a close step in `shutdownInfra` will break both tests.
- `settleInFlight` is verified to receive `expect.any(Number)`, implying `shutdownInfra` passes a timeout or deadline into the caller's settlement function.
- Six adapters are mocked **without** being imported in this file; they exist solely to neutralise transitive imports pulled in by `server-lifecycle.ts`. Removing any of those `jest.mock` calls will cause the test to hit real network/filesystem side-effects.
