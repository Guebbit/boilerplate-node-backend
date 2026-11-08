---
source: src/modules/payments/tests/unit/transfer-reference.test.ts
sha256: b76e44900bb2631530c3e19a20038e34870cc0d119042792f231aa761bb6df91
generated_at: 2026-11-08T07:41:15.509000+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/transfer-reference.test.ts

## Purpose
Unit tests for the `buildReference` / `parseReference` pair in the payments domain, verifying the two guarantees that matter for matching a payment reference to the correct order: round-trip fidelity and rejection of mistyped input rather than silent mis-resolution.

## Key elements
- **`ORDER_ID`** – a fixed 24-hex ObjectId used as the test fixture for all reference mints and parses.
- **`describe('buildReference')`** – three tests: output matches the documented shape (`RF` + 2 digits + 19 alphanumeric), output is deterministic for a given order id, and different order ids produce different references.
- **`describe('parseReference — the RF branch')`** – six tests covering:
  - Round-trip: `parseReference(buildReference(id))` returns the same string.
  - Input tolerance: spaces and lowercase are normalised back to the canonical form.
  - One-character typo in the last position returns `null` (does not silently match a different order).
  - Structurally similar but wrong-length strings return `null`.
  - A raw ObjectId (plain or space-grouped) is **not** accepted as a reference.
  - Non-reference strings and empty string return `null`.

## Relationships
- **Imports `buildReference`, `parseReference`** from `src/modules/payments/domain/transfer-reference.ts` — the sole production dependency under test.

## Notes
- The `parseReference` describe block is explicitly scoped to "the RF branch," implying the parser handles multiple reference prefixes; only the RF path is exercised here.
- Typo-rejection is tested by flipping only the last character (`0`↔`1`), which is the cheapest corruption a customer could make while still keeping the string length valid.
- The valid-shape regex `/^RF\d{2}[\dA-Z]{19}$/` is asserted in the test and is the de facto contract for what `buildReference` must produce.
