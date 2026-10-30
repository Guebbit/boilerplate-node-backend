---
source: src/modules/tickets/tests/unit/schema-contract.test.ts
sha256: 48a383afcbbdc546b230ba25674e9abb2de9acf8a23d0130e939739269cf366f
generated_at: 2026-10-29T06:09:39.511484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for the `ticketSchema` Zod schema. They pin the policy decisions encoded in the model — which fields a stranger must supply to reach an operator, which fields only an operator fills, what the status enum permits, and which indexes (including the TTL retention index) exist. The tests are the executable specification: if the schema drifts, these fail.

## Key elements

- **`RETENTION_SECONDS`** – Computed at module load from `currentEnvironment().NODE_TICKETS_RETENTION_DAYS ?? 730`. Used to assert the TTL value without hard-coding a literal, so config and test move together.
- **`describe('ticketSchema')`** – Single top-level block containing eight focused assertions:
  - Required paths are exactly `['message', 'routeSet', 'subject']` (email is a *service-layer* concern, not a schema concern).
  - `name` is absent from required paths.
  - `respondedAt` and `closedAt` have **no** defaults (they are written by the operator's reply, not by submission).
  - `status` defaults to `TicketStatus.new` and is constrained to the `TicketStatus` enum values.
  - Full list of index specs (7 compound/single-field indexes).
  - `timestamps` option is `true`.
  - `indexOptionSpecs` — partial filter expressions on 6 indexes and `expireAfterSeconds` on exactly `closedAt_1`.
  - The TTL index is single-field ascending (`closedAt_1: closedAt+1`), distinct from the compound queue index where `closedAt` appears descending.

## Relationships

- **`src/modules/tickets/model.ts`** — Exports `ticketSchema`, the system under test.
- **`src/types/index.ts`** — Exports `TicketStatus` enum, used to validate the `status` field's allowed values.
- **`tests/support/schema.ts`** — Provides the schema-introspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that turn a Zod schema into plain comparable arrays/objects.
- **`src/infrastructure/config/store.ts`** — Exports `currentEnvironment()`, used to derive `RETENTION_SECONDS` so the TTL assertion tracks the configured value.

## Notes

- **TTL index direction matters.** MongoDB only honours `expireAfterSeconds` on a *single-field ascending* index. The compound `routeSet_1_status_1_dueAt_1` index contains `closedAt` in descending order and must *not* carry the TTL option; the test asserts exactly one `expireAfterSeconds` entry.
- **`email` is intentionally not in the schema's required list.** The service layer adds it for visitor tickets; a system ticket has no sender. The test documents this split of responsibility.
- **Retention is env-driven.** Changing `NODE_TICKETS_RETENTION_DAYS` updates the expected TTL without touching the test file, but a TTL appearing on the *wrong* index will still fail the assertion.
