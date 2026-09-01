# docs/theory/layers.md

## Purpose

Folder map for the codebase: defines the two orthogonal axes that determine where any file lives — **tiers** (what a file is allowed to know: `app` → `modules` → `kernel` → `infrastructure`) and **layers** (what a file does within a domain: `routes` → `controllers` → `service` → `repository` → `model`). Consult it before asking "where does this go?" or "why can't I import that?"

## Key elements

- **Tier stack & boundary rules** — Four tiers with one path alias each (`@app/*`, `@modules/*`, `@kernel/*`, `@infrastructure/*`). Imports flow downward only; a module may reach another module's public barrel (`@modules/<name>`) but never its internals. Enforced by `eslint-plugin-boundaries` in `eslint.config.ts` with a `default: 'disallow'` policy and a `no-unknown-files` catch-all.
- **Layer stack (within a module)** — `routes.ts` → `controllers/` → `service.ts` → `repository.ts` → `model.ts`, plus `module.ts` (manifest) and `index.ts` (public barrel).
- **`services/` split convention** — A module's `service.ts` may become a `services/` folder past ~300 lines. Split by operation (e.g. `cart`: `view.ts`, `items.ts`, `checkout.ts`, `reorder.ts`, `cleanup.ts`), not by size. Barrel still exports a single `<domain>Service`.
- **`domain/` folder** — Optional pure-business-rules directory, lint-guaranteed free of Express/Mongoose/tier imports. `delivery/domain/rates.ts` is the canonical example: its two exported functions *are* the module's entire public barrel.
- **Module manifest union type** — A module either carries `basePath` **and** `routes`, or neither. A domain that owns a collection but no URL (e.g. `audit-logs`) is first-class.
- **Supplementary module files** — `audit.ts`, `metrics.ts`, `events.ts`, `demo.ts`, `locales/` — self-registering, no central enumeration.
- **No shared layer directories** — `src/controllers`, `src/services`, etc. are gone; their aliases removed from `tsconfig.json`.

## Relationships

- **`docs/theory/domain-layer.md`** — This page defers to it for the full `domain/` folder rules, verdict-not-rejection shape, and when to escalate to full tactical DDD.
- **`docs/theory/architecture.md`** — Broader architectural context; this page is the concrete folder/tier map within it.
- **`docs/theory/module-lifecycle.md`** — Complements this page: lifecycle (registration, boot, teardown) vs. structural layout.
- **`docs/reference/src-modules.md`**, **`src-app.md`**, **`src-infrastructure.md`** — Per-tier reference pages; this page defines the rules they follow.
- **`docs/modules/payments.md`**, **`payments-provider-port.md`** — Concrete module examples that illustrate the layer stack, the `services/` split, and the provider-port pattern within the tier rules.
- **`src/kernel/events.ts`** — Cited as the mechanism for resolving two-module circular dependencies (reverse edge becomes a domain event rather than a mutual import).

## Notes

- The 300-line threshold for a `services/` split is a *sanction* trigger, not an enforcement: nothing in the test suite checks it. The page deliberately omits line counts to avoid a brittle test coupling.
- `boundaries/dependencies` uses `default: 'disallow'` — a new tier added to the element list imports *nothing* until explicit rules are written. Combined with `no-unknown-files`, the boundary wall is exhaustive, not just present.
- The `npm run check:dependencies` (dependency-cruiser) step adds transitive-reachability and cycle detection, which no per-file lint rule can express.
- The `cart` and `catalogue` pair is the worked example for "two modules that need each other are one module or a domain event."
