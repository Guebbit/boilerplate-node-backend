---
source: tests/support/eventually.ts
sha256: ed7e05bfcb36b0d399b1e9fce5de6c039e8a6e8ef3b514e457eb112abfa29ceb
generated_at: 2026-10-29T07:07:43.803773+00:00
model: ollama:qwen3.8:27b
---

# tests/support/eventually.ts

## Purpose

Shared test-support helpers for waiting on side effects that the code under test deliberately does not await (detached mail enqueues, fire-and-forget notices, container readiness). Rather than sleeping a fixed duration, both helpers poll, so a fast machine pays nothing extra while a slow one gets the full window.

## Key elements

- **`pause(ms)`** — internal; wraps `setTimeout` in a `Promise<void>`. Shared by both exports.
- **`eventually(done, windowMs?)`** — polls `done()` (sync or async boolean) every 20 ms until it returns `true` or `windowMs` (default 3000) elapses. Resolves silently on timeout; it never throws. The caller's subsequent assertion is expected to produce the meaningful failure message.
- **`retryUntil<T>(attempt, deadlineMs, intervalMs)`** — calls `attempt()` and, on rejection, retries after `intervalMs` until `deadlineMs` has passed. Re-throws the **last** rejection. Use for one-off resource readiness (e.g. a container or socket not yet accepting connections) where the final error *is* the diagnostic.

## Relationships

Both exports are imported by integration and contract tests across the account, api-keys, cart, delivery, invoicing, observability, and payments modules. Typical callers:

- Invoicing factories (`src/modules/invoicing/tests/factories.ts`) use `retryUntil` to wait for a database or service to become reachable before seeding.
- Integration tests (e.g. `reset-request-timing.test.ts`, `order-status-races.test.ts`, `external-refunds.test.ts`) call `eventually` to assert that a side effect (a row was written, a status flipped) landed after the action under test returned.
- Contract tests (e.g. `lifecycle.contract.test.ts`, `shop.contract.test.ts`, `api.contract.test.ts`) use the same pair to confirm API-visible state changes without hard-coded sleeps.

## Notes

- `eventually` **resolves** (not rejects) when the window closes. The test author must follow it with an explicit assertion; otherwise a missed condition passes silently.
- `retryUntil` rethrows the **last** error, not the first. If the failure mode changes between attempts, only the final one surfaces in the stack trace.
- Polling interval in `eventually` is hardcoded to 20 ms; in `retryUntil` it is caller-supplied. Don't pass `intervalMs` of 0 — the recursive `.then(run)` will starve the event loop.
