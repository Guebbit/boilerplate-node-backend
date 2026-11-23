---
source: src/infrastructure/adapters/antibot-verdict.ts
generated_at: 2026-11-22T02:34:38.994106+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot-verdict.ts

## Purpose
Defines the single verdict type that every anti-automation "rung" returns: either the caller may proceed or is refused. It is shared so rung 2 (`checkEmailPolicy`) and rung 3 (`HumanChallengeProvider.verify`) use one vocabulary for the same yes/no question instead of drifting apart.

## Key elements
- `RungVerdict` — type alias, `'ok' | 'refused'`. `'ok'` means the caller may proceed; `'refused'` means the caller is refused.

## Relationships
- The file imports nothing and contains only the type. Its doc comment names `checkEmailPolicy` (rung 2) and `HumanChallengeProvider.verify` (rung 3) as the intended users of the verdict shape.
- Listed neighbors are `antibot.ts` and the `antibot-providers/` files (`index.ts`, `altcha.ts`, `turnstile.ts`). This file does not show which of them reference it, so the exact links are not visible here.

## Notes
- Type-only module: it has no runtime code. It exists purely to keep the verdict vocabulary uniform across rungs.
