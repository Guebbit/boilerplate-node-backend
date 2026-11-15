---
source: tests/cross-cutting/guarded-steps-stay-unpublished.test.ts
sha256: b50e603c9365e4af43b3f2dc855a9503117ab11bc9e27ed2b2bdb7200fedfe1a
generated_at: 2026-11-14T23:03:32.727762+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/guarded-steps-stay-unpublished.test.ts

## Purpose

Cross-cutting test that uses the TypeScript Compiler API to verify no `@internal`-tagged function ("step") escapes its module's barrel (`index.ts`), whether through direct re-export, `export *` chains, renamed aliases, object-literal bundling, spreads, or single-statement forwarding wrappers. It exists because no static tool can distinguish a "step" from a "door" by shape alone, so the convention is TSDoc `@internal` on the declaration, and this suite enforces the boundary.

## Key elements

- **`barrels`** – List of every `src/modules/*/index.ts` file that exists on disk.
- **`compilerOptions`** – Parsed from the repo's `tsconfig.json` (resolves path aliases, `extends`), with `noEmit: true`.
- **`isTaggedInternal(declaration)`** – Returns `true` if any TSDoc tag on the declaration is `@internal`.
- **`guardOver(program)`** – Core inspection factory. Returns `{ checker, target, leaksOf }`. Internally resolves alias chains, unwraps object-literal properties (shorthand, member-access, single-call forwarding, braced-return forwarding, spread), and flags any exported symbol whose ultimate declaration is `@internal`.
- **`leaksOf(barrel, module)`** – Produces `"module: name"` (or `"module: obj.name"`) strings for every `@internal` symbol a barrel publishes.
- **`KNOWN_STEPS`** – Hardcoded list of `@internal` functions (e.g. `settlePayment`, `applyTransition`) filtered by `isDeployed(module)`; used as canaries to prove the tag reader works.
- **`taggedSteps()`** – Collects all top-level `@internal` declarations under `src/modules`.
- **`FIXTURE` / `fixtureGuard`** – Two in-memory source files (`steps.ts`, `index.ts`) served through a custom compiler host, compiled with the repo's options. Exercises every object-literal shape that can smuggle a step out, plus one guarded door that must *not* be flagged.
- **`describe('a step beneath a guarded door')`** – Four tests: canary (tag read), canary (known door resolves through real barrel), canary (fixture catches all five leak shapes), and the real assertion that no barrel leaks.

## Relationships

- **`tests/support/paths.ts`** – Imports `isDeployed` (aliased as `@tests/paths`). Used to gate canary tests and to filter `KNOWN_STEPS` so a stripped/monorepo-partial checkout skips modules that are not present.

## Notes

- The fixture uses a compiler host created via `ts.createCompilerHost` (overriding `fileExists`, `readFile`, `getSourceFile`, `directoryExists`) rather than writing temp files; the `/fixture` directory is faked in-memory.
- `referencedSymbol` intentionally stops at wrappers that do anything beyond a single call/return (e.g. a `Promise.resolve(…).then(…)` chain). Such a wrapper is treated as a *door* guarding a step, not as the step itself, and is not followed.
- `leaksOf` reports bundled leaks as `module: bundler.propName` (e.g. `payments: paymentService.settlePayment`), not just the bare name, so a failure message pinpoints the object property.
- The test is cross-cutting: it has no per-module import; it reads the filesystem and compiles all barrels at once, so a single new module with a bad barrel will surface here automatically.
- Finding an *untagged* step (missing `@internal`) is explicitly out of scope; the file's header points to `scripts/audit/reachability/SKILL.md` for that.
