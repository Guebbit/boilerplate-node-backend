# tests/unit/kernel/registry.test.ts

## Purpose

Unit tests for the kernel module registry's validation and registration logic. The registry decides what "this build" means at boot time, so these tests ensure misconfigurations (duplicates, missing deps, cycles, self-references) are caught immediately with a specific, named error rather than surfacing later as a 500 on the first request.

## Key elements

- **`makeModule(name, dependsOn?)`** — Local factory that produces a minimal `AppModule` fixture: a fixed `subdomain: 'supporting'`, a `Router()` instance, and dependency entries with `as: 'conformist'` and a templated `because` string. Used to build small module graphs inline.
- **`describe('validateModules')`** — Eight cases covering: valid registry accepted; duplicate name rejected; missing dependency named in the error; 2-node and 3-node cycle paths reported; headless module (no `routes`) accepted as a valid entry; self-dependency reported as a distinct "declares a dependency on itself" error (not a cycle); diamond dependency accepted as non-cyclic.
- **`describe('registerModules')`** — Two cases: `subscribe` is called on every module that provides it; validation runs *before* any `subscribe` call, so a broken registry attaches zero handlers.

## Relationships

- **`src/kernel/registry.ts`** — Source of `registerModules`, `validateModules`, and the `AppModule` type under test. All assertions exercise the public API of that module.
- The file's header comments note that relationship *kinds* (the `as` / `because` semantics on dependency edges) are tested elsewhere, in `tests/cross-cutting/context-map.test.ts`, against real manifests. This file intentionally ignores them.

## Notes

- **Self-dependency vs. cycle:** A module listing itself in `dependsOn` is reported as a typo ("declares a dependency on itself"), not folded into cycle detection. The cycle walk would otherwise render it as `products → products`, which reads like a structural finding rather than a one-character mistake.
- **Headless modules:** A module with no `routes`/`Router` (e.g. `audit-logs`) is a first-class registry entry. Other modules may still declare a dependency on it. The factory `makeModule` always attaches a `Router()`, so the headless case uses an inline object literal instead.
- **Cycle path ordering:** The 2-node cycle test accepts either starting point (`cart → products → cart` *or* `products → cart → products`) because the implementation may report the cycle from whichever node it encounters first.
- **`as: 'conformist'` in fixtures:** Always hardcoded. These tests are about graph topology (cycles, duplicates, missing nodes), not about the semantic kind of the relationship.
