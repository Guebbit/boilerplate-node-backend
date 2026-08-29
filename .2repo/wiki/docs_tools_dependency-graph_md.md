# docs/tools/dependency-graph.md

## Purpose

Documentation for the dependency-cruiser check (`npm run check:dependencies`) that runs over `src/` using the config in `.dependency-cruiser.cjs`. It explains *why* this tool exists alongside ESLint boundaries (reachability and cycle detection—two questions a per-file linter cannot answer), and records the non-obvious config choices that make the rules actually functional.

## Key elements

- **Reachability rules** — three rules using `reachable: true` to catch transitive paths (e.g. domain → helper → mongoose) that a direct-import lint rule would miss.
- **Cycle detection** — catches `A → B → A` import cycles that compile and lint cleanly but fail nondeterministically at boot.
- **`tsConfig: { fileName: 'tsconfig.json' }`** — required so path aliases (`@modules`, `@kernel`, etc.) resolve; without it the graph is disconnected and every rule vacuously passes.
- **`node_modules` in `doNotFollow`, not `exclude`** — `doNotFollow` keeps the module as a graph node (so rules can match it); `exclude` removes it entirely and rules silently match nothing.
- **`tsPreCompilationDeps` off** — avoids reporting type-only import cycles that TypeScript erases at runtime and that cannot cause boot-order failures.

## Relationships

- **`dependency-cruiser.cjs`** — the actual rule/config file this page documents. The wiki is the "why" and gotcha reference; the `.cjs` is the "what".
- **`eslint.config.ts`** — enforces the tier walls (`eslint-plugin-boundaries`) at the per-file import level. This tool deliberately does *not* restate those walls; anything expressible as "this file may not import that file" belongs in ESLint.
- **`tsconfig.json`** — source of the path aliases that dependency-cruiser must resolve. The `tsConfig.fileName` setting in the cruiser config points here; without it the graph is a set of unresolvable specifiers.

## Notes

- Both critical settings (`tsConfig` and `doNotFollow` vs `exclude`) initially failed **open**: the run was green while checking nothing. If you edit the cruiser config, verify a rule you *know* should fire actually does.
- The `reachable: true` rules cover domain→persistence, domain→HTTP, and infrastructure→higher domains. Adding a new tier or dependency target requires a matching rule here *and* a corresponding lint rule in `eslint.config.ts` for the direct-import case.
- This page is the authoritative explanation for the config; if the config and this doc disagree, the doc is likely stale and should be updated.
