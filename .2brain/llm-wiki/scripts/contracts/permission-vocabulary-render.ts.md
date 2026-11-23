---
source: scripts/contracts/permission-vocabulary-render.ts
source_sha256: 6518aab3b9b1510d918f34cee730ee2feeee477570d786956e3f6c458c1daea9
context_sha256: a57900c645aa7f2e41f9764a7243a30db5a98677f1d39b79df98e69f2f3a25ed
generated_at: 2026-11-22T01:59:10.059391+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/permission-vocabulary-render.ts

## Purpose
This is the pure half of the permission-vocabulary generator. It reads the closed lists (actions, subjects, rules, sets, scopes, step-up tiers) out of the shared authorization YAML document, and renders the TypeScript module that carries them. It does no filesystem access, so a test can exercise it directly. It is a shared script that is kept identical by hand in both repos of the pair, and it is deliberately not listed in `SHARED_FILES`.

## Key elements
- `PermissionVocabulary` (interface): the parsed result, with these fields:
  - `actions`
  - `subjects`: distinct rule subjects, in first-seen order.
  - `ruleIds`: `<action>:<subject>` for each rule.
  - `setNames`
  - `scopes`: keys of `scopes:`.
  - `stepUpTiers`: keys of `stepUp:`.
  - `pairs`: a map from subject to the actions of the rules on it.
- `readPermissionVocabulary(yamlText)`: parses the YAML and validates it, returning a `PermissionVocabulary`. It throws an `Error` when:
  - a list is missing or empty;
  - `actions:`, `sets:` or `rules:` repeats an entry;
  - a rule uses an undeclared action, scope or `stepUp` tier. `stepUp` is optional on a rule, but `scope` is required.
- `renderPermissionVocabulary(vocabulary)`: returns the full text of the generated module. It contains:
  - a "Code generated … DO NOT EDIT" header;
  - six `as const` arrays with their derived union types: `PERMISSION_ACTIONS`, `PERMISSION_SUBJECTS`, `PERMISSION_RULE_IDS`, `PERMISSION_SET_NAMES`, `AUTHORIZATION_SCOPES`, `STEP_UP_TIERS`;
  - the `PERMISSION_PAIRS` map;
  - the `ActionOn<S>` type.
- Internal helpers (not exported):
  - `stringList`: reads a non-empty list of strings.
  - `mappingKeys`: reads the keys of a non-empty mapping.
  - `fieldOfEach`: reads one non-empty string field from every entry of a list.
  - `assertUnique`: throws on the first repeated entry.
  - `renderList`: emits one array plus its union type.

## Relationships
- `scripts/contracts/generate-permission-vocabulary.ts` is the counterpart that does the I/O, as implied by the "pure half" description. The generated header names `npm run gen:api` as the regenerate command.
- `src/infrastructure/object-guards.ts` supplies `isPlainObject`, which `mappingKeys` uses to check that `scopes:` and `stepUp:` are mappings.
- `tests/unit/scripts/contracts/permission-vocabulary-render.test.ts` is the unit test for this file. The file's "no filesystem" design exists so it can be tested this way.

## Notes
- Declared order is preserved everywhere. Subjects come out in first-seen order.
- Error messages are all prefixed with `authorization-keys.generated.yaml`.
- Because the file is hand-synced across two repos, a change here has to be mirrored in the other repo.
- `readPermissionVocabulary` checks `rules:` shape only through `fieldOfEach`. The later `raw.rules as Raw[]` cast relies on that earlier validation.
