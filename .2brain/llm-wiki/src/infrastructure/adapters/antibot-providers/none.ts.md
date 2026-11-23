---
source: src/infrastructure/adapters/antibot-providers/none.ts
source_sha256: 259cd0c0015f44a9e05a48c5f38e68ded0f5d7da8ce9b711847cb7cb4b58138b
context_sha256: 612b9e7cf0f9defb15db51ac9764615e26c6d3653632842198e554abaae029dd
generated_at: 2026-11-22T02:34:18.608722+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot-providers/none.ts

## Purpose
The no-op human-challenge (antibot) provider that ships by default. It always passes verification and renders no widget, so tests, the demo, and a fresh boilerplate checkout never load a third-party widget or send visitor traffic to an external service.

## Key elements
- `noneProvider`: a `HumanChallengeProvider` constant with:
  - `name: 'none'`: the provider identifier.
  - `publicParameters()`: returns an empty object, since there is no widget to configure.
  - `verify()`: returns a promise resolving to `'ok'` for every caller, with no checks.

## Relationships
- Imports the `HumanChallengeProvider` type from `./index` (`src/infrastructure/adapters/antibot-providers/index.ts`), which defines the interface this object implements. The import is type-only.

## Notes
- `verify` ignores any input and never rejects, so this provider offers no bot protection. It should be treated as a placeholder or test default, not a production safeguard.
