---
source: src/modules/payments/tests/unit/transfer-reference.test.ts
sha256: b76e44900bb2631530c3e19a20038e34870cc0d119042792f231aa761bb6df91
generated_at: 2026-10-29T05:24:24.760539+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/transfer-reference.test.ts

## Purpose

Unit tests for the `transfer-reference` domain module. Verifies that `buildReference` produces well-formed, deterministic, unique RF references from an order ID, and that `parseReference` correctly round-trips valid references while rejecting typos, malformed strings, and non-reference inputs (like raw ObjectIds).

## Key elements

- **`ORDER_ID`** — A fixed 24-character hex string (ObjectId-shaped) used as the canonical input across all tests.
- **`describe('buildReference')`** — Three cases: regex shape (`/^RF\d{2}[\dA-Z]{19}$/`), determinism (same input → same output), and uniqueness (different input → different output).
- **`describe('parseReference — the RF branch')`** — Six cases covering: round-trip fidelity, normalization of user-typed spacing/lowercase, single-character typo rejection (returns `null`), wrong-length strings, raw ObjectId inputs (with and without spaces), and arbitrary non-reference strings including empty string.

## Relationships

- **`src/modules/payments/domain/transfer-reference.ts`** — The module under test. This file imports `buildReference` and `parseReference` and asserts their I/O contracts. No other neighbors exist.

## Notes

- The typo test mutates only the **last** character and relies on a binary flip (`0`↔`1`), implying the trailing position carries checksum weight. A typo at other positions may behave differently; only the last-char case is covered here.
- The "tolerates spacing/lowercase" test groups the reference into 4-char chunks with spaces — the normalization contract is: `parseReference` strips whitespace and uppercases before validating.
- `parseReference` returns `null` (not `undefined`, not an error) for all invalid inputs. Callers should treat `null` as "not a valid reference."
