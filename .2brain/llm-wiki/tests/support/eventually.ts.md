---
source: tests/support/eventually.ts
sha256: ed7e05bfcb36b0d399b1e9fce5de6c039e8a6e8ef3b514e457eb112abfa29ceb
generated_at: 2026-11-08T09:54:18.538103+00:00
model: ollama:qwen3.8:27b
---

# tests/support/eventually.ts

## Purpose

A shared polling/retry helper for tests that must wait on side effects the code under test does not await (detached mail enqueues, fire-and-forget notices, containers still starting up). It polls on a short interval rather than sleeping a fixed duration, so fast machines pay nothing and slow ones get the full window.

## Key elements

- **`pause(ms)`** — private; resolves after `ms` milliseconds. Shared by both exports.
- **`eventually(done, windowMs = 3000)`** — polls `done` (sync or async, may hit a DB) every 20 ms until it returns truthy or the window expires. Never throws; the caller's assertion is expected to fail with a meaningful message.
- **`retryUntil<T>(attempt, deadlineMs, intervalMs)`** — calls `attempt` repeatedly, waiting `intervalMs` between rejections, until it resolves or the deadline passes. On timeout the **last** rejection is rethrown so the test failure carries the real error (e.g. "container not ready").

## Relationships

- Consumed by integration and contract tests across **account**, **api-keys**, **cart**, **delivery**, **invoicing**, **observability**, and **payments** modules. Those tests use `eventually` to assert that an asynchronously-enqueued side effect (mail, status change, credit-note emission) has landed, and `retryUntil` to tolerate containers/sockets that are not yet accepting connections.
- `src/modules/invoicing/tests/factories.ts` is the only non-`.test.ts` neighbor; it likely calls `eventually`/`retryUntil` inside factory helpers so that any test consuming that factory inherits the same wait semantics.

## Notes

- `eventually` intentionally does **not** throw on timeout. If you need a failing assertion, follow the call with `expect(condition).toBe(true)` (or similar); do not rely on this helper to produce the failure message.
- `retryUntil` rethrows the **last** rejection, not the first — useful when the real cause (e.g. a specific HTTP 503) only appears on the final attempt.
- Default window for `eventually` is 3 s; `retryUntil` requires explicit `deadlineMs` and `intervalMs` (no defaults), making the caller state its tolerance.
