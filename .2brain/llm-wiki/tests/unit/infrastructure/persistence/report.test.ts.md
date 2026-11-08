---
source: tests/unit/infrastructure/persistence/report.test.ts
sha256: 393c53b7abad74d274497866a3f0004e68cbb1f99eff46291b662a077474458b
generated_at: 2026-11-08T10:22:29.227563+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/report.test.ts

## Purpose

Unit tests for the `bucketOf` helper, verifying that it produces correct MongoDB `$dateTrunc` aggregation expressions. The primary concern is that Monday-first week bucketing is emitted only for `week` intervals and never leaks into day or month buckets.

## Key elements

- **`window(interval)`** — local factory that builds a fixed test window (2026-01-01 → 2026-02-01, `Europe/Rome`) for a given interval, so every test case shares a deterministic input shape.
- **`describe('bucketOf')`** — the single test suite. Contains two specs:
  - *truncates in the window zone, to the window unit* — asserts the full `$dateTrunc` shape (date field, unit, timezone).
  - *sends Monday as the start of the week for weeks, and only for weeks* — asserts `startOfWeek: 'monday'` is present for `week` and explicitly **absent** for `month`.

## Relationships

- **`src/infrastructure/persistence/report.ts`** — the module under test. The test imports `bucketOf` from this file and validates its return value against expected `$dateTrunc` MongoDB operator objects. No other dependencies are used.

## Notes

- The test hardcodes `Europe/Rome` as the timezone; this mirrors the production default but the helper accepts any IANA zone. If the timezone default changes in `report.ts`, the expectation string must be updated here.
- The second spec uses `toMatchObject` / `not.toHaveProperty` rather than deep equality, so extra fields on the `week` result won't cause a false failure—only the absence of `startOfWeek` on `month` is strictly enforced.
