---
source: tests/support/pattern-samples.ts
sha256: dd63cb1a96340979e66331f9e88b53f7ae3b9f6e60bcdf37b74f534630a2380b
generated_at: 2026-09-23T20:12:21.256884+00:00
model: ollama:qwen3.8:27b
---

# tests/support/pattern-samples.ts

## Purpose

Provides a single lookup table of known-good string values for OpenAPI `pattern` constraints that no generator can synthesize automatically (notably lookahead-based patterns). By keying samples on the regex source exactly as written in the contract, every generator that walks the spec shares one registration point instead of each hard-coding its own fallback.

## Key elements

- **`PATTERN_SAMPLES`** (module-private) — `Record<string, string>` mapping regex source strings to one valid sample value. Currently covers a BCP-47 locale pattern and a password-strength lookahead pattern.
- **`usesLookaround(source: string): boolean`** — Detects `(?=`, `(?!`, `(?<=`, `(?<!` in a regex source. Lets callers distinguish "generator can't handle this" from a simple pattern match, without relying on `fast-check`'s error message.
- **`sampleForPattern(source: string): string | undefined`** — Returns the registered sample for a given pattern source, or `undefined` if none is registered (callers are expected to fail loudly).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The source of truth for the regex strings used as keys in `PATTERN_SAMPLES`. Adding a new `pattern` in the contract is what triggers adding an entry here.
- **`tests/support/spec-walk.ts`** — Walks the contract schema and is the expected caller of `usesLookaround` / `sampleForPattern` when it encounters a `pattern` constraint it cannot generate.
- **`tests/support/spec-arbitraries.ts`** — Builds `fast-check` arbitraries from the spec; consults `sampleForPattern` for patterns it cannot synthesize and uses `usesLookaround` to detect the lookahead case that `stringMatching` rejects.
- **`tests/support/contract-data.ts`** — Another contract-walking generator that falls back to `sampleForPattern` for patterns it cannot construct, ensuring a missing entry surfaces as a test failure rather than a silently invalid value.

## Notes

- Keys are the raw regex source **exactly as written in `openapi.yaml`**, which is also what `RegExp.source` yields on the generated zod schema — this dual match is what lets both the YAML-side and zod-side walkers hit the same entry.
- `usesLookaround` is a regex-over-the-source check, deliberately avoiding a try/catch on `fast-check`'s assertion message, which could change in a library upgrade.
- A missing entry is **not** an error in this file; the contract is that the calling generator must treat `undefined` from `sampleForPattern` as a hard failure.
- The table is intentionally small: only patterns that are genuinely un-generable (e.g., lookahead) belong here. Simple character-class patterns should be handled by the generators themselves.
