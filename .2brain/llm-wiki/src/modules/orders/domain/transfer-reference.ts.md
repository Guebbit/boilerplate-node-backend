---
source: src/modules/orders/domain/transfer-reference.ts
sha256: a3eff16beb96397c85456778e33a68d07e91f50f893afafab286735fd6644cce
generated_at: 2026-09-23T19:02:32.562537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/transfer-reference.ts

## Purpose

Mints and validates ISO 11649 "RF" creditor references for `bank_transfer` orders. The reference encodes the order's own ObjectId in base-36 with Mod-97 (ISO 7064 MOD 97-10) check digits so a mistyped code is rejected rather than silently matching the wrong order. It lives in `orders` (not `payments`) because the reference is deterministic from the order id and is written atomically with the order row; `payments` only reads it back.

## Key elements

- **`buildReference(seed: string): string`** — Converts a 24-char hex ObjectId to a 19-char base-36 uppercase payload, computes the two check digits, and returns the full `RF`-prefixed reference (ungrouped).
- **`parseReference(input: string): string | null`** — Normalises pasted admin input (strips whitespace, uppercases), extracts check digits + payload via regex, verifies the Mod-97 remainder equals 1, and returns the normalised reference or `null`.
- **`computeCheckDigits(payload: string): string`** — Internal; `98 − (numericString(payload+"RF00") mod 97)`, zero-padded to 2 digits.
- **`remainder97(payload, checkDigits): bigint`** — Internal; `BigInt(numericStringFor(payload + "RF" + checkDigits)) % 97n`.
- **`numericStringFor(value: string): string`** — Internal; maps A–Z → 10–35 (two digits each) so the result is a pure numeric string for `BigInt` arithmetic.
- **`PAYLOAD_LENGTH = 19`** — Fixed base-36 length guaranteeing every reference is the same size and never collides in shape with the 24-char hex fallback.
- **`CHECK_DIGIT_BASE = 98`** — The `98 − remainder` subtraction constant (always yields a 2-digit result in `[2, 98]`).

## Relationships

- **`src/modules/orders/domain/index.ts`** — Re-exports this module's public API (`buildReference`, `parseReference`) as part of the `orders` domain barrel.
- **`src/modules/orders/services/place.ts`** — Calls `buildReference(orderId)` when writing a `bank_transfer` order, stamping the reference onto the row in the same atomic write.
- **`src/modules/payments/services/lookup.ts`** — Imports `parseReference` to validate the code an admin pastes, then looks up the order by the normalised reference.
- **`src/modules/orders/tests/unit/transfer-reference.test.ts`** — Unit tests for `buildReference` round-tripping and `parseReference` acceptance/rejection.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** — Contract-level tests that exercise the lookup endpoint's handling of RF references.
- **`src/modules/payments/tests/integration/lookup.test.ts`** — Integration tests covering the full `parseReference` → order-lookup path.

## Notes

- **No persistence imports.** Follows the repo convention that `domain/` files are pure functions with zero I/O or database dependencies.
- **`BigInt(97)` instead of `97n`.** The repo's `tsconfig.json` targets ES6; a `bigint` literal requires ES2020. An explicit `// eslint-disable-next-line unicorn/prefer-bigint-literals` comment documents this at each call site.
- **Hand-rolled, not `ibantools`.** The `payments` module's IBAN library has no ISO 11649 support, and the arithmetic here is small enough that a dependency adds no value (see `docs/modules/payments.md#libraries`).
- **Deterministic by construction.** Because the payload is the order id itself (base-36), two different orders can never produce the same reference — no hash collision risk, no second write to record the reference.
- **Display grouping is the frontend's job.** `buildReference` returns the ungrouped string; splitting into 4-character blocks for display mirrors what `bankTransferIbanFriendly` does for IBANs.
