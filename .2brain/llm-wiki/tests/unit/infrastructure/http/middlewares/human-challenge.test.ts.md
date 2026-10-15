---
source: tests/unit/infrastructure/http/middlewares/human-challenge.test.ts
sha256: b1d19dcb52721176955c783324a41f98a0578cc466daf4a3e124086474305834
generated_at: 2026-10-15T13:12:08.412606+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/human-challenge.test.ts

## Purpose

Unit tests for the `humanChallengeGate` middleware's HTTP contract: which request header it reads, what a refusal returns (401), and the invariant that when the gate is OFF it costs nothing—not even a `header()` call. Provider-selection logic is explicitly out of scope (owned by `antibot-providers/index.test.ts`).

## Key elements

- **`makeRequest(token?)`** – Local helper that returns an `asStub<Request>` whose only meaningful property is the `x-antibot-challenge-token` header value (or `undefined`).
- **`afterEach`** – Resets `NODE_ANTIBOT_TURNSTILE_SECRET` to `undefined` and calls `jest.restoreAllMocks()` so no env leak or spy leak affects other suites.
- **"is off by default"** – Asserts `next()` is called once and `request.header` is *never* called when `NODE_ANTIBOT_PROVIDER` is unset.
- **"refuses with 401 … no token"** – Provider set to `'turnstile'`, token absent → `next` not called, `response.status(401)`.
- **"calls next() when the provider vouches"** – Mocks `globalThis.fetch` to resolve `{ success: true }`; awaits `process.nextTick`; asserts `next()` called once.
- **"asks Cloudflare without following a redirect … oversized answer"** – Asserts the `fetch` call uses `redirect: 'error'`, and that a body > 1 MiB (1 048 577 chars of padding) is refused even if `success: true`.
- **`it.each` refusal cases** – Parameterized over `{ success: false }` and a 503-status `{ success: true }`; both must yield 401 and no `next()`.
- **"refuses when the provider throws"** – `fetch` rejects with a network error; asserts 401, never a pass-through.

## Relationships

- **`src/infrastructure/http/middlewares/human-challenge.ts`** – The module under test; imports `humanChallengeGate`.
- **`tests/support/environment.ts`** – Provides `setEnvironment` used to toggle `NODE_ANTIBOT_PROVIDER` and `NODE_ANTIBOT_TURNSTILE_SECRET` per test case.
- **`tests/support/express.ts`** – Provides `makeResponseStub` for capturing `status()` calls.
- **`tests/support/stub.ts`** – Provides `asStub<T>` to create typed, callable stubs (used for `Request` and the header function).

## Notes

- Async resolution is handled by `await new Promise(process.nextTick)` or a 50 ms `setTimeout`—there is no explicit return/Promise from the middleware, so tests must flush the microtask or event loop before asserting.
- The oversized-response test constructs a 1 MiB + 1-byte JSON string inline; the threshold is not imported from a constant, so a change in the production limit won't be caught by this test.
- `redirect: 'error'` is asserted on the *second* argument of the `fetch` call (`fetchSpy.mock.calls[0][1]`); if the implementation switches to a `Headers`-based or `AbortSignal` approach, this assertion will break.
- The file's doc-comment explicitly carves out provider-selection tests to a different suite to avoid a single file owning two concerns.
