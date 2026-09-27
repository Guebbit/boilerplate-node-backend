---
source: scripts/contracts/client-collections-bundle.ts
sha256: ffa6a1e4253ad5cea0377142c8c957b7c9acb950a6d94fa9b764ee6a221f889f
generated_at: 2026-09-27T13:53:10.536666+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration file that drives generation of four API client collections (Bruno, Insomnia, Mockoon, Postman) from the repo's OpenAPI spec. It supplies the three repo-specific inputs the generic generator (`@guebbit/openapi-runnable-collections`) cannot infer: which module owns which path, which real seed values to substitute, and which rejection probes each module authors. The generated files are `.gitignore`d and produced on demand via `npm run contracts:bundle`.

## Key elements

- **`COLLECTION_TOOLS`** — Ordered tuple of the four target tools.
- **`ORDER_ID_VARIABLE`** — `{{orderId}}` collection variable; orders are minted at runtime so no static id can be used.
- **`sections()`** — Maps `SECTION_ORDER` (from `openapi-bundle.ts`) into `Section[]` with per-section paths.
- **`values`** (`ValueSources`) — The substitution table: `byProperty`, `byOperation`, `byFormat`, `pathParam`, and `tokens`. Only ids and credentials are real; everything else falls through to type-shaped defaults.
- **`PROBES`** — Static map of section name → probe array, imported by name from each module's `probes.ts`.
- **`PROBED_SECTIONS`** *(exported)* — Keys of `PROBES`; consumed by the completeness guard in tests.
- **`allProbes()`** *(exported)* — Flattened list of all probe requests after one generation run; used by coverage checks.
- **`brunoBundle` / `insomniaBundle` / `mockoonBundle` / `postmanBundle`** *(exported)* — `ContractBundle` objects carrying name, output path, and a lazily-evaluated `content` function that calls `generate()` and extracts the tool's document.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Provides `SECTION_ORDER`, `sectionPaths()`, and the `SectionName` type that define the path-to-module mapping.
- **`scripts/contracts/bundle-kinds.ts`** — Provides `REPO_ROOT` and the `ContractBundle` shape used by the four exported bundles.
- **`scenarios/subjects.ts`** — Source of all real seed data (`SUBJECTS`, `SEED_PRODUCT_IDS`) injected into request bodies, path params, and probe tokens.
- **`src/modules/{account,cart,orders,products,wishlist}/probes.ts`** — Each module's authored rejection probes, statically imported into the `PROBES` map.
- **`tests/cross-cutting/probes-are-wired.test.ts`** — Guards that every module shipping a `probes.ts` is also present in the `PROBES` map (the addition case the compile-time import cannot catch).
- **`tests/cross-cutting/contract-bundles.test.ts`** — Exercises the four exported bundles end-to-end.
- **`scripts/contracts/bundle-registry.ts`** — Downstream consumer; imports the four bundle exports to register them in the build pipeline.

## Notes

- **Not memoised.** `generate()` is called fresh each time on purpose: `build-bundles.ts` writes `openapi.yaml` in a prior phase, so a cached result would predate the spec it claims to derive from.
- **Static imports, not directory scans.** Deleting a module stops compilation. The trade-off (a new module's probes silently missing until wired in) is covered by `probes-are-wired.test.ts`.
- **Postman is a separate emitter**, not a renamed Insomnia export: Collection Format v2.1 splits URLs into parts and reads those, and the compatibility is one-directional.
- **Output files live at the repo root** (`contract.<tool>.<ext>`), beside `openapi.yaml`, not in a dotfolder. They are `.gitignore`d; ~1.9 MB of derived text would otherwise appear in every contract diff.
- **Only two `byOperation` overrides exist** — both for login/signup — because a non-admin token would 403 every admin endpoint and the first action a user takes is log in.
