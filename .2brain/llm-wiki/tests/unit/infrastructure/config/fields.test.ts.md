---
source: tests/unit/infrastructure/config/fields.test.ts
sha256: 638a7b893afb3e910fd47178b7d2791513107157d829c75a9e55a7c158142256
generated_at: 2026-10-15T13:10:17.930317+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/fields.test.ts

## Purpose

Unit tests for every field builder exported from `@infrastructure/config/fields`. Each builder is exercised on the inputs that previously produced a silent fallback (bad unit suffix, misspelt switch, out-of-set value) to confirm they are now rejected, and on blank/unset input to confirm the default is applied.

## Key elements

- **`describe('int')`** — Parses whole numbers (incl. zero-padded), rejects non-integers/hex/scientific/alpha, enforces `min`/`max`, falls back to `default`, returns `undefined` when no default is set.
- **`describe('decimal')`** — Parses decimals and whole numbers, rejects leading-dot, scientific notation, alpha, out-of-range, and negative-below-min values; applies default on unset.
- **`describe('flag')`** — Maps `1/TRUE/yes/on` → `true` and `0/False/no/off` → `false`; rejects ambiguous words like `"maybe"`; honours `default`.
- **`describe('choice')`** — Trims and lower-cases input before set membership; rejects out-of-set values with a message naming the allowed set; supports a lazy function for the set (registry filled post-import); default on blank.
- **`describe('email')`** — Trims and validates an address; throws (not silently unset) on invalid; treats blank as `undefined`.
- **`describe('text and secret')`** — Trims, treats blank as unset, supports `case: 'upper' | 'lower'`; `secret` carries `sensitive: true` and a `presence` object (`minLength`, `placeholder`, `productionOnly`).
- **`describe('csv and key rings')`** — Splits, trims, drops blanks; empty array on unset; default on unset; per-member case normalisation; `keyRing` preserves order and is sensitive; `versionedKeyRing` parses `v2:new,old` into `{version,key}` pairs with bare values defaulting to `v1`.
- **`describe('timeZone')`** — Canonicalises zone names (e.g. `europe/rome` → `Europe/Rome`); rejects offsets and bogus names; blank → `undefined`; default on unset.

## Relationships

- **`src/infrastructure/config/fields.ts`** — Sole import target. Every test instantiates a builder (`int`, `decimal`, `flag`, `choice`, `email`, `text`, `secret`, `csv`, `keyRing`, `versionedKeyRing`, `timeZone`) from that module and asserts on the returned `.schema` (a Zod-like parser) and top-level properties (`sensitive`, `presence`).

## Notes

- Tests use **Vitest** (`describe`, `it`, `it.each`, `expect`). No custom fixtures or mocks are used; all builders are called inline.
- The `choice` lazy-set test mutates a shared `names` array between two assertions within the same `it` block to simulate a registry populated after module import — a deliberate pattern to cover that edge case.
- `email` and `secret` are tested in the same `describe` block (`'text and secret'`) for brevity; they are still independent assertions.
- `it.each` is used for rejection tables, keeping each bad-input case visible in the test name output.
