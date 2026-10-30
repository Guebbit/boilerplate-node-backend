---
source: src/modules/payments/domain/transfer-reference.ts
sha256: c58844ee901b82d7243bf821a2f5febb0c1a56033145eb2388835f1a60889a0f
generated_at: 2026-10-29T05:05:37.365364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/transfer-reference.ts

## Purpose

Mints and validates the ISO 11649 "RF" creditor reference attached to a `bank_transfer` payment. The reference is derived deterministically from the order's ObjectId so a redelivered `order.created` event can never produce a second code, and ISO 7064 MOD 97-10 check digits ensure a mistyped code is rejected rather than matching the wrong order. The arithmetic is hand-rolled because `ibantools` (the repo's IBAN/BIC library) has no ISO 11649 support.

## Key elements

- **`buildReference(seed: string): string`** — Encodes a 24-char hex ObjectId as base-36 (padded to 19 chars), computes two MOD 97-10 check digits, and returns the full ungrouped reference (e.g. `RF132EY8H44VJAVZKX80JRL`). Display grouping is the frontend's responsibility.
- **`parseReference(input: string): string | null`** — Normalises whitespace and case, matches the `RF<2-digit-check><payload>` shape, verifies the MOD 97-10 check digits, and returns the canonical string or `null`.
- **`PAYLOAD_LENGTH`** (19) — Fixed base-36 length so every reference is uniform in size and the payload shape cannot collide with the 24-char hex fallback mentioned in the comment.
- **`numericStringFor`** — Maps `A`–`Z` → `10`–`35` (two digits each) via a single `replaceAll` regex, keeping the result positionally unambiguous.
- **`remainder97` / `computeCheckDigits`** — Internal MOD 97-10 helpers; the check digits are computed over `payload + "RF" + "00"`, not the written order of the reference.

## Relationships

- **`src/modules/payments/domain/index.ts`** — Barrel file for the `domain/` layer; re-exports `buildReference` and `parseReference`.
- **`src/modules/payments/services/transfer.ts`** — Calls `buildReference` when opening a `bank_transfer` payment, passing the order's id.
- **`src/modules/payments/services/list.ts`** — Uses `parseReference` to normalise an admin-supplied filter value before the DB lookup (`getByTransferReference`).
- **`src/modules/payments/tests/factories.ts`** — Test factory likely calls `buildReference` to produce valid references for fixtures.
- **`src/modules/payments/tests/unit/transfer-reference.test.ts`** — Unit tests for `buildReference` and `parseReference` round-trips and rejection cases.
- **`src/modules/payments/tests/integration/transfer-reference-filter.test.ts`** — Integration test covering the list-filter path that depends on `parseReference`.

## Notes

- **ES6 target / BigInt literals** — `BigInt(97)` is used instead of `97n` because `tsconfig.json` targets ES6; the `unicorn/prefer-bigint-literals` rule is suppressed at each site.
- **No persistence imports** — Consistent with every other `domain/` file in the repo; this module is pure arithmetic.
- **Not a hash** — The payload is a reversible base-36 encoding of the ObjectId, so two different orders are collision-free by construction (unlike a truncated hash).
- **`numericStringFor` uses `replaceAll` with a regex** rather than `split`/`map` to avoid any ambiguity with multi-code-point characters, even though the input alphabet is ASCII-only.
- **Check-digit computation order** — Digits are verified over `payload + "RF" + checkDigits` (ISO 7064's internal order), which differs from the written `RF + checkDigits + payload` form an admin sees.
