---
source: src/modules/payments/domain/transfer-reference.ts
sha256: c58844ee901b82d7243bf821a2f5febb0c1a56033145eb2388835f1a60889a0f
generated_at: 2026-11-08T07:20:33.336110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/transfer-reference.ts

## Purpose

Implements ISO 11649 "RF" creditor-reference generation and validation for `bank_transfer` payments. A deterministic reference is minted from the order's ObjectId when the transfer opens; admins later paste the reference back from their bank's website, and this module verifies the Mod-97 check digits before any lookup proceeds.

## Key elements

- **`buildReference(seed: string): string`** — Converts a 24-hex ObjectId to a 19-char base-36 payload, appends two Mod-97 check digits, and returns the full `RF…` reference. Deterministic; no second write needed.
- **`parseReference(input: string): string | null`** — Strips whitespace, uppercases, validates the `RF` + 2-digit check + 1–21 payload shape, then confirms the Mod-97 remainder equals 1. Returns the normalized string or `null`.
- **`computeCheckDigits(payload: string): string`** — Internal. Computes the two-digit check value (`98 − remainder`) for a payload.
- **`remainder97(payload, checkDigits): bigint`** — Internal. Computes `BigInt(payload + "RF" + checkDigits) mod 97` after letter→digit substitution.
- **`numericStringFor(value: string): string`** — Internal. Maps `A`–`Z` to `10`–`35` via `replaceAll` so the resulting numeric string is unambiguous.
- **Constants** — `PAYLOAD_LENGTH` (19, fixed to avoid shape collision with 24-char hex), `CHECK_DIGIT_BASE` (98), `MOD97_DIVISOR` (`BigInt(97)`).

## Relationships

- **`domain/index.ts`** — Re-exports this module so sibling services can import from the domain barrel.
- **`services/transfer.ts`** — Calls `buildReference` with the order id when a `bank_transfer` payment is created.
- **`services/list.ts`** — Passes admin-supplied input through `parseReference` to filter transfers by reference.
- **`tests/unit/transfer-reference.test.ts`** — Unit-covers `buildReference` / `parseReference` round-trips and check-digit edge cases.
- **`tests/integration/transfer-reference-filter.test.ts`** — Exercises the `list`-service filter path end-to-end.
- **`tests/factories.ts`** — Uses `buildReference` to mint known references for test fixtures.

## Notes

- **ES6 target constraint:** `BigInt(97)` call form is used instead of the `97n` literal because `tsconfig` targets ES6; a `ts-check` run fails on the literal. An eslint-disable comment documents this at each site.
- **No persistence imports:** Consistent with every other `domain/` file in the repo — this module is pure computation.
- **Hand-rolled arithmetic:** `ibantools` (the payments module's IBAN/BIC library) lacks ISO 11649 support, so the Mod-97 logic lives here rather than in a dependency.
- **Grouping is display-only:** `buildReference` returns an ungrouped string; the frontend is responsible for inserting spaces every 4 characters, same convention as `bankTransferIbanFriendly` for IBANs.
- **`parseReference` also accepts 24-char hex payloads** (the regex allows `[\dA-Z]{1,21}` and the base-36 payload is 19 chars, but the regex is slightly permissive) — the Mod-97 check is what actually validates correctness.
