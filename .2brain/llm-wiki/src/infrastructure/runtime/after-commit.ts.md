---
source: src/infrastructure/runtime/after-commit.ts
sha256: 56e202df15f6e24430f52d92d462df5192759491e04e5c44b31f73b59069a8be
generated_at: 2026-10-29T02:14:23.252113+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/after-commit.ts

## Purpose

Provides a single utility (`afterCommit`) for executing best-effort follow-up work *after* a write has already committed (audit rows, image hand-offs, file cleanups, etc.). Because the primary write is already durable, any failure in the follow-up must not surface as an error to the caller — it is logged and swallowed, and the next step proceeds.

## Key elements

- **`afterCommit<T>(step, run, fallback, fields?)`** — The only export. Accepts a label, a sync-or-async step, a fallback value, and optional log fields. Always resolves: on success it returns the step's result; on failure it logs via `logger.error` (with the step name, fields, and error) and returns `fallback`. Never rejects, and one step failing does not prevent subsequent calls.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Direct dependency. `logger.error` is the sole side-effect on failure; no other logging path exists in this file.
- **`src/modules/example/services/cover.ts`**, **`src/modules/products/services/crud.ts`**, **`src/modules/users/services/image.ts`** — Consumers that import `afterCommit` to run post-commit housekeeping (e.g., image uploads, file deletions, audit inserts) without coupling their success/failure to the already-committed write.

## Notes

- The function is **never expected to throw**. Any caller that treats a rejection as an error will hit dead code; the contract is "always resolves."
- `fallback` is the value the caller would have received had the step been skipped. Pass it explicitly so the return type stays useful to the caller (e.g., `null`, a zeroed object).
- `fields` should include identifiers (`userId`, `productId`, etc.) to make log lines searchable; the step label alone is insufficient.
- Ordering is the caller's responsibility: `afterCommit` does not sequence multiple steps or guarantee they run before the HTTP response is sent.
