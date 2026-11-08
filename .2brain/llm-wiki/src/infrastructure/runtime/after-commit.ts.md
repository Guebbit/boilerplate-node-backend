---
source: src/infrastructure/runtime/after-commit.ts
sha256: 56e202df15f6e24430f52d92d462df5192759491e04e5c44b31f73b59069a8be
generated_at: 2026-11-08T03:45:45.225029+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/after-commit.ts

## Purpose

Provides a single helper for executing side-effects that must run *after* a write has already committed (audit rows, image hand-offs, file cleanup). Because the write is already durable, any failure in these steps must be swallowed — logged, not thrown — so the caller can return its normal success response.

## Key elements

- **`afterCommit<T>(step, run, fallback, fields?)`** — The sole export. Wraps `run` in a `Promise.resolve().then().catch()` chain. On rejection it logs an `error`-level message (including the `step` label and any `fields` for traceability) and resolves with `fallback`. Guarantees the returned promise never rejects.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Direct dependency. `afterCommit` calls `logger.error` to record each failed step.
- **`src/modules/products/services/crud.ts`**, **`src/modules/users/services/image.ts`**, **`src/modules/example/services/cover.ts`** — Consumers that call `afterCommit` to schedule their post-write side-effects (e.g. image processing, audit logging, file cleanup) without risking the original commit's success status.

## Notes

- The function is intentionally fire-and-forget: it does not propagate errors to the caller. Debugging failed steps requires searching the log for the `step` string and the `fields` payload.
- `fallback` should be the value the caller would have produced on the "happy" path, so that a failed side-effect is indistinguishable from "nothing to do" in the response.
- Because it returns `Promise<T>` even when `run` is synchronous, callers can `await` it without branching.
