---
source: src/modules/payments/tests/unit/transfer-reference.test.ts
source_sha256: b76e44900bb2631530c3e19a20038e34870cc0d119042792f231aa761bb6df91
context_sha256: 1530614f8df1b64614d634fb5e4566425616b8c3816dd5183322de950eaa00bb
generated_at: 2026-11-22T07:06:39.800620+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/transfer-reference.test.ts

## Purpose
Unit tests for the RF transfer reference in `src/modules/payments/domain/transfer-reference.ts`. They cover the guarantees needed to match incoming money to the right order: a minted reference survives a round trip, and a mistyped character is rejected instead of silently resolving to another order.

## Key elements
- `ORDER_ID` — a fixed 24-hex-character ObjectId string used as the input for most tests.
- `describe('buildReference')`:
  - Output matches `/^RF\d{2}[\dA-Z]{19}$/`.
  - It is deterministic: the same order id gives the same reference.
  - Different order ids give different references (compared against `'000000000000000000000000'`).
- `describe('parseReference — the RF branch')`:
  - Round trip: `parseReference(buildReference(id))` returns the same reference.
  - Tolerates input split into 4-character groups with spaces and lowercased.
  - Rejects the reference when the last character is changed (a one-character typo); the test expects a `toBeNull()` result.
  - Rejects `'RF00NOTAREALREFERENCE'`, which looks structured but has the wrong length.
  - Rejects a raw ObjectId, in plain and spaced/uppercase form.
  - Rejects non-references (`'not-a-reference'`, `''`).

## Relationships
Imports `buildReference` and `parseReference` from `src/modules/payments/domain/transfer-reference.ts` (the code under test). It has no other dependencies and does no mocking.

## Notes
- A valid reference is 21 characters: `RF`, two digits, then 19 characters of digits or uppercase letters. This format check is the only structural detail the tests assert.
- The typo test swaps the last character for `'0'` or `'1'`, so the character always actually changes.
- Rejection is asserted via `toBeNull()`, so `parseReference` signals failure by returning a null value rather than throwing.
