---
source: tests/unit/infrastructure/http/middlewares/human-challenge.test.ts
sha256: 937af9ab915980deba41ca5383b86691a2f9b4bb235d4fa1aa5396953014d977
generated_at: 2026-09-23T20:20:56.566620+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/human-challenge.test.ts

## Purpose

Unit tests for the `humanChallengeGate` Express middleware (rung 3 of the anti-bot stack). This suite owns the **HTTP contract** around provider delegation: which header is inspected, what status a refusal returns, and the invariant that when the gate is off the middleware is a zero-cost pass-through (not even a header lookup). Provider-selection logic is explicitly out of scope here.

## Key elements

- **`ORIGINAL`** — captures `process.env.NODE_ANTIBOT_PROVIDER` before the suite runs so `afterEach` can restore the original value (or delete it if it was unset).
- **`afterEach`** — restores the provider env var, deletes `NODE_ANTIBOT_TURNSTILE_SECRET`, and calls `jest.restoreAllMocks()`.
- **`makeRequest(token?)`** — builds a minimal stub `Request` whose `header()` method returns the supplied token only for `x-antibot-challenge-token`; all other names resolve to `undefined`.
- **`describe('humanChallengeGate')`** — four cases:
    - _off by default_: no provider env → `next()` called once, `header` never called.
    - _no token sent_: provider set → `next` not called, `response.status(401)`.
    - _valid token_: `fetch` mocked to `{ success: true }` → `next` called (verified after `process.nextTick`).
    - _provider throws_: `fetch` rejected → `next` not called, `response.status(401)` (fail-closed).

## Relationships

- **`src/infrastructure/http/middlewares/human-challenge.ts`** — the unit under test; the single import of `humanChallengeGate`.
- **`tests/support/express.ts`** — provides `makeResponseStub()` used to capture `status()` / `json()` calls without a real Express app.
- **`tests/support/stub.ts`** — provides `asStub<T>()` for typing the lightweight request objects passed to the middleware.

## Notes

- The middleware is invoked **synchronously** in every test (`humanChallengeGate(req, res, next)` with no `await`), but the two cases involving `fetch` rely on a single `await new Promise(process.nextTick)` to let the internal async chain settle before asserting. This means the middleware returns `void` (or a synchronously-completed promise) while performing async work internally.
- The "off costs nothing" test asserts `header` was **never called**, not merely that the token was absent — this is a deliberate perf/contract guarantee.
- The header name `x-antibot-challenge-token` is hard-coded in the stub; if the middleware changes the header name, the stub and this suite must be updated together.
- The suite does **not** exercise provider selection or Turnstile-specific validation logic; those live in `antibot-providers/index.test.ts`.
