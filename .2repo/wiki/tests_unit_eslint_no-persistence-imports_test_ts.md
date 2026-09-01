# tests/unit/eslint/no-persistence-imports.test.ts

## Purpose

Unit test for the `noPersistenceImports` ESLint rule, exercised through ESLint's `RuleTester` so that assertions operate on the parsed AST exactly as a real lint run would. Covers both detection routes (imported binding name and module path) and both shipped configurations (strict for controllers, Model-only for the rest), catching regressions that a default-options-only test would miss.

## Key elements

- **`tester`** — `RuleTester` instance configured with the `typescript-eslint` parser (`tseslint.parser`), `ecmaVersion: 'latest'`, `sourceType: 'module'`.
- **`MODEL_ONLY`** — Options constant for the lax profile: `bindings: ['Model']`, `paths: false`.
- **`STRICT`** — Options constant for the controller profile: `bindings: ['Repository', 'Model']`, `paths: true`.
- **`tester.run(...)`** (top-level) — Declares five valid and six invalid cases. Valid cases include service-side repository imports, `model.ts` self-imports, seeder exemptions, plain data types, and the `createRepository` helper. Invalid cases cover barrel-name detection, aliased imports, path-based detection, `import type` imports, deduplication (one report for a combined name+path hit), and namespace imports.

## Relationships

- **`eslint/rules/no-persistence-imports.ts`** — Imports the `noPersistenceImports` rule object, which is the sole subject under test. The test passes it as the rule implementation to `RuleTester`.

## Notes

- `tester.run` must be called at the top level (not inside a `describe`/`it` block): RuleTester emits its own `describe`/`it` structure, and Jest rejects nested describes.
- The parser is the TypeScript parser, not espree, because half the invalid cases use `import type` syntax that espree cannot parse.
- The parser is imported via the `typescript-eslint` meta package (not `@typescript-eslint/parser`) because the latter ships only an `exports` map with no `main`/`types`, breaking ts-jest under the project's `node16` module resolution. The same spelling is already used in `eslint.config.ts`.
- Both `as never` casts (on the parser and the rule) silence TypeScript's structural-type mismatch without changing runtime behavior.
- The valid case for `createRepository` documents that the path check is anchored on a segment boundary — the name ending in "Repository" is not enough to trigger a violation when `paths: true`.
