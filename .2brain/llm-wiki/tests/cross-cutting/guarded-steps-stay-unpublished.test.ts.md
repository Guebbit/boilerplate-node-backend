---
source: tests/cross-cutting/guarded-steps-stay-unpublished.test.ts
sha256: a08d82678102003283c5a7ddc06d106f911a78015f2c4c39ae6e4d2b2013b2bd
generated_at: 2026-10-15T12:38:05.727164+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/guarded-steps-stay-unpublished.test.ts

## Purpose

Enforces that any function marked `@internal` (a "step" behind a guarded door) never appears in its module's public barrel (`src/modules/*/index.ts`), including via `export *` chains, renamed re-exports, or object-literal bundling. It exists because no structural rule distinguishes a step from a door; the `@internal` TSDoc tag is the sole marker, and this suite is the automated gate that catches an untagged or over-exposed step.

## Key elements

- **`program`** — A TypeScript Compiler Program built over every module barrel, using the repo's own `tsconfig.json` so path aliases resolve.
- **`checker`** — The program's `TypeChecker`, used for alias resolution and export enumeration.
- **`isTaggedInternal(declaration)`** — Returns `true` if the declaration (or its enclosing statement) carries an `@internal` TSDoc tag.
- **`target(symbol)`** — Resolves an alias symbol (re-export, `export *` indirection) to the declaration it ultimately names.
- **`bundledSymbols(declaration)`** — Extracts referenced symbols from an object-literal initializer (shorthand and named properties), catching patterns like `const svc = { settlePayment }`.
- **`leaksOf(barrel)`** — Walks a barrel's exports and returns `module: name` strings for every `@internal` symbol that leaks out, whether directly exported or nested inside a bundled object.
- **`KNOWN_STEPS`** — A filtered list of `@internal` functions the codebase documents (e.g. `payments/settlePayment`), used as canaries to prove the tag-reading pipeline works.
- **`taggedSteps()`** — Enumerates all top-level `@internal` declarations under `src/modules` by name.
- **Three test cases** — (1) canary: `KNOWN_STEPS` ⊆ `taggedSteps()`; (2) canary: a known door (`confirmPayment`) resolves through the payments barrel; (3) invariant: no barrel leaks any `@internal` symbol.

## Relationships

- **`tests/support/paths.ts`** (imported as `@tests/paths`) — Provides `isDeployed(module)`, which filters `KNOWN_STEPS` so the canary assertions skip modules absent from a partial/monorepo checkout.

## Notes

- The test builds a full `ts.createProgram` over all barrels at module load time; it is not a quick unit test but a structural audit.
- `leaksOf` only inspects the barrel's own export surface plus one level of object-literal bundling. Deeper re-export chains are resolved by `target()` via the compiler's alias resolution, so transitive `export * from './internal'` is still caught.
- The canary tests are ordered intentionally: if the tag-reading or barrel-resolution canary fails, the "never leaves" assertion would also fail vacuously. Read failures in order.
- Finding an *untagged* step (one that should be `@internal` but isn't) is explicitly out of scope and delegated to `scripts/audit/reachability/SKILL.md`.
