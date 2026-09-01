# docs/theory/domain-layer.md

## Purpose

Explains the `domain/` folder convention in this codebase and its relationship to DDD. It defines what qualifies as a domain rule (testable without a database), how the boundary is enforced via ESLint, and which of the thirteen modules actually have a `domain/` folder. It also situates the pattern within four broader architectural traditions (DDD, Hexagonal, Onion, Clean Architecture) so readers arriving from a non-DDD background understand why the folder exists.

## Key elements

- **Placement decision flow** — two questions ("testable without a DB?" / "does it produce a status code or translated text?") determine whether logic belongs in `domain/`, `service.ts`, `repository.ts`, or `controllers/`.
- **Import restriction** — `domain/` may never import `mongoose`, `express`, `@infrastructure/*`, `@kernel/*`, `@app/*`, `@modules/*`, or its own module's outer files. Enforced by a path-based rule in `eslint.config.ts` targeting `src/modules/*/domain/**`.
- **Verdict shape** — domain rules return `{ ok: boolean, reason: string }` (or a value); they never emit HTTP status codes or i18n strings. `service.ts` translates verdicts into responses.
- **The floor test** — a rule earns `domain/` only if it has >1 caller *or* a non-obvious failure mode. One-line expressions with a single caller are inlined.
- **Worked examples** — `delivery/domain/` (two pure functions, the module's entire barrel), `orders/domain/lifecycle.ts` (status-transition table), `orders/domain/money.ts` (branded `Money` integer type), `inventory/domain/transitions.ts` (stock-transition table + availability subtraction).
- **Architecture comparison table** — maps the same "innermost ring" concept across Evans (2003), Cockburn (2005), Palermo (2008), and Martin (2012).

## Relationships

- **`docs/theory/strategic-ddd.md`** — this file links to Strategic DDD for the distinction between a "published language" and a dependency edge; Strategic DDD builds on the domain boundary defined here.
- **`docs/theory/tactical-ddd.md`** — `orders/domain/money.ts` is explicitly described as a tactical DDD value type *within* a codebase that is otherwise not doing tactical DDD; that file elaborates the broader pattern.
- **`docs/theory/layers.md`** — the three-ring diagram (outside / application / rules) in this file is the same layering model documented there; this page adds the `domain/`-specific rules and floor test.
- **`docs/theory/modules.md`** — the module layout (`src/modules/<name>/domain/`) referenced here is defined in the modules page.
- **`docs/modules/delivery.md`** — `delivery/domain/` is cited as the shortest worked example of the pattern; that module page documents the rest of the delivery module.
- **`docs/modules/inventory.md`** — `inventory/domain/transitions.ts` is cited as the "model itself" case; that module page covers the service, repository, and test layers around it.
- **`docs/theory/glossary.md`** — terms like *verdict*, *domain rule*, and *branded type* used here are defined in the glossary.
- **`docs/theory/index.md`** — this file is listed in the theory index as the entry point for domain-layer questions.
- **`docs/reference/src-modules.md`** — the thirteen-module listing referenced ("out of thirteen") is maintained in the source-modules reference.
- **`github/copilot-instructions.md`** — the import restriction and verdict shape are conventions an AI assistant must respect when editing `domain/` files; the Copilot instructions cross-reference this page.

## Notes

- The folder is **optional per module**: only four of thirteen modules (`orders`, `cart`, `delivery`, `inventory`) have one. Do not create an empty `domain/` to match a shape.
- Lint enforces the boundary (path-based ESLint rule); it is not the *reason* the folder exists. The reason is testability — property-based tests (e.g., 13 properties × 300 generated baskets) run with zero setup because the file under test cannot reach anything.
- `domain/` is **not** a full DDD implementation. There is no Aggregate, no Repository pattern in the DDD sense, and no shared kernel. The file is explicit that DDD is a broader framework and `domain/` is one element borrowed from it.
- The `Money` type in `orders/domain/money.ts` is intentionally **module-local**, not in a shared kernel, because the lint rule forbids `domain/` from importing `@kernel/*`. If a second module needs money arithmetic, the architectural question (shared kernel vs. duplication) must be resolved deliberately.
