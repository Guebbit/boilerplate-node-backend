---
source: scripts/contracts/client-collections-bundle.ts
sha256: a0979192569acd741398da9422783dfeaada9d478b7a1b0f84209deb78c5434c
generated_at: 2026-09-23T17:22:32.405692+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration file that feeds the `@guebbit/openapi-runnable-collections` generator to produce four API client collections (Bruno, Insomnia, Mockoon, Postman) from `openapi.yaml`. It exists to supply the three things only this repo can answer: which module owns which path, what seed values to inject into requests, and which authored probes (rejection tests) to include. The output files are gitignored and generated on demand via `npm run contracts:bundle`.

## Key elements

- **`COLLECTION_TOOLS`** — the four target tools, in order: `bruno`, `insomnia`, `mockoon`, `postman`.
- **`sections()`** — maps `SECTION_ORDER` (from `openapi-bundle.ts`) to `Section[]` with their paths.
- **`values`** (`ValueSources`) — the seed data injected into generated requests:
  - `byProperty` — realistic defaults keyed by property name (e.g. `productId`, `email`, `orderId`).
  - `byOperation` — full body overrides for `POST /account/login` (admin creds) and `POST /account/signup`.
  - `byFormat` / `pathParam` — credential and path-parameter resolution.
  - `tokens` — named `{{…}}` slots for probes to reference seed facts without hard-coding ids.
- **`PROBES`** — static map of five modules' `probes.ts` exports (account, cart, orders, products, wishlist) keyed by section name.
- **`PROBED_SECTIONS`** *(exported)* — the section names that carry probes; consumed by the completeness guard.
- **`generate()`** — one un-memoised call to `generateCollections` with the spec, sections, probes, values, and tool targets.
- **`allProbes()`** *(exported)* — flattened list of all probe requests, for coverage checks.
- **`brunoBundle` / `insomniaBundle` / `mockoonBundle` / `postmanBundle`** *(exported)* — `ContractBundle` objects pointing at `contract.<tool>.<ext>` at the repo root, each backed by a lazy `content()` closure.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides `REPO_ROOT` and the `ContractBundle` type used to shape every exported bundle.
- **`scripts/contracts/openapi-bundle.ts`** — provides `SECTION_ORDER`, `sectionPaths`, and the `SectionName` type; this file reuses its section ordering rather than restating it.
- **`scenarios/subjects.ts`** — provides `SUBJECTS` and `SEED_PRODUCT_IDS`; the sole source of real ids and credentials injected into generated requests.
- **`src/modules/{account,cart,orders,products,wishlist}/probes.ts`** — each exports a `probes` array imported statically into the `PROBES` map; deleting a module stops this file from compiling (deliberate).
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the exported bundles for correct output.
- **`tests/cross-cutting/probes-are-wired.test.ts`** — guards the addition gap: a new module that writes a `probes.ts` but forgets to add it to `PROBES` will fail this test.

## Notes

- **`generate()` is deliberately not memoised.** `build-bundles.ts` writes `openapi.yaml` in phase 1 and calls this file in phase 2; a cached result would predate the spec it claims to derive from.
- **`ORDER_ID_VARIABLE` (`{{orderId}}`)** is used instead of a literal id because demo orders are minted at runtime by `scenarios/flows/`. The collection variable is filled by the orders section's own first probe.
- **Probes are statically imported, not discovered on disk.** This keeps the compile-time failure on module deletion (per `docs/theory/module-lifecycle.md`) while `probes-are-wired.test.ts` covers the addition case.
- **Only two `byOperation` overrides exist** (login, signup) and both are for the same reason: a non-admin login token 403s every admin-only request in the collection.
- **Postman is a distinct emitter**, not a renamed Insomnia: Collection Format v2.1 parses URL parts rather than the raw string, and compatibility runs one direction only.
- **Five of seven modules declare probes.** `system` and one other section intentionally have none; a probe exists only where a rejection is meaningful.
