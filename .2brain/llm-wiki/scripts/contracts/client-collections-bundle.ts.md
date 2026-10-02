---
source: scripts/contracts/client-collections-bundle.ts
sha256: 54b5fb68a0a82c71005bb362e649df24932c429de0e9b3360088bfc4a41384a1
generated_at: 2026-10-01T12:26:29.613758+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration (not machinery) for generating the four API client collections — Bruno, Insomnia, Mockoon, Postman — on demand via `npm run contracts:bundle`. The traversal and emitters live in `@guebbit/openapi-runnable-collections`; this file supplies the three things only this repo can answer: path-to-module ownership, real seed values for request bodies, and authored rejection probes. The four output files are `.gitignore`d and written to the repo root beside `openapi.yaml`.

## Key elements

- **`brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle`** — `ContractBundle` objects (one per tool) that a bundle runner consumes to write `contract.<tool>.<ext>` at the repo root.
- **`generate()`** — single entry point: loads the OpenAPI spec, resolved sections, probes, and value sources, then calls `generateCollections`. Deliberately *not* memoised (see Notes).
- **`allProbes()`** — runs the generator and returns only the requests flagged as probes; used by coverage checks.
- **`modulesDeclaringProbes(modulesRoot?)`** — directory scan that returns sorted module names whose folder contains a `probes.ts`. Discovery-based: adding or removing a probe file requires no edit here.
- **`loadProbes()`** — memoised dynamic `import()` of every discovered `probes.ts`; validates the `{ probes: Probe[] }` shape and returns a `Record<moduleName, Probe[]>`.
- **`sections()`** — maps `SECTION_ORDER` to `{ name, paths }` pairs via `sectionPaths`.
- **`values` (`ValueSources`)** — the value-resolution table:
  - `byProperty` — per-property defaults (seed ids, credentials, small scalars).
  - `byOperation` — full body overrides for `POST /account/login` (admin creds) and `POST /account/signup`.
  - `byFormat` — email/password format → seeded credentials.
  - `pathParam` — resolves `:id` by prefix-matching the path template.
  - `tokens` — named `{{…}}` slots probes can reference.
- **`ORDER_ID_VARIABLE`** (`'{{orderId}}'`) — template slot for order ids, which are minted at runtime by the demo shop and cannot be a literal.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — imports `SECTION_ORDER` and `sectionPaths` to build the section list without restating path ownership.
- **`scripts/contracts/bundle-kinds.ts`** — imports `REPO_ROOT` and the `ContractBundle` type used to shape each exported bundle.
- **`scenarios/subjects.ts`** — imports `SUBJECTS` and `SEED_PRODUCT_IDS`; the sole source of real emails, passwords, and product/user/admin ids that make generated requests work against the seeded shop.
- **`scripts/contracts/bundle-registry.ts`** — consumes the four `*Bundle` exports to register them as buildable contract bundles.
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the generated bundles end-to-end (structure, tool-specific invariants).
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — verifies that a freshly scaffolded module (with no `probes.ts`) is handled gracefully by the discovery-based probe loading.

## Notes

- **Not memoised on purpose.** `build-bundles.ts` writes `openapi.yaml` in phase 1 and calls `generate()` in phase 2. Caching the result would pin a snapshot taken before the spec it claims to derive from existed.
- **Probe loading *is* memoised.** Probes are static source; unlike the spec, they cannot change mid-run.
- **Import-cycle guard.** This file may only read from `scenarios/subjects.ts` (plain data). Importing a module's own fixtures (`scenarios/products.ts`, etc.) would pull in `@modules/*` → `@api/` (the generated client) → back here. The same cycle `openapi-bundle.ts` avoided by dropping its `enabledModules` import.
- **Admin credentials for login/signup.** `byOperation` overrides the generic user creds with the admin's, because a login that returns a narrower token makes every admin-only request in the collection fail with 403.
- **Order ids are never literals.** The demo shop mints order ids at build time; the collection exposes `{{orderId}}` and the orders section's first probe is the request that fills it.
- **Insomnia extension.** The file is named `contract.insomnia.json` (matching Insomnia's export convention) but contains YAML; Insomnia's importer keys on content, not extension.
- **Dynamic `import()` of probes.** The module list is only known after the directory scan, so each `probes.ts` is imported by computed path. Both `tsx` and `ts-jest` resolve bare `.ts` paths in this context.
