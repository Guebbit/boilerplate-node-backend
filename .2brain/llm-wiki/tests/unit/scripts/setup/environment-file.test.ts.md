---
source: tests/unit/scripts/setup/environment-file.test.ts
sha256: 347ea982d4a693fb756ff9b914fe546a717cef37986083e81557534aadf3d309
generated_at: 2026-09-27T16:14:22.901535+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/environment-file.test.ts

## Purpose

Unit tests for the pure text-manipulation functions (`fillPlaceholders`, `generateSecret`, `readEnvironmentValue`) that underpin `npm run setup`. All assertions operate on in-memory strings—no filesystem I/O—so the tests run fast and are deterministic. The end-to-end `.env-example` flow lives in `first-run.test.ts`.

## Key elements

- **`describe('fillPlaceholders')`** — five cases covering: exact `KEY=placeholder` replacement, leaving already-real values untouched, idempotency (second pass is a no-op), rejecting substring-only matches (`change-me-but-longer` ≠ `change-me`), and independent multi-key fills in one pass.
- **`describe('generateSecret')`** — asserts the output is ≥ 32 chars, contains neither `,` nor `:` (the key-ring and placeholder-list separators), and differs across calls.
- **`describe('readEnvironmentValue')`** — verifies correct value extraction, `undefined` for an absent key, and `undefined` for a commented-out (`#`) key.

## Relationships

- **`scripts/setup/environment-file.ts`** — the module under test. This file imports `fillPlaceholders`, `generateSecret`, and `readEnvironmentValue` directly; it exercises their contract without triggering any side-effects the module might have elsewhere.

## Notes

- Placeholder matching is **whole-line exact**, not substring: a value like `change-me-but-longer` must not trigger a fill. This is a deliberate design choice encoded by the dedicated test case.
- `generateSecret` is constrained to exclude `,` and `:` because those characters are structural delimiters in the setup pipeline (key-ring list and placeholder list). Regenerating the secret function without respecting this constraint would silently corrupt those structures.
- The `filled` array returned by `fillPlaceholders` is expected to be **order-preserving** (matches the order of the `keys` argument), which the multi-key test enforces via `toEqual(['A', 'C'])`.
