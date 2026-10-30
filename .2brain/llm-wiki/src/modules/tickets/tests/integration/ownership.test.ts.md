---
source: src/modules/tickets/tests/integration/ownership.test.ts
sha256: fb22db871112eb56f5dfc1190d970e96db720cd24a5c772ad45f8e7d004ec8f1
generated_at: 2026-10-29T06:07:25.888904+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/ownership.test.ts

## Purpose

Integration tests for the tickets module's personal-data ownership semantics. Verifies two invariants: (1) the `POST /tickets` endpoint records the signed-in sender's `subjectId`, and (2) the `PersonalDataEraser` hook deletes or detaches exactly the set of tickets the module's `collect` export lists — no more, no less — including transactional rollback.

## Key elements

- **`collect`** — the `personalData[0].collect` function from the tickets module manifest; the "export" that lists a person's tickets.
- **`erase(subject, session)`** — wraps `personalData[0].erase` (the erasure hook); throws if the hook is absent. Mirrors how `users` and `account` modules invoke it.
- **`fileTicket(email, message, subjectId?)`** — creates a user-filed ticket via `ticketService.create`.
- **`systemTicket(link, extra?)`** — creates a system ticket (`TicketSource.system`, `TicketKind.account_review`) directly in the repository.
- **`storedMessages()`** — fetches all ticket messages sorted, used as a before/after assertion helper.
- **`subject(emailVerified)`** — builds the `PersonalDataEraser` subject payload for `ACCOUNT_ID`.
- **`FORM`** — a valid contact-form body for the HTTP tests.
- **Three `describe` blocks:**
  - `POST /tickets records who sent it` — API-level: subjectId recorded for auth'd senders, absent for anonymous/bad-token.
  - `erasing the system tickets about a person` — system tickets *about* the account are deleted; tickets that *outlive* the account (e.g. linked to an order) are kept but have `subjectId` nulled; staff erasure nulls `assigneeId` and `notes[].authorId` while preserving note body.
  - `erasing a person's tickets` — user-filed tickets deleted by ID (even with a different email) or by verified email; other accounts' tickets and unverified email matches survive; rollback on mid-transaction failure; the removed set equals the exported set.

## Relationships

- **`src/modules/tickets/module.ts`** — the sole source of `collect` and `erase`; tests access them via `ticketsModule.personalData[0]`, the same path other modules use.
- **`src/modules/tickets/service.ts`** — `ticketService.create` files tickets in the "sender" tests.
- **`src/modules/tickets/repository.ts`** — `ticketRepository` used for direct inserts (`systemTicket`) and post-erasure assertions.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps every erase call so tests can verify atomic rollback.
- **`src/kernel/registry.ts`** — `PersonalDataEraser` type constrains the `erase` wrapper signature.
- **`src/types/index.ts`** — `TicketKind`, `TicketLinkType`, `TicketSource` enums used by `systemTicket`.
- **`tests/support/http.ts`** — `api()` and `authenticateAs()` power the HTTP-level describe block.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB once per file.

## Notes

- `collect` and `erase` are **not** imported as named exports; they are pulled from the module manifest at index 0. This deliberately mirrors the consumer path (`users`, `account`) so the test exercises the real wiring.
- The "removes exactly the set the export lists" test is the core contract: it calls `collect` *before* `erase`, then asserts `removed === exported` as sorted arrays. If the module's export and erasure logic drift, this test catches it.
- `systemTicket` uses `subjectId: new Types.ObjectId(ACCOUNT_ID)` by default but can be overridden via the `extra` spread (as the staff-erasure test does with `OTHER_ACCOUNT_ID`).
- The bad-token test (`not-a-valid-signature`) asserts a **201** (not 401/403): an invalid token degrades to anonymous, it does not reject the request.
- Erasure of staff removes identity references (`assigneeId`, `notes[].authorId`) but preserves the note body text — the ticket remains readable by other staff.
