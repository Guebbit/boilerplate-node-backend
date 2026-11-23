---
source: src/modules/payments/domain/transfer-reference.ts
source_sha256: 804aeaae2032468404dd4f493420cb53dc774cfb66958fe1d7b4bb86ccf32a98
context_sha256: efb49a036d1de2fcfa3f3ce304b1b6664a6325a1d3e9af0a287d6083034a1fe8
generated_at: 2026-11-22T06:44:42.228955+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/domain/transfer-reference.ts

## Purpose
Builds and parses the ISO 11649 "RF" creditor reference carried by a `bank_transfer` payment. A customer writes the code into their bank transfer, and an admin later pastes it back from the bank's website. Mod-97 check digits (ISO 7064 MOD 97-10, the scheme IBAN uses) mean a mistyped code is rejected instead of matching the wrong order. The reference is derived deterministically from the order's id, so a redelivered `order.created` can't mint a second, different reference. The file is hand-rolled because `ibantools` has no ISO 11649 support, and it imports no persistence code, like the other `domain/` files.

## Key elements
- `buildReference(seed)`: takes the order id as 24 hex characters (an ObjectId hex string). It converts the id to base-36 uppercase and left-pads it with `0` to 19 characters. It then returns `RF` + 2 check digits + payload. The result is ungrouped, e.g. `RF132EY8H44VJAVZKX80JRL`.
- `parseReference(input)`: strips all whitespace and uppercases the input. It requires the shape `RF` + 2 digits + 1–21 alphanumerics, then verifies the checksum. It returns the normalized reference, or `null` if the shape or checksum is invalid.
- Internal helpers:
  - `PAYLOAD_LENGTH` (19): base-36 digits needed to hold 96 bits, so all references are the same length.
  - `CHECK_DIGIT_BASE` (98): the base for computing the check digits.
  - `numericStringFor`: maps letters to two-digit numbers (`A`=10 … `Z`=35) via a regex `replaceAll`.
  - `remainder97`: computes the mod-97 remainder over `payload + "RF" + checkDigits` as a `BigInt`.
  - `computeCheckDigits`: returns `98 - remainder` of the payload with `"00"` as check digits, zero-padded to 2 digits.

## Relationships
- Graph neighbors: `src/modules/payments/domain/index.ts`, `src/modules/payments/services/transfer.ts`, `src/modules/payments/services/list.ts`, `src/modules/payments/tests/factories.ts`, `src/modules/payments/tests/unit/transfer-reference.test.ts` and `src/modules/payments/tests/integration/transfer-reference-filter.test.ts`. Only the following is visible in this file:
- The `parseReference` doc comment says its output is what `getByTransferReference` looks up by.
- The module doc says the reference is minted when the transfer payment opens. That is presumably the transfer service's job (`src/modules/payments/services/transfer.ts`), but the file doesn't show it.
- The two test files and `src/modules/payments/tests/factories.ts` are the likely consumers for coverage and fixtures. Nothing in this file confirms how they use it.

## Notes
- The checksum is computed over `payload + "RF" + checkDigits`, not the written order `RF` + check digits + payload.
- Collision-free by construction: base-36 encodes every bit of the id, whereas a hash could collide.
- Grouping into blocks of 4 for display is left to the frontend, as with `bankTransferIbanFriendly` for the IBAN.
- `BigInt(97)` and `BigInt(1)` are used instead of bigint literals because `tsconfig.json` targets ES6 (literals need ES2020). The `unicorn/prefer-bigint-literals` lint rule is disabled inline for this.
- `parseReference` accepts payloads of 1–21 characters, which is looser than the fixed 19 that `buildReference` produces.
- The module doc points to a `libraries` section of the payments module docs, but the referenced doc file is not part of this repository's known files.
