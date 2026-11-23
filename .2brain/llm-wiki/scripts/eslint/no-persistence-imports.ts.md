---
source: scripts/eslint/no-persistence-imports.ts
source_sha256: 9c50e1d722822a2590639d9b9f73c32be94cd1610b3390926e6b72919af6ce27
context_sha256: ab3933c10e8014917809068031359d277d3d13b377deeea782e339bf7a0a0a8d
generated_at: 2026-11-22T02:06:32.575678+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/no-persistence-imports.ts

## Purpose
Defines a custom ESLint rule, `noPersistenceImports`, that enforces "persistence stays behind the repository." A collection's `repository.ts` is its single door to storage. Any other file that imports a model or repository handle is treated as a second door and reported.

## Key elements
- `noPersistenceImports`: the exported rule, built with `ESLintUtils.RuleCreator.withoutDocs`. It has type `problem`, and its `ImportDeclaration` handler runs both checks.
- `RuleOptions`: the exported option shape.
  - `bindings?: string[]`: name suffixes that count as persistence. The default is `['Repository', 'Model']`.
  - `paths?: boolean`: whether the import path is checked. The default is `true`.
- `PERSISTENCE_PATH`: the regex `/(?:^|\/)(?:model|repository)$/`. It matches specifiers whose last segment is exactly `model` or `repository`, for example `../model` or `@modules/users/model`.
- `specifierNames`: returns the local name of an import specifier. For a named import it also returns the imported name, so a renamed import like `userModel as Users` is still caught.
- Message IDs:
  - `path`: reported on the source string.
  - `binding`: reported on the individual specifier.

## Relationships
- `scripts/eslint/index.ts` is the neighbor that would register or export this rule. The rule file itself does not reference it.
- `tests/unit/scripts/eslint/no-persistence-imports.test.ts` is the unit test for this rule.

## Notes
- **Two checks, one report per declaration.** The path check runs first. If it matches, the rule reports once and returns without running the name check, so `import { userModel } from './model'` produces a single error.
- **Suffix match.** The name check uses `endsWith` on the configured suffixes. Both the local and imported names are tested, and the first match is reported as `name`.
- **`import type` is not exempt.** Type imports are checked like any other import, because the type is the schema.
- **Segment boundary.** The path regex is anchored on a segment boundary on purpose. `@infrastructure/persistence/base-repository` is the shared helper that repositories are built from, so it does not match.
- **Disabling a check.** Setting `bindings: []` turns off the name check. Setting `paths: false` turns off the path check.
- **Options schema.** Unknown option keys are rejected (`additionalProperties: false`). `bindings` must contain unique strings.
- **Per-layer config.** Options are meant to be set per layer. The defaults are the strict reading, and an empty config block gets them.
- **Allowed files.** The rule has no built-in allowance for a collection's own `repository.ts`. Any exemption would have to come from ESLint config, and none is visible in this file.
