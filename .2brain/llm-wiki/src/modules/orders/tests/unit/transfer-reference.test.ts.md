---
source: src/modules/orders/tests/unit/transfer-reference.test.ts
sha256: 95ac6ad25701818a414c3eb2bc0c5aac13d25491fc5939696086277837609e24
generated_at: 2026-09-23T19:15:59.283792+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/transfer-reference.test.ts

## Purpose

Unit tests for the transfer-reference domain logic. Verifies that `buildReference` mints a well-formed, deterministic identifier per order and that `parseReference` round-trips valid references while rejecting malformed, mistyped, or non-reference inputs—ensuring a customer-entered reference can never silently resolve to the wrong order.

## Key elements

- **`ORDER_ID`** — a 24-character hex fixture (a real-shaped ObjectId) used as the canonical input throughout.
- **`describe('buildReference')`** — asserts three properties:
  - Output matches `/^RF\d{2}[\dA-Z]{19}$/` (prefix `RF`, 2 digits, 19 mixed alphanumerics).
  - Determinism: same order ID → identical reference.
  - Uniqueness: different order IDs → different references.
- **`describe('parseReference — the RF branch')`** — asserts:
  - Round-trip: `parseReference(buildReference(id)) === buildReference(id)`.
  - Forgiveness: grouped (4-char spaces) + lowercased input still parses correctly.
  - Single-character typo in the last position → `null` (no silent match).
  - Structured-but-wrong-length string → `null`.
  - Raw ObjectId (plain or space-grouped) → `null` (pre-reference orders are not reachable).
  - Arbitrary non-reference strings and empty string → `null`.

## Relationships

- **`src/modules/orders/domain/transfer-reference.ts`** — the module under test. This file imports `buildReference` and `parseReference` from it; all assertions in this test target those two exports and their contract (shape, determinism, null-on-invalid).

## Notes

- `parseReference` signals failure by returning `null`, not by throwing. Tests assert `.toBeNull()` accordingly.
- The typo test deliberately flips only the last character (`'0'↔'1'`) to guarantee exactly one invalid character, isolating the "near-miss" case from structurally malformed input.
- The tolerance test assumes the reference is always ≥ 19 chars so that the 4-char grouping regex (`/.{1,4}/g`) produces meaningful chunks; this is safe given the fixed 23-char shape enforced by `buildReference`.
