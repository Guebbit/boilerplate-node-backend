# docs/theory/strategic-ddd.md

## Purpose

Documents the four strategic DDD patterns adopted in this codebase — bounded contexts, typed context maps, ubiquitous language, and subdomain classification — and how each is declared on the module manifest and enforced by cross-cutting tests. It exists so that architectural claims ("orders owns the order lifecycle", "authentication is generic") remain verifiable in code rather than drifting silently in prose.

## Key elements

- **Bounded context rule** — one module = one context; deletion is `rm -rf` + one manifest line. Covered in depth in `modules.md`.
- **Context map (`dependsOn` array)** — typed, labelled edges between modules with four kinds (`conformist`, `customer-supplier`, `published-language`, `shared-kernel`). Each edge carries `as` and `because` fields.
- **Ubiquitous language** — language lives in identifiers; meanings live in per-module glossary sections. The former `language: {}` manifest field was removed.
- **Subdomain classification** — each module is tagged `core`, `supporting`, or `generic`. Enforced rule: a `generic` module must not carry a `domain/` folder.
- **Published language / barrel discipline** — a module's `index.ts` exports only what a sibling actually imports; no sibling, no barrel.
- **Mermaid flowchart** — illustrates the claim-to-test relationship for `subdomain`, `dependsOn`, and language.

## Relationships

- **`TACTICAL_DDD_PLAN.md`** — sibling planning doc that prices adopting tactical DDD (entities, aggregates, repositories). This file explicitly scopes itself to what is *not* in that plan.
- **`docs/theory/domain-layer.md`** — referenced for the packaging-vs-modelling distinction (§2–3) and for the current state of the `domain/` folder.
- **`docs/theory/glossary.md`** — carries the per-module ubiquitous-language meanings that this page delegates to.
- **`docs/theory/modules.md`** — source of the one-module-one-context rule this page assumes.
- **`docs/theory/tactical-ddd.md`** — documents the two tactical patterns that *did* land (`Money`, order lifecycle table) as exceptions within this strategic framework.
- **`tests/cross-cutting/context-map.test.ts`** — the enforcement test for the context map: no phantom edges, no undeclared imports, every edge has a human-written reason, `shared-kernel` stays to one allowlisted entry.

## Notes

- Anticorruption layer is deliberately absent from the edge kinds — every nameable `dependsOn` target is a sibling in this repo; external providers (e.g. `payments` wrapping a PSP) sit behind `./providers`, not the registry.
- Subdomain values are an *example*, not a finding: the file warns that a boilerplate has no true core domain and that a real project should re-decide every row.
- No rule forces `core` modules to have a `domain/` folder; `products` is core without one by design.
- Module specs and a barrel's own re-exports do not count as "consumers" when sizing the published surface.
