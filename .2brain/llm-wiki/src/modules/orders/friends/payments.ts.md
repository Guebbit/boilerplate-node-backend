---
source: src/modules/orders/friends/payments.ts
source_sha256: ab0b0c544732f7424db2aaf6fbd003d3a41c8bb3a0861a600e94697e73a7d95c
context_sha256: 97e6365b0bdcba7f77cd640266d7b733ccdc355048f1f5d7ebc863a1cd653ac1
generated_at: 2026-11-22T06:14:52.423202+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/friends/payments.ts

## Purpose
Declares the narrow slice of the `orders` module that the `payments` module is allowed to call. It re-exports a single write operation, `markPaid`, because a settled payment is the only thing that moves an order to `paid`. It acts as a "friend" entry point in the DDD published-language style, as referenced by the file's header comment.

## Key elements
- `markPaid` — re-exported from `../services/status`. This is the file's only export, and it adds no logic of its own.

## Relationships
- **`src/modules/orders/services/status.ts`** — defines `markPaid`, which this file re-exports.
- **`src/modules/payments/services/settlement.ts`** — the `payments` side of the relationship. It is the expected consumer of this friend surface.
- **Test files** (orders outbox/timeline/contract tests, invoicing integration and contract tests, delivery service test) — listed as graph neighbors, so they likely depend on this file to move orders to `paid`. The file content doesn't show how they use it.

## Notes
- Keep this surface minimal. Only the one `orders` write that `payments` needs should be exported here.
- `payments` should import `markPaid` through this file, not directly from `orders/services/status`.
