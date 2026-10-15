---
source: tests/support/pattern-samples.ts
sha256: 10471e2a897fb5d97f480f4e852962848c397d79d42ade4af5c59356f3c71ee7
generated_at: 2026-10-15T12:59:28.666429+00:00
model: ollama:qwen3.8:27b
---

# tests/support/pattern-samples.ts

## Purpose

Provides a single lookup table of known-good sample strings for OpenAPI `pattern` constraints that value generators cannot synthesize autonomously. Every generator that walks the contract consults this one table, so a tricky regex is registered exactly once; a generator that finds no entry fails loudly instead of emitting a value the contract forbids.

## Key elements

- **`PATTERN_SAMPLES`** (module-private) — `Record<string, string>` mapping a regex source (exactly as written in the OpenAPI spec) to a valid sample string. Covers locale tags, ISO country codes, ObjectId-shaped ids, identifier-style slugs, and an https-only URL prefix.
- **`usesLookaround(source: string): boolean`** (exported) — Detects whether a pattern contains lookahead/lookbehind assertions (`(?=`, `(?!`, `(?<=`, `(?<!`). These are unsupported by `fast-check`'s `stringMatching`, which throws on them. Callers use this to skip pattern-based generation for those cases.
- **`sampleForPattern(source: string): string | undefined`** (exported) — Returns the registered sample for a pattern source, or `undefined` when no entry exists (the "fail loudly" signal for generators).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The keys in `PATTERN_SAMPLES` are the `pattern` values as this spec declares them. The file must stay in sync with any new or changed `pattern` constraints in the contract.
- **`tests/support/contract-data.ts`**, **`tests/support/spec-walk.ts`** — Generators that walk the contract; they call `sampleForPattern` (and `usesLookaround`) to resolve pattern constraints they cannot synthesize on their own.
- **`tests/support/spec-arbitraries.ts`** — The `fast-check`-based generator. It calls `usesLookaround` to avoid passing lookaround patterns to `stringMatching`, and `sampleForPattern` for patterns it can otherwise handle.

## Notes

- Keys are raw regex **source** strings, not `RegExp` objects. The source must match both the OpenAPI YAML text and the `.source` property of the equivalent `RegExp` on the generated zod schema, so both halves of the tooling resolve the same entry.
- `usesLookaround` inspects the source text rather than catching the `fast-check` error message, because that message is implementation-internal and could change with a library upgrade.
- The `\w` entry (`'^(?:\\w|-)+$'`) exists separately from `[A-Za-z0-9_]` because the generated zod schema rewrites the character class; both forms must be registered.
- A missing entry is a hard failure for the consuming generator — there is no fallback or default sample.
