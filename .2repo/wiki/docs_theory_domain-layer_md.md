# docs/theory/domain-layer.md

## Purpose

Defines the placement rule for the `domain/` folder, the lint-enforced dependency boundary that protects it, the verdict pattern its functions follow, and the "floor" test that decides whether a rule actually earns a place there. Also clarifies the relationship between this folder and DDD as a broader discipline.

## Key elements

- **Placement rule** — A business rule is "anything you could test without a database." If it also produces a status code or translated text, it belongs in `service.ts`, not `domain/`.
- **Dependency boundary (lint-enforced)** — `domain/` may not import `mongoose`, `express`, `@infrastructure/*`, `@kernel/*`, `@app/*`, `@modules/*`, or its own module's outer files. ESLint targets `src/modules/*/domain/**` by path.
- **Verdict pattern** — Domain functions return `{ ok, reason }` objects, never HTTP status codes or i18n strings. The service layer translates verdicts into responses.
- **The floor test** — A rule earns `domain/` when it has more than one caller *or* a non-obvious failure mode. One-line expressions with a single caller and no trap are inlined.
- **Worked examples** — `delivery/domain/` (two pure pricing functions), `orders/domain/lifecycle.ts` (status-transition table), `orders/domain/money.ts` (branded minor-unit integer), `inventory/domain/transitions.ts` (counter-delta table).
- **Folder is optional** — Only 4 of 13 modules have a `domain/` folder. Creating one for shape-matching is explicitly discouraged.
- **Four-tradition table** — DDD, Hexagonal, Onion, and Clean Architecture all describe the same inward-only dependency ring.

## Relationships

- **`docs/theory/architecture.md`** — This page is the "domain layer" section of the broader layered architecture; architecture.md defines the full ring (controllers → service → repository → domain), while this page zooms into the innermost ring and its boundary rules.
- **`docs/theory/strategic-ddd.md`** — Referenced for the distinction between "published language" (a domain folder as a shared contract between modules) and an internal implementation handle. The `delivery/domain/` example is cited as the clearest instance of that distinction.
- **`docs/theory/tactical-ddd.md`** — Referenced when noting that `orders/domain/money.ts` is a tactical-DDD value type living in a codebase that is "not otherwise doing tactical DDD," making it an isolated, module-local application of that pattern.

## Notes

- The lint rule exists because ESLint matches on paths; a folder is the only unit a linter can target. The folder's *purpose* is making property-based testing possible, not satisfying the linter.
- `orders/domain/money.ts` stays inside `orders` (not in a shared kernel) partly because the lint rule forbids domain folders from importing `@kernel/*`.
- The file uses the term "DDD spelling" for the folder name — the idea predates and outlives DDD as a label; the name is a convention, not a commitment to full DDD.
