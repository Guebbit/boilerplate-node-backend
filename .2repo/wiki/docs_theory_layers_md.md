# docs/theory/layers.md

## Purpose

The folder map for the codebase. It defines the two orthogonal axes that determine where code lives and what it may import — **tiers** (app → modules → kernel → infrastructure) and **layers** within a module (routes → controllers → service → repository → model) — and documents the enforcement mechanisms behind those rules.

## Key elements

- **Tier stack** — Four tiers, each with a TS alias (`@app/*`, `@modules/*`, `@kernel/*`, `@infrastructure/*`); a Mermaid diagram and a quick-map table summarising each tier's job.
- **Boundary rules** — The import-permission matrix, enforced by `eslint-plugin-boundaries` in `eslint.config.ts`. Default is *disallow*; `boundaries/no-unknown-files` closes the gap for unassigned files; `npm run check:dependencies` (dependency-cruiser) adds transitive and cycle checks.
- **Layer stack (inside a module)** — `routes.ts` → `controllers/` → `service.ts` → `repository.ts` → `model.ts`, plus `module.ts` (manifest) and `index.ts` (public barrel).
- **`services/` split convention** — When a module's service exceeds ~300 lines, it becomes a `services/` folder with an `index.ts`; split by operation type, not size. Worked examples: `cart`, `account`, `locales`. A table records four modules currently over the threshold (`orders`, `inventory`, `payments`, `products`).
- **`domain/` layer** — Optional pure-business-rules folder, lint-guaranteed free of Express/Mongoose/tier imports. `delivery` is the primary worked example.
- **Module extras** — `audit.ts`, `metrics.ts`, `events.ts`, `demo.ts`, `locales/` are self-registering or manifest-declared; a module only carries them when it has something to declare.
- **No layer directories** — Top-level `src/controllers`, `src/services`, etc. no longer exist; they were transitional.
- **`docs-match-the-tree.test.ts`** — Reads the line-count table from this page and compares against `wc -l`, turning doc drift into a failing test.

## Relationships

- **`docs/theory/domain-layer.md`** — Linked directly; this page defers to it for the full treatment of what earns a `domain/` folder and the verdict-not-rejection pattern.
- **`docs/theory/architecture.md`** — Sibling theory page; this page is the structural "where does it go?" reference while architecture covers the higher-level reasoning.
- **`docs/reference/src-app.md`, `docs/reference/src-infrastructure.md`, `docs/reference/src-modules.md`** — Per-tier reference pages that document the contents of each folder this page maps at the structural level.
- **`docs/reference/tests.md`** — The `docs-match-the-tree` guard that keeps this page's line counts in sync with source is part of the test suite documented there.
- **`docs/getting-started.md`** — New readers are pointed here to understand the tier/layer vocabulary before navigating the codebase.
- **`docs/theory/index.md`** — Index page that lists this file alongside other theory pages.

## Notes

- "Tiers" and "layers" are distinct axes; the page explicitly calls out that confusing them is the usual source of placement questions.
- The 300-line `services/` threshold is a *convention*, not enforced by any linter or test. It is documented so that splitting feels sanctioned rather than furtive.
- Cross-module interaction must go through the public barrel (`@modules/<name>`); importing a sibling's internals (e.g. `@modules/cart/service`) is a boundary violation.
- Two modules needing each other are not a valid dependency pair — either merge them or invert one edge into a domain event (`src/kernel/events.ts`).
- The manifest type is a discriminated union: a module either has `basePath` + `routes`, or neither. A router without a mount point is a compile-time type error, not a silently unregistered route.
