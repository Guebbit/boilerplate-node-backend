---
source: src/modules/tickets/tests/factories.ts
sha256: d394734491f04125fbca840b8ba61d85afccaf84ba55e715e827330f9e253858
generated_at: 2026-10-29T06:06:32.710458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/factories.ts

## Purpose

Test-only factory for persisting ticket documents that bypass the domain rules a service layer would normally enforce. It exists so that tests can seed the database with a specific ticket state (e.g. a refund ticket awaiting manual action) without going through the production creation flow.

## Key elements

- **`createRefundTicket(subjectId?: string): Promise<TicketDocument>`** — Persists a system-sourced ticket of kind `manual_refund_owed` with routeSet `PaymentRefunding`. If a `subjectId` is supplied it is converted via `toObjectId` and attached; otherwise the ticket is stored without one. Delegates persistence to `ticketRepository.create`.

## Relationships

- **`src/modules/tickets/repository.ts`** — Consumes the `ticketRepository` instance to perform the actual `create` call.
- **`src/modules/tickets/model.ts`** — Imports the `TicketDocument` type used as the return type of `createRefundTicket`.
- **`src/types/index.ts`** — Imports `TicketKind` and `TicketSource` enums to populate the ticket's `kind` and `source` fields.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports `toObjectId` to convert a raw string ID into the ObjectId form the document expects.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** and **`src/modules/notifications/tests/integration/ticket-alerts.test.ts`** — Downstream test files that import `createRefundTicket` to seed the database before exercising their respective flows.

## Notes

- The module docblock explicitly states it is "so tests, and only tests, reach it" — do not call `createRefundTicket` from production code paths.
- The ticket is hardcoded to a single subject/message pair (`'A refund is owed by hand'` / `'Refund r1 needs a person.'`); it is not a generic ticket creator.
- `subjectId` is optional; when omitted the resulting document has no `subjectId` field at all (spread with `{}`), not a `null` or empty value.
