---
source: src/modules/returns/domain/statement.ts
sha256: 9aa8077d963d71c754c44eeedf3ad56695a7ddc1183830d5e3c20034d8668c35
generated_at: 2026-10-29T05:38:26.224686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/statement.ts

## Purpose

Domain rule that decides what statement (date + channel) a return is written with, depending on whether the caller is the buyer or a staff member. It encodes the CRD Art. 11(2) timing rule (a withdrawal is judged on the day it was *sent*, not read) and enforces which fields each caller may or must supply. Pure, synchronous, no I/O.

## Key elements

- **`StatementInput`** – the shape `checkStatement` reads: `byBuyer`, `reason`, `kind`, optional `requestedAt`/`statedVia`, plus `orderCreatedAt` and `now` for range checks.
- **`Statement`** – the result written to the return: `requestedAt` (always) and `statedVia` (withdrawal only).
- **`StatementVerdict`** – discriminated union: `{ ok: true } & Statement` or `{ ok: false, field, reason }`.
- **`checkStatement`** *(exported)* – the single public entry point. Routes to the buyer path (rejects any caller-supplied fields; stamps `now`, adds `statedVia: 'online'` for withdrawals) or the staff path.
- **`staffStatement`** *(internal)* – validates staff-supplied fields: withdrawal requires both fields; non-withdrawal cancellations forbid `requestedAt`; remainder cancels take neither; dates must fall within `[orderCreatedAt, now]`.
- **`rangeRefusal`** *(internal)* – small helper that flags a date as `'future'` or `'before-order'`.

## Relationships

- **`./lifecycle.ts`** – supplies the `ReturnKind` and `ReturnReason` types that drive the required/forbidden field logic.
- **`@types` (`src/types/index.ts`)** – supplies `ReturnStatementChannel` and `StaffStatementChannel` used in the field types.
- **`services/create.ts`, `services/cancel-remainder.ts`, `services/outcome.ts`** – callers that build a `StatementInput` and store or reject based on the `StatementVerdict`.
- **`domain/index.ts`** – barrel that re-exports `checkStatement` and the type interfaces for the rest of the module.
- **`tests/unit/domain.test.ts`** – unit tests covering the buyer/staff branches and the range checks.

## Notes

- `statedVia` is an optional property on `Statement` (present only for withdrawals), but `checkStatement` still returns it as part of the success verdict via a conditional spread. Callers should not assume the key exists on a non-withdrawal.
- The buyer path is intentionally total: any `requestedAt` or `statedVia` present in the input is a hard `"forbidden"` rejection, even if the value would otherwise be valid. The server is the sole authority on these fields for buyer-initiated returns.
- Backdating by staff is permitted (no lower bound beyond `orderCreatedAt`); the audit row names the staff member. There is no "grace period" or rounding.
- `kind === 'cancellation'` with a non-withdrawal reason forbids `requestedAt` entirely — a "remainder cancel" has no concept of a request date.
