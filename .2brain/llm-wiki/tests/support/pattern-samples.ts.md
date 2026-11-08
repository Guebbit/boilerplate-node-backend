---
source: tests/support/pattern-samples.ts
sha256: 6edf24e4f78f75049a0aa09b6a16d5f6c07f3d40c2454ccf597807404d7c9bd1
generated_at: 2026-11-08T09:57:14.854433+00:00
model: ollama:qwen3.8:27b
---

# tests/support/pattern-samples.ts

## Purpose

Provides a shared lookup table of known-good sample strings for regex `pattern`s declared in the OpenAPI contract that a generator cannot synthesise on its own. One table serves every contract-walking generator, so a tricky pattern is registered once, and a generator that finds no entry fails loudly rather than emitting a value the contract forbids.

## Key elements

- **`PATTERN_SAMPLES`** (internal) — `Record<string, string>` keyed by the regex *source* exactly as `openapi.yaml` writes it (which is also what `RegExp.source` yields on the generated zod schema). Covers locale tags, country/currency codes, resource IDs, identifier-shaped strings, decimal amounts, and an https-only URL.
- **`usesLookaround(source: string): boolean`** (exported) — Returns `true` when the pattern contains a lookaround assertion (`(?=`, `(?!`, `(?<=`, `(?<!`). Detects it from the source string directly rather than catching `fast-check`'s error message, which is one library upgrade from changing. Generators call this to skip `stringMatching` for patterns it cannot handle.
- **`sampleForPattern(source: string): string | undefined`** (exported) — Returns the registered sample for a given pattern source, or `undefined` when no entry exists (triggering the loud-failure path in the calling generator).

## Relationships

- **tests/support/spec-arbitraries.ts** — Consumes `sampleForPattern` and `usesLookaround` while walking the contract to build `fast-check` arbitraries; falls back to the sample or aborts when the pattern is not generatable.
- **tests/support/spec-walk.ts** — Another contract-walking generator that imports the same two exports, ensuring both generators resolve the same sample from their respective half of the contract.
- **tests/support/contract-data.ts** — Supplies the parsed contract (schemas, fields) that the generators above walk; the pattern sources they encounter are exactly the keys in `PATTERN_SAMPLES`.

## Notes

- Keys are the **raw regex source string** (e.g. `'^(?:^https://)'`), not a compiled `RegExp`. Both `openapi.yaml` and the generated zod schema expose this form, so the table is unambiguous.
- The `Id` sample (`'65dc8a99604c307b702b5ccc'`) is deliberately an ObjectId-shaped value so payloads also satisfy backend identifier expectations, not just the contract's loose `^[0-9A-Za-z_-]+$` pattern.
- The `CurrencyCode` sample is hardcoded to `'EUR'` (the shop's own currency) so cross-field rules (refund, checkout) that compare it against the payment's currency also pass.
- One sample (`'1.00'`) intentionally serves both `DecimalAmount` and `NonNegativeDecimalAmount` patterns to keep the table minimal.
