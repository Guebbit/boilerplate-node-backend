---
source: src/modules/orders/domain/transfer-reference.ts
sha256: 6d89d390d7eb5ebf7ee65753ca8675e6328a0bbaa07914928c27dca603b881e8
generated_at: 2026-09-27T15:10:03.606102+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/transfer-reference.ts

## Purpose

Implements ISO 11649 "RF" creditor reference generation and validation for `bank_transfer` orders. `buildReference` deterministically mints a checksummed reference from an order's ObjectId at write time; `parseReference` reads one back from an admin's paste-off-the-bank-website input. Lives in the **orders** domain (not payments) because the reference is derived from the order's own id and must be stable across retries.

## Key elements

- **`buildReference(seed: string): string`** (exported) — Takes a 24-char hex ObjectId, encodes it as a 19-char base-36 payload, computes two MOD 97-10 check digits, and returns the full `RF##` reference (e.g. `RF132EY8H44VJAVZKX80JRL`). Deterministic; no randomness or second write needed.
- **`parseReference(input: string): string | null`** (exported) — Normalises whitespace/case, validates shape via regex (`RF` + 2 digits + 1–21 alphanumeric), verifies the MOD 97-10 check digits, and returns the canonical form or `null`.
- **`computeCheckDigits`** (internal) — Computes the two check digits for a payload via `98 − mod97(payload + "RF" + "00")`.
- **`remainder97`** (internal) — Core MOD 97-10 arithmetic over the concatenated payload + `"RF"` + check-digit string.
- **`numericStringFor`** (internal) — Maps `A`–`Z` → `10`–`35` per ISO 7064 so the numeric string is unambiguous.
- **`PAYLOAD_LENGTH` = 19** — Fixed base-36 length to cover any 96-bit value; keeps all references the same size.
- **`MOD97_DIVISOR` = `BigInt(97)`** — Module-level constant for the modulus.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Barrel file; re-exports this module's public API (`buildReference`, `parseReference`) to the rest of the orders domain.
- **`src/modules/orders/services/place.ts`** — Calls `buildReference` atomically when persisting a `bank_transfer` order, stamping the reference onto the order document in the same write.
- **`src/modules/payments/services/lookup.ts`** — Imports `parseReference` to validate and normalise the reference an admin submits before looking up the associated order.
- **`src/modules/orders/tests/unit/transfer-reference.test.ts`** — Unit tests covering `buildReference` round-trips, check-digit edge cases, and `parseReference` rejection paths.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** & **`src/modules/payments/tests/integration/lookup.test.ts`** — Exercise `parseReference` indirectly through the payments lookup endpoint's contract and integration suites.

## Notes

- **No external dependency.** Hand-rolled because `ibantools` (used elsewhere in `payments`) has no ISO 11649 support. See `docs/modules/payments.md#libraries`.
- **`BigInt(97)`, not `97n`.** The repo's `tsconfig.json` targets ES6; a `bigint` literal requires ES2020. Two `eslint-disable` lines mark the affected spots.
- **No persistence imports.** Consistent with the repo's `domain/` convention — this file is pure logic.
- **Display grouping is not this file's job.** `buildReference` returns the ungrouped string; formatting into 4-char blocks is a frontend concern (analogous to `bankTransferIbanFriendly`).
- **`parseReference` regex allows payload length 1–21**, slightly wider than the 19-char length `buildReference` always produces, to tolerate the hex-fallback shape noted in the `PAYLOAD_LENGTH` comment.
