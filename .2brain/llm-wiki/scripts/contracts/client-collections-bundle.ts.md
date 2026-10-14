---
source: scripts/contracts/client-collections-bundle.ts
sha256: af9e037941ad07f01dbd7858fb53c478286fe4a144aa01eb8e4ce027a3272c9d
generated_at: 2026-10-14T07:10:55.647350+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration-only file that, on demand (`npm run contracts:bundle`), renders four API-client collections (Bruno, Insomnia, Mockoon, Postman) from the repo's OpenAPI contract, seeded subject data, and per-module authored probes. The actual traversal, example synthesis, and format emitters live in `@guebbit/openapi-runnable-collections`; this file supplies only the three things only this repo can answer: section ownership, real seed values, and negative-case probes. Output is generated, never committed (`.gitignore`d).

## Key elements

- **`sections()`** — Maps `SECTION_ORDER` to `{ name, paths }` sections via `sectionPaths()`, dropping any module with zero owned paths (e.g. `access`).
- **`values`** (`ValueSources`) — The generator's value table:
  - `byProperty` — Fills named body/path fields (ids, credentials, `quantity`, `page`, etc.) with seeded or reasonable defaults.
  - `byOperation` — Full bodies for `POST /account/login` (admin creds) and `POST /account/signup`.
  - `byFormat` — Real seeded email/password so `email`/`password` format fields never get placeholders.
  - `pathParam(name, template)` — Routes path params to the correct seed id by domain prefix; orders use `{{orderId}}` (a collection variable, not a literal).
  - `tokens` — `{{…}}` tokens probes may reference, sourced from `SUBJECTS` and `SEED_PRODUCT_IDS`.
- **`ORDER_ID_VARIABLE`** — `{{orderId}}` placeholder; orders are minted at runtime so no stable id exists.
- **`modulesDeclaringProbes(modulesRoot?)`** — Scans `src/modules/<name>/probes.ts` on disk; returns sorted list of module names that declare one.
- **`loadProbes()`** — Memoised dynamic `import()` of every discovered `probes.ts`; validates each exports a `probes` array. Memoised because probes are static source (unlike the contract).
- **`generate()`** — Single call to `generateCollections()` with spec, sections, probes, values, and all four targets. **Not** memoised: `build-bundles.ts` writes `openapi.yaml` in phase 1, so caching would return a stale result.
- **`allProbes()`** — Returns only the probe-derived requests from a `generate()` run (for coverage assertions).
- **`collectionContent(tool)`** — Public entry point the bundle registry calls; returns the rendered document string for one tool.
- **`COLLECTION_TOOLS`** — `['bruno', 'insomnia', 'mockoon', 'postman']` as const; names the targets in the order this file passes them.
- **`COLLECTION_NAME`** — `'Boilerplate API'`, displayed by tools that show a name.

## Relationships

- **`scenarios/subjects.ts`** — Source of all real ids, emails, passwords, and special product ids (`SEED_PRODUCT_IDS`). This file never imports module fixtures (`scenarios/products.ts` etc.) to avoid a circular import through the generated `@api/` client.
- **`scripts/contracts/bundle-kinds.ts`** — Provides `REPO_ROOT` used for all filesystem paths.
- **`scripts/contracts/openapi-bundle.ts`** — Provides `SECTION_ORDER` and `sectionPaths()`, which determine folder structure and per-module path ownership.
- **`scripts/contracts/bundle-registry.ts`** — Dynamically `import()`s this file (via `collectionContent`) so that loading the registry does not pull in the seed values at module-evaluation time.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Integration test that exercises the full generation pipeline across all four tools.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — Asserts that adding a new module requires no edit to this file (discovery-based, not list-based).

## Notes

- **No memoisation on `generate()`** is intentional: the contract file is written by `build-bundles.ts` *before* generation runs in the same CLI invocation. Caching would return a result computed before the spec existed.
- **Dynamic `import()` of `.ts` probes** relies on `tsx` / `ts-jest` resolving bare `.ts` paths; a bundler or `node` without a TS loader will not.
- **`orderId` is always a collection variable**, never a literal, because order ids are minted at shop-build time and differ per run. The orders section's first probe is the request that fills `{{orderId}}`.
- **Probes are the only way negative cases enter the collections**: a spec declares valid calls, so no generator can synthesize a bogus token or malformed body. A module without `probes.ts` simply contributes no negative requests — that is expected, not an error.
- **Postman is a distinct emitter** (Collection Format v2.1), not a renamed Insomnia export, because v2.1 splits URLs into parts and reads those rather than the concatenated string.
