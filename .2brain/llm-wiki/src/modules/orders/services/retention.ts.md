---
source: src/modules/orders/services/retention.ts
sha256: a8141cdf63282aa4156e4f634923c02077ee82dd07b8c026dcbf68207d7c82ba
generated_at: 2026-09-23T19:08:24.998078+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retention.ts

## Purpose

Implements the two-phase PII lifecycle for orders after account erasure. Because an order is an invoice, it is retained under Art. 17(3)(b)/(e) regardless of the account's fate. This file detaches the person from the order immediately, then (via a later sweep) scrubs residual PII once a statutory retention window elapses.

## Key elements

- **`detachUserId(userId: string): Promise<void>`** — `USER_DELETED` listener. Unsets `userId` on all of the account's orders and stamps each with an `anonymizeAfter` timestamp (`now + NODE_ORDER_PII_RETENTION_DAYS`). Logs the count when > 0.
- **`anonymizeDueOrders(): Promise<number>`** — Intended to be called by `scripts/ops/reap-orders.ts`. Scrubs PII on every order whose `anonymizeAfter` date has passed. Returns the number of rows affected.

## Relationships

- **`src/modules/orders/repository.ts`** — delegates the actual DB mutations (`orderRepository.detachUserId`, `orderRepository.scrubDueForAnonymization`).
- **`src/infrastructure/adapters/logger.ts`** — emits `info`-level log entries when either operation touches > 0 rows.
- **`src/infrastructure/runtime/environment.ts`** — reads `NODE_ORDER_PII_RETENTION_DAYS` (default 3650, min 1) via `environmentNumber`.
- **`src/modules/orders/services/index.ts`** — barrel file; re-exports these functions for consumers.
- **`src/modules/orders/module.ts`** — registers `detachUserId` as the handler for the `USER_DELETED` event.

## Notes

- **Two-phase design.** `detachUserId` runs synchronously at deletion time; `anonymizeDueOrders` runs on a separate schedule (the `reap-orders` ops script). The repository layer is responsible for the actual `anonymizeAfter` comparison.
- **Config.** Retention is controlled by `NODE_ORDER_PII_RETENTION_DAYS` (seconds-based `environmentNumber`, min 1). Default is 3650 days (~10 years).
- **Mutation-testing guards.** Both `logger.info` calls are annotated `// Stryker disable next-line all` to suppress mutation coverage on the logging statements.
