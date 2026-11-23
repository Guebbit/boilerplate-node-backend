---
source: scripts/eslint/index.ts
source_sha256: 03e52d1de6431eab1fcdfc2190fb3615b73f4c6c28014dffe0e218c31c4ab0de
context_sha256: df90854a65000e76313c9623a388000d3e492203560283c78f1efb8606ba222b
generated_at: 2026-11-22T02:05:58.252615+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/index.ts

## Purpose
Entry point for this repo's project-local ESLint plugin. It aggregates the individual rule implementations into a single rule table that `eslint.config.ts` registers. The rules live in-repo rather than in a published plugin because they encode this repo's conventions and have a single consumer. Each rule has its own file so it can be unit-tested with `RuleTester` (`tests/unit/scripts/eslint/`).

## Key elements
- **Default export**: an object mapping rule names (as used in `eslint.config.ts`) to rule implementations:
  - `barrel-allowed-sources`: restricts which of a module's own files its `index.ts` may publish.
  - `comment-links`: registered here, but the file's header comment does not describe it.
  - `controller-chain-must-catch`: AST check on controller chains (the header contrasts this with grepping for `.catch(`).
  - `max-depth-through-closures`: like ESLint's `max-depth`, but keeps counting inside callbacks instead of restarting at zero.
  - `no-hardcoded-user-text`: AST check for hardcoded user-facing text.
  - `no-persistence-imports`: checks the imported name as well as the specifier, so a repository hidden behind a barrel is still caught (for example `{ userRepository } from '@modules/users'`).

## Relationships
- Imports each rule from its sibling file: `barrel-allowed-sources.ts`, `comment-links.ts`, `controller-chain-must-catch.ts`, `max-depth-through-closures.ts`, `no-hardcoded-user-text.ts`, `no-persistence-imports.ts`.
- `eslint.config.ts` consumes this default export as the plugin's rules. The rule-name keys here are the names used there.

## Notes
- Adding a rule means creating its file, importing it, and adding a key to the export object here. Without that, `eslint.config.ts` cannot reference it.
- The header comment explains why some rules exist alongside stock ones:
  - `no-restricted-imports` sees only the import specifier.
  - `eslint-plugin-boundaries` governs which module a file may import, not what a module's `index.ts` may publish. `barrel-allowed-sources` covers the latter.
- Rule logic lives in the sibling files; this file contains no behavior of its own.
