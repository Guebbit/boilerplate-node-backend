# docs/theory/reading-path.md

## Purpose

A prescribed first-hour reading order for new contributors. It names nine files in sequence, gives a one-paragraph "take away" for each, tells the reader what to skip until they have a mental model, and states five architectural invariants the rest of the codebase assumes. It exists so that nobody has to guess where to start in ~21 k lines across 13 modules.

## Key elements

- **Mermaid flowchart** — the 9-node reading sequence (boot → modules list → registry → products module → routes → controller → service → repository → response shape).
- **Nine numbered sections** — one per file (`app.ts` through `response.ts`), each with line count, role, and a bolded "Take away."
- **"Then: pick your next question" table** — links out to `request-flow.md`, `layers.md`, `module-lifecycle.md`, the OpenAPI workflow, and the tools page depending on the reader's next goal.
- **"What to skip" table** — six categories of files (adapters, observability, per-module OpenAPI, the `account` module, `cluster.ts`, config files) with the condition under which to revisit each.
- **"Five rules" list** — module-is-a-value, layers-point-downward, contract-is-an-output, single-responsibility-per-layer, `id` ≠ `_id`.

## Relationships

- **`src/app.ts`** — node 1; the page's only claim is that its six `install*` calls define the middleware order.
- **`src/modules.ts`** — node 2; the page notes it is the sole enable/disable switch for domains.
- **`src/kernel/registry.ts`** — node 3; the page identifies `AppModule` as a union of `RoutedModule` | `HeadlessModule`.
- **`src/modules/products/module.ts`** — node 4; explicitly designated "the reference module" to copy when adding a domain.
- **`src/modules/products/routes.ts`** — node 5; the page calls out static-before-param ordering and intentional multi-URL → single-handler mapping.
- **`src/modules/products/controllers/get-products.ts`** — node 6; the page presents its five-step shape as universal across all ~60 controllers.
- **`src/modules/products/service.ts`** — node 7; the page asserts services never touch Express or Mongo.
- **`src/modules/products/repository.ts`** — node 8; the page highlights the `SearchSpec` data-driven filter pattern.
- **`src/infrastructure/http/response.ts`** — node 9; the page flags that `rejectResponse` returns (does not throw).
- **`docs/theory/request-flow.md`** — linked from the "Then" table as the next stop for understanding middleware travel.
- **`docs/theory/modules.md`** — sibling theory page; this page delegates the full module anatomy to the registry section and the `modules.ts` section rather than duplicating it.

## Notes

- This is a **documentation** file, not source code. It contains no exports, no runtime logic, and no imports.
- The page is written as prose with embedded Mermaid and tables; it is not itself versioned against a specific commit, so line counts (e.g. "150 lines") drift as code changes.
- The "five rules" are stated as invariants, not enforced by tooling (except rules 2 and 4 via `eslint` import boundaries).
- The `account` module is singled out as "biggest and least typical" (21 routes, JWT, cookies, sessions) and deliberately excluded from the reference path.
