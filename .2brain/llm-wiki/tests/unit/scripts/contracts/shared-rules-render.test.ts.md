---
source: tests/unit/scripts/contracts/shared-rules-render.test.ts
sha256: 7205d871f0cf6816e210b5239320fcd99f4ae48bf05a3e26568e521b92af11d7
generated_at: 2026-11-08T10:35:17.270485+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/shared-rules-render.test.ts

## Purpose

Unit tests for the shared-rules code-generation pipeline. Verifies that `deriveKey` produces stable UPPER_SNAKE identifiers, that `renderGenerated` emits correct TypeScript source (headers, docblocks, `as const` objects, verbatim dumps, digit grouping, and error cases), and that `keyedListSchema` enforces list constraints via Zod.

## Key elements

- **`spec` (fixture)** – A `GenerateSpec` with one `keyed-list` export (`names`) and one `verbatim` export (`limits`), used across all `renderGenerated` tests.
- **`describe('deriveKey')`** – Asserts dot → underscore conversion and uppercasing (e.g. `security.api_key.revoked` → `SECURITY_API_KEY_REVOKED`).
- **`describe('renderGenerated')`** – Shares a single `output` string (rendered once from the fixture) and checks:
  - "Do-not-edit" header naming the source YAML file.
  - Keyed-list rendered as an `as const` object with per-key JSDoc (including multi-line descriptions).
  - Verbatim field dumped as parsed JSON-like data.
  - Long integers grouped in threes (`300_000`), strings left untouched.
  - Throws on a missing field and on two values deriving the same key.
- **`describe('keyedListSchema')`** – Wraps `keyedListSchema(/^[a-z.]+$/)` in a strict Zod object and asserts it accepts valid lists while rejecting duplicates, off-pattern values, empty arrays, and blank descriptions.

## Relationships

- **`scripts/contracts/shared-rules-render.ts`** – Under test. Provides `deriveKey` and `renderGenerated`, the two functions exercised by the first two `describe` blocks.
- **`src/infrastructure/config/shared-rules/generate-spec.ts`** – Supplies the `GenerateSpec` type (shape of the test fixture) and the `keyedListSchema` factory (tested in the third `describe` block).

## Notes

- The `renderGenerated` block computes `output` **once** outside the `it` blocks; all assertions in that group read the same string. If a future test needs different input, it must call `renderGenerated` locally inside the `it`.
- `keyedListSchema` is a *factory* taking a `RegExp`; the test instantiates it with `/^[a-z.]+$/` and nests it in `z.strictObject` to exercise the surrounding contract, not just the inner array logic.
- Digit-grouping assertions (`300_000`, `1_234_567`) pin a formatting decision: underscores are inserted only in numeric literals, never inside string values.
