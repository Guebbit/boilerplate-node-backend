# docs/theory/index.md

## Purpose

Landing page and table of contents for the Theory section. It defines the two most-repeated terms in the docs (domain, barrel), lists the structural strategies the codebase follows, and routes readers to the correct sub-page for a given question. Exists so a reader (human or AI) can orient themselves before diving into any single theory page.

## Key elements

- **Theory-in-one-screen flowchart** – Mermaid diagram showing the topic hierarchy: Contract-first → Architecture → Modules → Layers → Request flow, with Safety and Signals branching off Architecture.
- **"Domain" disambiguation (4-sense table)** – Distinguishes: (1) a business area = one folder under `src/modules/`, (2) the `domain/` sub-folder holding pure rules, (3) a domain event in `kernel/events.ts`, (4) "the domain" in the DDD sense. Explicitly states it never means a DNS name.
- **"Barrel" definition** – An `index.ts` that only re-exports; no logic. Enforces the boundary that lint checks. Notes that `observability` deliberately has no barrel.
- **"Main strategies" bullet list** – Contract-first, modular domains, layered backend, DB isolation in repositories, fail-open optional infra (Redis, Winston, Tempo, analytics), promise-chaining preference, boilerplate-generic examples.
- **"Where each topic lives" table** – 15-row navigation table mapping a reader's need to the target page (reading-path, architecture, modules, module-lifecycle, strategic/tactical-ddd, layers, request-flow, request-input, clustering, web-attack-catalog/defences, data-protection, tools/, api/).

## Relationships

- **docs/api/openapi-workflow.md** – Referenced as the source-of-truth for the contract-first strategy.
- **docs/theory/architecture.md, modules.md, layers.md, module-lifecycle.md, reading-path.md, request-flow.md, request-input.md, clustering.md, strategic-ddd.md, tactical-ddd.md, domain-layer.md, web-attack-catalog.md, web-attack-defences.md, data-protection.md** – All are linked from the "Where each topic lives" table and the strategy bullets as the detailed sub-pages this index points to.
- **docs/theory/domain-layer.md** – Specifically cited in the four-sense table (row 4) for the DDD meaning of "the domain."

## Notes

- The four-sense "domain" table is the single most important disambiguation in the entire docs set; confusion between sense 1 (folder) and sense 2 (sub-folder) is the stated common pitfall.
- The page asserts that adding/removing a domain is "a folder plus a line in `src/modules.ts`" and "`rm -rf`" respectively — treat these as the contract, not aspirational descriptions.
- `cart` is the one module that splits `service.ts` into a `services/` folder; this is called out as an exception, not the rule.
- The page is intentionally non-product-specific: examples are generic so the same structure can be reused across variants.
