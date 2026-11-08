---
source: tests/unit/infrastructure/http/middlewares/human-challenge.test.ts
sha256: 8c2f3d08caf172f74389d8a942d261e378658103bfcfa0d0cebca09883d3fc23
generated_at: 2026-11-08T10:13:45.510413+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/human-challenge.test.ts

## Purpose

Unit tests for the `humanChallengeGate` Express middleware (rung 3 of the antibot chain, mounted on `signup`/`reset`/`contact`). This suite owns the HTTP contract around the gate: which header is read, what a refusal looks like, and the invariant that when the gate is off, it costs nothing—not even a header read. Provider selection logic is deliberately excluded (lives in `antibot-providers/index.test.ts`).

## Key elements

- **`makeRequest(token?)`** — local helper that builds a stub `Request` whose only behavior of interest is returning `token` for the `antibot-challenge-token` header and `undefined` for all others.
- **`afterEach`** — resets `NODE_ANTIBOT_TURNSTILE_SECRET` to `undefined` and calls `jest.restoreAllMocks()` so no provider state leaks between suites.
- **"off by default" test** — asserts `next()` is called and the request's `header` function is *never* invoked when `NODE_ANTIBOT_PROVIDER` is unset.
- **"refuses with 403 … no token" test** — asserts `next` is not called and the response gets `.status(403)` when a provider is configured but the header is absent.
- **"provider vouches" test** — mocks `globalThis.fetch` to resolve `{ success: true }`; asserts `next()` is called.
- **"redirect + oversized answer" test** — verifies the fetch is issued with `{ redirect: 'error' }` and that a body exceeding ~1 MiB is refused even if it contains `"success":true`.
- **`it.each` refusals** — parameterized cases for `success: false` bodies and non-200 HTTP statuses that still claim `success: true`.
- **"provider throws" test** — mocks `fetch` to reject; asserts the gate still answers 403 and never calls `next()`.

## Relationships

- **`src/infrastructure/http/middlewares/human-challenge.ts`** — the module under test; imports `humanChallengeGate` and exercises its synchronous/async code paths.
- **`tests/support/environment.ts`** — supplies `setEnvironment` to toggle `NODE_ANTIBOT_PROVIDER` / `NODE_ANTIBOT_TURNSTILE_SECRET` per case without mutating real `process.env`.
- **`tests/support/express.ts`** — supplies `makeResponseStub`, the minimal Express response mock used to assert `.status(403)` calls.
- **`tests/support/stub.ts`** — supplies `asStub`, the generic typed-stub factory used for both the `Request` and the header-function stubs.

## Notes

- Async middleware completion is awaited via `process.nextTick` (fast-path tests) or a 50 ms `setTimeout` (redirect/oversized tests) because `humanChallengeGate` is not promisified.
- The oversized-body test encodes a 1 MiB + 1-byte threshold; changing the guard constant in the source will break this case.
- `globalThis.fetch` is spied on directly (not a module mock), so the source must call the global rather than a bound import for these tests to work.
