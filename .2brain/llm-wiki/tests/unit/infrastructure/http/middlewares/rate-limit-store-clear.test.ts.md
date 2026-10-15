---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store-clear.test.ts
sha256: 5447edaf52c7d9822791b8842d127b4a79430c856e369c792e299d96a987f348
generated_at: 2026-10-15T13:13:36.005028+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store-clear.test.ts

## Purpose

Unit test for `clearRateLimitCounters`, the function the e2e test suite calls to wipe spent rate-limit budgets between runs. It locks down three contracts: the scope of deletion (only the limiter's own key prefix, never a global FLUSH), the fail-open return shape when Redis is unreachable, and guaranteed cleanup of the short-lived Redis client.

## Key elements

- **`calls`** — mutable recorder (patterns scanned, keys deleted, close count) reset in `beforeEach` so each test asserts in isolation.
- **`connectError`** — module-level toggle; a test sets it to make `fakeClient().connect` reject, simulating a down Redis.
- **`fakeClient()`** — node-redis stand-in exposing `on`, `connect`, `scanIterator` (async generator yielding two batches: a populated one then an empty sentinel), `del`, `close`, and `destroy`. The two-batch scan mirrors real `scanIterator` termination.
- **`jest.mock('redis', …)`** — replaces `createClient` so the SUT gets `fakeClient()` without a real server.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — silences `warn`/`error`/`info` so connection-failure logs don't pollute output.
- **`describe('clearRateLimitCounters')`** — four cases:
  1. Deletion is scoped to `rate-limit:*` and the return is `{ deleted: 2, reachable: true }`.
  2. The client the SUT opened is closed exactly once.
  3. A `undefined` URL short-circuits to `{ deleted: 0, reachable: true }` with no SCAN.
  4. A rejected `connect` yields `{ deleted: 0, reachable: false }` (no throw) and the client is still closed.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test; the file imports and exercises its sole export `clearRateLimitCounters(url?: string)`. All behavioral assertions target that function's return shape and side-effects on the Redis client.

## Notes

- The fail-open contract is explicit: a connection failure must **resolve** with `reachable: false`, never reject. Any future refactor that throws on `ECONNREFUSED` will break case 4.
- `scanIterator` is typed as an `AsyncIterable` (async generator), not a plain array — the `eslint-disable` comment documents that this shape is the SUT's contract. Mocks must preserve it.
- The SCAN `MATCH` pattern is hard-coded to `rate-limit:*`; the test asserts this exact string, so renaming the prefix in the implementation without updating the test will fail case 1.
