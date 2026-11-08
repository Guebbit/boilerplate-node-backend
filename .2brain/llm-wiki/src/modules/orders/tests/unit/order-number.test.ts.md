---
source: src/modules/orders/tests/unit/order-number.test.ts
sha256: bd098ea76489ec2080e92dc28c4406883366dfc87717da952a6a4d1989267a22
generated_at: 2026-11-08T07:13:02.724695+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/order-number.test.ts

## Purpose

Unit tests for the `parseOrderNumber` utility in the orders module. It verifies that customer-supplied order numbers (with varied formatting) normalize to the canonical `YYYY-NNNNNN` stored form, and that malformed inputs are rejected with `undefined`.

## Key elements

- **`describe('parseOrderNumber', …)`** — single suite covering the one imported function.
- **Happy-path `it.each` table** — six raw → canonical pairs exercising: exact match, leading/trailing whitespace, `#` prefix, `# ` prefix, short sequence (zero-padded to 6 digits), and zero (`'2026-0'` → `'2026-000000'`).
- **Rejection `it.each` list** — nine invalid inputs (empty string, bare number, bare `#`, two-digit year, missing sequence, non-numeric tail, wrong separator, over-length sequence, non-numeric string). Each must produce `undefined`.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** — sole dependency; exports `parseOrderNumber`, the function under test. No other files are imported or referenced.

## Notes

- The canonical format is a 4-digit year, hyphen, and a 6-digit zero-padded sequence (e.g. `2026-000041`).
- Acceptance is lenient (whitespace, `#` prefix, short sequences) while rejection is strict (wrong separator, non-numeric, out-of-range length).
- Rejection is asserted via `toBeUndefined()`, not by expecting a thrown error — callers must check the return value.
