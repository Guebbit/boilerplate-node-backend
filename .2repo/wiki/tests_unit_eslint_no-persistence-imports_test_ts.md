# tests/unit/eslint/no-persistence-imports.test.ts

## Purpose

Unit tests for the `no-persistence-imports` ESLint rule, exercising it through ESLint's `RuleTester` so that assertions mirror exactly what a lint run produces (parsed AST, not source strings). The cases are split along the rule's two detection routes — binding-name match and module-path match — and across its two shipped configurations (strict for controllers, `Model`-only elsewhere), catching regressions in either axis that a defaults-only test would miss.

## Key elements

- **`tester`** – A `RuleTester` instance configured with the `typescript-eslint` parser (required because the rule must see `import type` nodes, which espree cannot parse).
- **`MODEL_ONLY`** – The lax option set (`bindings: ['Model'], paths: false`) applied to non-controller modules under `src/modules/**`.
- **`STRICT`** – The strict option set (`bindings: ['Repository', 'Model'], paths: true`) applied to controllers.
- **`valid` cases** – Five scenarios that must *not* trigger the rule: a service importing a repository, `model.ts` itself importing mongoose, a seeder's model import (empty bindings list), a plain data type, and the `base-repository` helper (path check is segment-anchored, not suffix-matched).
- **`invalid` cases** – Six scenarios that *must* trigger the rule, covering: barrel-import name detection, alias (`as`) detection, path detection, `import type` detection, single-report-on-overlap (path verdict subsumes binding verdict), and namespace imports.

## Relationships

- **`eslint/rules/no-persistence-imports.ts`** – The rule under test. This file imports `noPersistenceImports` from that module and passes it as the rule implementation to `RuleTester.run`. All valid/invalid cases and `messageId` assertions (`'binding'`, `'path'`) are defined by that rule.

## Notes

- `tester.run` is called at **top level**, not inside a `describe` or `test` block, because `RuleTester` emits its own `describe`/`it` scaffolding and Jest rejects nested describes.
- The parser is reached via the `typescript-eslint` **meta package** (not `@typescript-eslint/parser` directly) because the latter has no `main`/`types` entry — only an `exports` map — and `tsconfig.jest.json` resolves modules as `node16`, under which ts-jest cannot find its declarations (TS2307).
- The `as never` casts on `parser` and the rule are needed to satisfy TypeScript's structural checks at the call site; they do not change runtime behavior.
- The "one mistake, one report" invalid case (`orderModel` from `./model`) asserts exactly **one** error with `messageId: 'path'`, documenting that the path verdict subsumes the binding verdict for the same declaration.
