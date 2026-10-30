---
source: tests/cross-cutting/guarded-steps-stay-unpublished.test.ts
sha256: 4f4e3909f0c53f7709d10de35ad01f94cf4e7d0ae5ab4ecc3e274ccdcb609019
generated_at: 2026-10-29T06:46:15.770788+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/guarded-steps-stay-unpublished.test.ts

## Purpose

Enforces that any top-level declaration tagged `@internal` (a "step"—a write operation meant to run only behind its module's own guard function) never becomes visible through the module's barrel (`src/modules/<name>/index.ts`). Because no static-analysis rule can distinguish a step from its guarding door by syntax alone, the codebase uses TSDoc `@internal` as the marker, and this suite verifies the marker is sufficient: no barrel, `export *` chain, renamed re-export, object-literal bundle, or single-forward wrapper may publish an `@internal` symbol to a sibling module.

## Key elements

- **`isTaggedInternal(declaration)`** — Returns `true` if any TSDoc tag on the declaration (walked via `ts.getJSDocTags`) is `@internal`.
- **`guardOver(program)`** — Core guard factory. Given a `ts.Program`, returns a `leaksOf(barrel, module)` closure that enumerates every `@internal` symbol a barrel publishes, whether directly exported or smuggled out inside an object literal.
- **`referencedSymbol(value)`** — Resolves the right-hand side of an object property to the underlying symbol. Handles identifiers, member expressions, and single-forward arrow/function expressions (including braced `return`). Multi-statement wrappers are deliberately *not* followed (treated as a door, not a leak).
- **`spreadSymbols(spread)`** — Resolves `...expr` in an object literal to the namespace's exports or the object's properties.
- **`bundledSymbols(declaration)`** — For a `const x = { … }` initializer, returns every symbol the object bundles by reference, covering shorthand, property assignment, member, forwarder, and spread shapes.
- **`leaksOf(barrel, module)`** — Returns an array of `"<module>: <name>"` (or `"<module>: <bundle>.<key>"`) strings for each internal symbol the barrel exposes.
- **`KNOWN_STEPS`** — Filtered list of `@internal` names documented in the codebase (`applyTransition`, `performRefund`, `settlePayment`), used as canary assertions.
- **`taggedSteps()`** — Walks every source file under `src/modules` and collects the names of all top-level `@internal` declarations.
- **`FIXTURE` / `fixtureGuard`** — A two-file in-memory program (served via a custom `ts.CompilerHost`) that plants one `@internal` step and re-exports it in every shape a service object can carry. Used as a canary to prove the guard catches each shape and does *not* flag a genuine guard wrapper.
- **Test suite (4 tests)** — Canary: tag is read · Canary: a known door resolves · Canary: fixture shapes are all caught · **The real assertion:** no barrel in the deployed codebase leaks an `@internal` symbol.

## Relationships

- **`tests/support/paths.ts`** (`@tests/paths`) — Provides `isDeployed(module)`. The test uses it to (a) filter `KNOWN_STEPS` so a stripped checkout has no canary to match, and (b) skip the `paymentService` resolution canary when the payments module is not deployed.

## Notes

- The guard is written against the **TypeScript Compiler API** directly (`ts.createProgram`, `getTypeChecker`, `getExportsOfModule`) rather than a linter plugin, because the distinction "step vs. door" is a semantic, project-specific convention, not a syntactic pattern.
- `noEmit: true` is forced into the compiler options; this is pure analysis.
- Forwarder detection is intentionally narrow: only a body that is *exactly* one call expression (or a single `return <call>`) is followed. Any wrapper with additional logic (e.g., `Promise.resolve(id).then(… => step(…))`) is treated as a legitimate door and is **not** flagged—this is the one shape the fixture verifies must *not* appear in the leak list.
- The file references `scripts/audit/reachability/SKILL.md` (for *finding* untagged steps) and `docs/theory/strategic-ddd.md` §5 (for the design rationale), but neither is imported or executed here.
- Module names for the final assertion are derived by taking the first path segment relative to `src/modules`, so the reported leak line reads `payments: settlePayment` rather than an absolute path.
