---
source: tests/cross-cutting/guarded-steps-stay-unpublished.test.ts
sha256: 4f4e3909f0c53f7709d10de35ad01f94cf4e7d0ae5ab4ecc3e274ccdcb609019
generated_at: 2026-11-08T09:27:10.360615+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/guarded-steps-stay-unpublished.test.ts

## Purpose

Cross-cutting test that enforces an architectural rule: functions marked `@internal` in TSDoc (the "steps" that perform writes behind guard/door functions) must never be re-exported through a module's barrel (`src/modules/*/index.ts`), regardless of the re-export shape (`export *`, named re-export, renamed property, object-literal bundling, spread). It uses the TypeScript Compiler API to walk the real barrel files and a small in-memory fixture to verify detection across every carrying shape.

## Key elements

- **`barrels`** — Array of every `src/modules/*/index.ts` that exists on disk.
- **`compilerOptions`** — Resolved from the repo's `tsconfig.json` (including `extends` and path aliases) so the compiler program resolves `@modules/*` correctly.
- **`isTaggedInternal(declaration)`** — Returns `true` if the declaration carries a TSDoc `@internal` tag.
- **`guardOver(program)`** — Core logic; returns `{ checker, target, leaksOf }`. Internally defines:
  - `target` — Resolves alias symbols to their ultimate declaration.
  - `referencedSymbol(value)` — Follows an identifier, a member expression, or a single-forward arrow/function expression to the symbol it ultimately names. A multi-statement wrapper (a "door") is *not* followed.
  - `spreadSymbols(spread)` — Resolves `{ ...x }` to the exports of a namespace or properties of an object.
  - `bundledSymbols(declaration)` — Collects all symbols an object literal carries by reference (shorthand, property, forwarder, spread).
  - `leaksOf(barrel, module)` — Enumerates every `@internal` symbol a barrel publishes, as `"module: name"` strings.
- **`KNOWN_STEPS`** — Hard-coded `['inventory','applyTransition']`, `['payments','performRefund']`, `['payments','settlePayment']`, filtered by `isDeployed`. Used by the first canary to prove the tag-reading machinery works.
- **`taggedSteps()`** — Walks all top-level declarations under `src/modules` and returns names carrying `@internal`.
- **`FIXTURE` / `fixtureGuard`** — Two in-memory files (a step + a barrel with five carrying shapes plus one door that must *not* be flagged), compiled via a custom `ts.CompilerHost`. Exercises `guardOver` on synthetic input.
- **`describe` block** — Four tests: three canaries (tag reading, door resolution, fixture shapes) followed by the real assertion that no barrel in the repo leaks an `@internal` step.

## Relationships

- **`tests/support/paths.ts`** — Provides `isDeployed(module)`, used to filter `KNOWN_STEPS` and to skip the payments canary when the module is not present in the current checkout.
- **`scripts/scaffold/templates-code.ts`** — Indirect: the scaffolded module code (barrels, service objects) is the surface this test audits. No direct import; the relationship is "producer of the artifact under constraint."

## Notes

- The test uses the TypeScript Compiler API directly (`ts.createProgram`, `TypeChecker`) rather than shelling out to `tsc`. The fixture compiles against a hand-rolled `CompilerHost` that intercepts `fileExists`/`readFile`/`getSourceFile` to serve strings from the `FIXTURE` record.
- The `aGuardedDoor` entry in the fixture (`Promise.resolve(id).then(…)`) is deliberately *excluded* from expected leaks: a wrapper that performs additional work (the `.then` callback) is classified as a door, not a passthrough, so `referencedSymbol` stops and does not flag it.
- In a stripped or partial repo checkout, `isDeployed` returns `false` for absent modules, causing both the canary list and the payments-specific canary to shrink/skip silently. The final "no leaks" assertion still runs over whatever barrels are present.
- The header comment references `scripts/audit/reachability/SKILL.md` for discovering *untagged* steps (a complementary concern) and `docs/theory/strategic-ddd.md` §5 for the design rationale.
