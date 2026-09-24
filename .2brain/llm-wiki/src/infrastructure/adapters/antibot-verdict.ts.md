---
source: src/infrastructure/adapters/antibot-verdict.ts
sha256: c984811e271c86bce512f3de6029e94349e3dbfe4c59942c58abebba4db64e29
generated_at: 2026-09-23T17:37:54.998972+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-verdict.ts

## Purpose

Defines the single shared `RungVerdict` union type (`'ok' | 'refused'`) used as the yes/no answer for every anti-automation rung. Exists so that rung 2 (`checkEmailPolicy`) and rung 3 (`HumanChallengeProvider.verify`) cannot drift into divergent vocabularies for the same binary question.

## Key elements

- **`RungVerdict`** (exported type alias) — a two-variant union: `'ok'` means the caller may proceed; `'refused'` means the caller is blocked. This is the sole export of the file.

## Relationships

- **`antibot.ts`** — the coordinating adapter that invokes the individual rungs and interprets their `RungVerdict` results to decide the overall outcome.
- **`antibot-providers/altcha.ts`**, **`antibot-providers/turnstile.ts`** — concrete `HumanChallengeProvider` implementations whose `verify` method returns a `RungVerdict`, making this type their shared response contract.
- **`antibot-providers/index.ts`** — re-exports provider implementations; consumers of the providers transitively depend on this verdict type.

## Notes

- This is a pure type-only module (no runtime code). It can be safely erased at compile time and has zero runtime cost.
- The type is deliberately minimal (two string literals) to keep the contract trivially comparable; do not widen it without updating every rung that returns it.
