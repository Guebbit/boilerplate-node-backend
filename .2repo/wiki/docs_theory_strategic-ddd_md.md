# docs/theory/strategic-ddd.md

## Purpose

Documents the four strategic-level DDD patterns this repo actually adopts — bounded contexts, context mapping, ubiquitous language, and subdomain distillation — and frames each in terms of where the claim lives (folder, docblock, identifier, barrel) versus where enforcement lives (ESLint, structural import rules). Explicitly scoped to the *strategic* half; tactical patterns (entities, aggregates, domain repositories) are deferred to `tactical-ddd.md` and `TACTICAL_DDD_PLAN.md`.

## Key elements

- **Bounded context (§1)** — One module folder = one context; covered in depth in `modules.md`, assumed here.
- **Context map kinds (§2)** — Four relationship types (`conformist`, `customer-supplier`, `published-language`, `shared-kernel`) with a cost-of-change table. Lives in each module's `module.ts` docblock.
- **Ubiquitous language (§3)** — Language lives in identifiers; meaning lives in `glossary.md` (one section per module, preserving per-context divergence).
- **Subdomain distillation (§4)** — Classifies modules as `core` / `supporting` / `generic`; states the rule that a `generic` module should not carry a `domain/` folder (and the deliberate absence of a converse rule).
- **Published language / barrel (§5)** — `index.ts` as the sole import surface; ESLint enforces it structurally. Convention: publish only what a sibling actually imports; repositories require stronger justification than types.
- **Mermaid flowchart** — Diagram separating "where the claim lives" (folder, docblock, identifiers) from "what makes it hold" (no barrel, eslint-plugin-boundaries, glossary).
- **Removal notes** — Documents why `dependsOn`, `language`, and `subdomain` manifest fields were deleted in favor of prose next to code; cross-references `OVERENGINEERED.md` for the full argument.

## Relationships

- **`docs/theory/tactical-ddd.md`** — The complementary half; this page defers entities/aggregates/domains to it and links out for the two patterns that did land.
- **`docs/theory/modules.md`** — Owns the "one folder per context" rule that this page assumes and builds on.
- **`docs/theory/glossary.md`** — Holds the per-module language sections this page points to as the home for ubiquitous-language meaning.
- **`docs/theory/domain-layer.md`** — Cited for the folder-vs-DDD distinction (packaging ≠ modelling).
- **`docs/theory/index.md`** — Parent theory index; this page is one of its children.
- **`docs/theory/module-lifecycle.md`** — Sibling theory page; the subdomain table and barrel conventions here interact with the lifecycle rules there.
- **`docs/modules/cart.md`, `docs/modules/delivery.md`, `docs/modules/users.md`, `docs/modules/account.md`, `docs/modules/products.md`, `docs/modules/account-sessions.md`** — Concrete instances of the context-map kinds, barrel conventions, and subdomain classifications described here (e.g. `cart → delivery` as published-language, `account → users` as shared-kernel, `inventory`'s refusal to export repositories).
- **`docs/reference/src-modules.md`** — The `src/modules/` directory structure that the folder-per-context rule and `rm -rf` test are applied to.
- **`docs/reference/src-app.md`** — App-level wiring where the barrel/import boundary is ultimately consumed.

## Notes

- The subdomain classification table is explicitly a **worked example for a boilerplate**, not a finding. A real project is expected to re-decide every row.
- Several formerly-structural mechanisms (manifest fields, cross-cutting tests) were removed because they self-reported without runtime consumers; the structural enforcement (eslint-plugin-boundaries, no-barrel, `check:dependencies`) remains and is the real guardrail.
- The file references `TACTICAL_DDD_PLAN.md` as a sibling file in the workspace (not in this repo's `docs/`), and `OVERENGINEERED.md` for the removal arguments.
- Anticorruption layer is deliberately *not* in the context-map table; the note explains that it applies to external providers (e.g. `payments` → `./providers`), not to sibling modules in this repo.
