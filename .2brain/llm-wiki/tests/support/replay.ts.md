---
source: tests/support/replay.ts
sha256: 006389493e2c0994f66a7fc843d7288495d49e7647de7a7ec499a01de771db83
generated_at: 2026-11-15T00:24:10.675565+00:00
model: ollama:qwen3.8:27b
---

# tests/support/replay.ts

## Purpose

Test helper that simulates a client sending the same idempotent request twice (as a retry after a lost response), handling the race where the ledger's "attempt done" flag is set before the response is awaited, causing the immediate retry to receive a 409 while the first request is still settling.

## Key elements

- **`sendTwice(send: () => PromiseLike<Response>)`** — Calls `send()` once for the initial response, then calls it again. If the retry receives a 409, it polls (up to 40 × 25 ms) until the status is no longer 409. Returns `{ first, retry }`.

## Relationships

- Consumed by every integration test in the graph neighbors (idempotent-create, idempotent-add, idempotent-note in orders and tasks) to assert the two-response contract of an idempotency-key replay.
- Also used by `tests/contract/product-write.test.ts` and `tests/cross-cutting/contract-search-parity.test.ts` for the same replay-then-verify pattern.

## Notes

- The 40 × 25 ms retry loop is a bounded back-off, not a configurable option; if a test times out in CI, the ceiling of ~1 s total wait may need raising.
- `send` is expected to be a zero-arg thunk (the test supplies the already-configured request), not a URL/method pair—callers wrap their supertest call in a closure.
- The 409 polling assumes the *only* reason for a 409 here is the ledger's un-awaited "done" mark; a genuine conflict (different body under the same key) would loop to exhaustion and return the last 409 as `retry`.
