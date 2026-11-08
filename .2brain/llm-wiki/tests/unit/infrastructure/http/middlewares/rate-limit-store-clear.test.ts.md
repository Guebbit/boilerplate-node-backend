---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store-clear.test.ts
sha256: 9123c023df868e08f8fdcd46681d481ea3ea4256370eb07655518cf697fd0012
generated_at: 2026-11-08T10:15:42.191290+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store-clear.test.ts

## Purpose

Unit tests for `clearRateLimitCounters`, verifying that the e2e-reset path deletes only rate-limit keys under the limiter's own prefix, never performs a global flush, always closes the short-lived Redis client it opens, and degrades gracefully (no throw) when Redis is absent or unreachable.

## Key elements

- **`calls`** – mutable recorder (`patterns`, `deleted`, `closed`) reset in `beforeEach`; each test asserts against it to confirm exact SCAN/DEL/close behavior.
- **`connectError`** – optional `Error` that, when set, makes the fake `connect()` reject, simulating a down Redis.
- **`fakeClient()`** – stand-in for a `node-redis` client. Notable that `scanIterator` is an **async generator** (two yields: a batch of two keys, then an empty batch to signal end).
- **`jest.mock('redis')`** – replaces `createClient` with `fakeClient`.
- **`jest.mock('@infrastructure/adapters/logger')`** – silences all logger methods.
- **Four `it` blocks** covering:
  1. Prefix-scoped delete (`rate-limit:*`) and correct `deleted` count.
  2. Client is closed exactly once on the happy path.
  3. `undefined` URL → `{ status: 'not-configured', deleted: 0 }`, no SCAN issued.
  4. Connection rejection → `{ status: 'unreachable', deleted: 0 }`, client still closed.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – the module under test; this file imports and exercises `clearRateLimitCounters` exclusively.
- **`redis`** (mocked) – the real module the SUT calls; mocked here so no live server is needed.
- **`@infrastructure/adapters/logger`** (mocked) – the SUT logs warnings/errors; mocked to keep tests deterministic and silent.

## Notes

- The SUT contract is **never-throws**: every failure mode is encoded in a `status` field (`'cleared' | 'not-configured' | 'unreachable'`) rather than a rejection. Tests assert `resolves`, not `rejects`.
- `scanIterator` must be an async generator (not a plain promise) because `node-redis` exposes it as `AsyncIterable`. The eslint-disable comment in `fakeClient` documents this contract.
- The SCAN pattern is hardcoded to `rate-limit:*` in the assertions—this is the "only the limiter's own prefix, never a flush" guarantee the file header calls out.
- The client's `close()` is expected **even when `connect()` rejects**, confirming the SUT wraps connection failure in a try/finally (or equivalent).
