---
source: src/modules/returns/domain/statement.ts
sha256: 9aa8077d963d71c754c44eeedf3ad56695a7ddc1183830d5e3c20034d8668c35
generated_at: 2026-11-08T07:58:48.652110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/statement.ts

## Purpose

Defines the "statement" — the date (`requestedAt`) and channel (`statedVia`) recorded when a buyer or staff member makes a return request or withdrawal. Provides a single pure validation function (`checkStatement`) that enforces *who* may supply each field and whether the supplied date is plausible, encoding the rule that timing is judged on the day the message was **sent**, not read (CRD Art. 11(2)).

## Key elements

- **`StatementInput`** (interface) — The input contract: caller identity (`byBuyer`), `reason`, `kind`, optional caller-supplied `requestedAt` / `statedVia`, plus `orderCreatedAt` and `now` for range checks.
- **`Statement`** (interface) — The value to persist: `requestedAt: Date` and, on a withdrawal only, `statedVia: ReturnStatementChannel`.
- **`StatementVerdict`** (type) — Discriminated union: `{ ok: true } & Statement` or `{ ok: false, field, reason }` where `reason` is one of `'forbidden' | 'required' | 'future' | 'before-order'`.
- **`rangeRefusal`** (private) — Rejects a date that is after `now` or before `orderCreatedAt`; returns the applicable reason or `undefined`.
- **`staffStatement`** (private) — Validates the staff path: withdrawal requires both fields; non-withdrawal `cancellation` forbids `requestedAt`; non-withdrawal forbids `statedVia`.
- **`checkStatement`** (exported) — Public entry point. If `byBuyer`, rejects any caller-supplied field and stamps `now` / `'online'` (on withdrawal). Otherwise delegates to `staffStatement`.

## Relationships

- **`./lifecycle.ts`** — Imports `ReturnKind` and `ReturnReason` types used in `StatementInput` and the validation logic.
- **`@types` (`src/types/index.ts`)** — Imports `ReturnStatementChannel` and `StaffStatementChannel`.
- **`services/create.ts`** — Calls `checkStatement` when a new return is opened.
- **`services/cancel-remainder.ts`** — Calls `checkStatement` for remainder-cancellation requests.
- **`services/outcome.ts`** — Calls `checkStatement` when recording a withdrawal or staff-initiated action.
- **`domain/index.ts`** — Barrel re-exports of this module's public API.
- **`tests/unit/domain.test.ts`** — Unit tests exercising the buyer/staff branches and edge cases.

## Notes

- **Pure module.** No I/O, no clock reads beyond the `now` the caller passes; safe to test in isolation.
- **Buyer path is minimal.** The buyer never supplies `requestedAt` or `statedVia`; the server stamps them. Any attempt to send either is rejected as `'forbidden'`.
- **Backdating is allowed for staff**, with only two bounds: not in the future, not before the order was created. The audit trail (staff identity) is the only other safeguard.
- **`statedVia` is withdrawal-only.** On any non-withdrawal reason it must be absent; on a withdrawal it is mandatory for staff and auto-set to `'online'` for the buyer.
- **`cancellation` kind + non-withdrawal reason** is a special case: `requestedAt` is explicitly forbidden because a remainder cancel carries no "asking date."
