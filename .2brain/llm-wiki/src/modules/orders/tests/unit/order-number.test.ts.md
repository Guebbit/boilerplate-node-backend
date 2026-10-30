---
source: src/modules/orders/tests/unit/order-number.test.ts
sha256: bd098ea76489ec2080e92dc28c4406883366dfc87717da952a6a4d1989267a22
generated_at: 2026-10-29T04:59:32.358718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/order-number.test.ts

## Purpose

Unit tests for `parseOrderNumber`, the function that normalizes an order number as a customer quotes it (with optional `#`, whitespace, or a shortened numeric part) into the canonical `YYYY-NNNNNN` stored form, and verifies that malformed inputs are rejected by returning `undefined`.

## Key elements

- **`describe('parseOrderNumber')`** — single test suite; no other top-level exports.
- **Happy-path table (`it.each`)** — six `[raw, canonical]` pairs asserting `parseOrderNumber(raw) === canonical`. Covers: exact match, surrounding spaces, leading `#`, `#` + space + short number, bare short number, and a zero (`2026-0` → `2026-000000`).
- **Rejection table (`it.each`)** — nine raw strings (empty, no year, `#` alone, 2-digit year, trailing hyphen, non-numeric suffix, wrong separator `/`, 10-digit number, pure alpha) asserting `parseOrderNumber(raw) === undefined`.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** — sole import target; provides the `parseOrderNumber` function under test. This test file has no other dependencies and is not imported by any other module in the graph.

## Notes

- The canonical format is `YYYY-` followed by exactly six zero-padded digits (e.g. `2026-000041`). The parser pads short numeric parts on the right.
- Invalid input yields `undefined`; the function does **not** throw. Any caller relying on exceptions will miss errors.
- The separator must be `-`. A `/` (e.g. `2026/41`) is treated as invalid.
- A numeric part longer than six digits (`1234567890`) is rejected, so there is an implicit upper bound on the sequence number.
