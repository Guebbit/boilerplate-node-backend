# REINVENTING_THE_WHEEL.md

## Purpose

A decision-audit document (companion to `OVERENGINEERED.md`) that records, with evidence, which hand-rolled guards and cross-cutting tests in the repo were replaced by a standard tool that answers a *stronger* question, which tool alternatives were trialled and rejected, and which hand-rolled checks were verified as necessary because no standard tool covers them. It is not code; it is the rationale archive for the lint/dependency rule set.

## Key elements

- **Resolved (hand-rolled → standard tool):** Four documented deletions/promotions:
  - `unit-layer-is-framework-free.test.ts` → `unit-layer-stays-database-free` (dependency-cruiser reachability rule).
  - `auth-surface.test.ts` second `describe` → `module-internals-are-private` (dependency-cruiser; promoted to cover all 13 modules from non-module tiers).
  - `dependsOn` / `context-map.test.ts` → `MODULE_EDGES` map in `.dependency-cruiser.cjs` (13 generated rules).
  - Two historical cross-cutting tests → `eslint/rules/` (AST-based, line-level reporting).
- **Identified, not taken:** `knip`/`ts-prune` (too much noise without config), dependency-cruiser `orphan` rule (breaks under `tsPreCompilationDeps: off`), `required` rules (shape visible in one file), mermaid diagram generation, VitePress `docs:build` as link checker (not yet in CI), Context Mapper `.cml` files.
- **Deliberately hand-rolled:** `eslint/rules/no-persistence-imports.ts` (inspects imported *bindings*, not specifiers), the content-test family (`metric-names`, `mail-copy`, `contract-*`, etc.), and `buildMessageTree` collision guards.
- **Tool-division table:** Maps each tool (`tsc`, `eslint-plugin-boundaries`, project ESLint rules, `dependency-cruiser`, `jest`, VitePress) to the specific question it answers and whether it runs in `npm run complete`.

## Relationships

No dependency-graph neighbors. The file is a standalone Markdown document. It cross-references two sibling audit pages (`OVERENGINEERED.md`, `LODASH.md`) and the live config files (`.dependency-cruiser.cjs`, `eslint/rules/*`) whose rules it documents.

## Notes

- **ESLint vs. dependency-cruiser boundary:** ESLint enforces per-file walls (editor-time, offending import); dependency-cruiser enforces graph-level properties (reachability, cycles). Two tools enforcing one property is explicitly flagged as a drift risk.
- **VitePress `docs:build` gap:** It is the only tool in the table *not* in `npm run complete` and *not* in CI. The document flags this as a one-line fix worth making.
- **The file is a point-in-time audit**, not a living spec. "Resolved" items describe what *was* deleted; "Identified, not taken" items record rejections as of the last revision. Verify against current tooling before relying on them.
- `tsPreCompilationDeps` is deliberately off in the dependency-cruiser config (avoids 8 phantom type-only cycles) and this is the stated reason the `orphan` rule is unusable here.
