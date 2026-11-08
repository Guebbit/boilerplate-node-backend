---
source: src/infrastructure/adapters/antibot-verdict.ts
sha256: c984811e271c86bce512f3de6029e94349e3dbfe4c59942c58abebba4db64e29
generated_at: 2026-11-08T03:17:19.050615+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-verdict.ts

## Purpose

Defines the single shared verdict type (`RungVerdict`) that every anti-automation "rung" uses to signal whether a caller may proceed. By centralizing this yes/no vocabulary, it prevents rung 2 (`checkEmailPolicy`) and rung 3 (`HumanChallengeProvider.verify`) from diverging into incompatible return shapes.

## Key elements

- **`RungVerdict`** (exported type) — A union of the two string literals `'ok' | 'refused'`. This is the entire public surface of the module.

## Relationships

- **`antibot-providers/altcha.ts`** / **`antibot-providers/turnstile.ts`** — Rung 3 (`HumanChallengeProvider`) implementations whose `verify` method is expected to resolve to a `RungVerdict`.
- **`antibot-providers/index.ts`** — Barrel file that re-exports the concrete providers consuming this type.
- **`antibot.ts`** — The top-level anti-automation adapter that orchestrates the rungs and switches on the `RungVerdict` value to decide whether to allow or refuse the caller.

## Notes

- This file intentionally contains **no logic** — it is a pure type alias (union of literals), so it has zero runtime cost and no importable side effects.
- Because it is a literal union (not an enum or object map), consumers can narrow with simple string comparisons; no `.value` access or enum-member syntax is required.
