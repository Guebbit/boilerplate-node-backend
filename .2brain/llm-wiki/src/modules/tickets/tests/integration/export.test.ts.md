---
source: src/modules/tickets/tests/integration/export.test.ts
sha256: ceb77a6e3db614b663221510f5afe331d3e327937066818a6991cd0a5035cf68
generated_at: 2026-10-29T06:06:57.992334+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/export.test.ts

## Purpose

Integration tests for the two personal-data export sections exposed by the tickets module (`tickets` and `systemTickets`). Verifies the ownership rules (account-ID match always; address match only when the account has verified that address), the GDPR Art. 12(6) "prove identity before disclosing" requirement, and data-minimization constraints (staff IDs, dedup keys, and internal fields must not appear in the export output).

## Key elements

- **`subject(emailVerified)`** – builds the account object passed to the export collector; toggles the `emailVerified` flag to simulate proven/unproven addresses.
- **`fileTicket(email?, subjectId?, message?)`** – convenience wrapper around `ticketService.create` that files a ticket under a given address and/or account.
- **`exportedMessages(emailVerified)`** – calls the tickets-section `collect`, then extracts and sorts the `message` field for deterministic assertions.
- **`collect`** – destructured from `ticketsModule.personalData[0]`; the tickets-section collector invoked the same way the `account` module would call it.
- **`collectSystem`** – destructured from `ticketsModule.personalData[1]`; the systemTickets-section collector.
- **`aboutAccount()`** – inserts a system ticket (manual refund owed) directly via `ticketRepository.create`, bypassing the service layer.
- **`describe('the tickets section of an export')`** – 8 test cases covering: proven address inclusion, pre-signup tickets, signed-in-with-different-address, unproven address exclusion, cross-account/cross-address exclusion, empty-array guarantee, filer-provided metadata (category, orderNumber), and staff-field stripping (status, respondedAt, note body/at present; authorId absent).
- **`describe('the systemTickets section of an export')`** – 2 test cases covering: ticket + notes exported without assigneeId/openKey/authorId, and empty-array + cross-account exclusion.

## Relationships

- **`src/modules/tickets/module.ts`** – the test destructures `personalData` collectors from the exported module to invoke them exactly as the account-export pipeline does.
- **`src/modules/tickets/service.ts`** – `ticketService` is used to create, resolve, and annotate tickets (the normal application path).
- **`src/modules/tickets/repository.ts`** – `ticketRepository` is used for direct DB inserts when testing system tickets that the service layer does not create.
- **`src/types/index.ts`** – supplies the `TicketKind`, `TicketLinkType`, and `TicketSource` enums used to shape system-ticket fixtures.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` produces the staff identity passed to resolve/addNote calls.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises a clean in-memory (or test) MongoDB before any test runs.

## Notes

- The ownership model tested here is **two-pronged**: a ticket belongs to the subject if (a) its `subjectId` equals the account's `_id`, **or** (b) its `email` matches the account's address **and** the account has verified that address. An unproven address match must *not* grant access.
- Both collectors are expected to return an **empty array** (not `null`/`undefined`) when no tickets are found; this is asserted explicitly.
- Assertions use `toEqual` on sorted message arrays to avoid ordering sensitivity, and `toMatchObject` / `toHaveProperty` / `not.toHaveProperty` to verify presence and absence of specific fields.
- The `openKey` field (a server-side deduplication key) must never leak into the export; this is checked both via `not.toHaveProperty` and a full `JSON.stringify` scan for `authorId`.
