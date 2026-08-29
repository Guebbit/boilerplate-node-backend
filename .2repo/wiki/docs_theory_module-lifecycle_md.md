# docs/theory/module-lifecycle.md

## Purpose

A step-by-step procedural guide for adding and removing a module. While `modules.md` explains *why* the module shape looks the way it does, this page is the operational checklist: which registries to touch, what files to create, in what order, and which commands to run. It exists so that the "one folder + one registry line" claim stays enforceable rather than aspirational.

## Key elements

- **Five-registry table** — the canonical list of where a module must be named: `enabledModules` (always), `MODULE_SECTIONS` (HTTP), `ANALYTICS_SECTIONS` (analytics), `ASYNC_SECTION_ORDER` / `SHARED_SECTIONS` (asyncapi), `FRONTEND_PAIRING` (always). Plus the near-sixth: `probes.ts` imports in the client-collections bundle.
- **Adding-a-module flow (7 steps)** — `mkdir` → registry line → contract fragments → `npm run contracts:bundle` → `docs/modules/<name>.md` → frontend copy → `npm run complete`.
- **Folder layout convention** — `module.ts` is the sole import target; everything else is optional and self-registering. `wishlist` is the reference tree.
- **`module.ts` manifest contract** — `name`, `subdomain`, `basePath`, `routes`, `dependsOn` (with `as`/`because`), `locales`, `seeds`. Strategic fields (`subdomain`, `as`, `because`) are required and validated by tests.
- **Headless module note** — omitting `basePath`/`routes` yields a valid module (e.g. `audit-logs`); the union type makes a dangling router a compile error.
- **Contract-fragment rules** — a section entry without a fragment is a hard error; a fragment without a section entry is silently dropped. `SHARED_SECTIONS` decides what reaches `asyncapi.public.yaml` and the paired frontend.
- **`npm run contracts:bundle`** — assembles OpenAPI, both AsyncAPI bundles, analytics events, and seed identities. Client collections (Bruno, Insomnia, Mockoon, Postman) are opt-in flags and git-ignored.
- **Docs page shape** — `docs/modules/<name>.md` is hand-written, three-part (At a glance / The story / Related pages), and must not restate code.
- **Removal procedure** — mirror of addition; `rm -rf` the folder, delete each registry line, mirror deletions in the paired frontend. Anything else that breaks is flagged as real coupling.

## Relationships

- **`docs/theory/modules.md`** — the companion "why" page. This file explicitly defers to it for the reasoning behind the shape and for strategic-DDD detail.
- **`src/modules.ts`** — holds the `enabledModules` array; the single line added/removed in step 2 lives here.
- **`scripts/contracts/openapi-bundle.ts`** — owns `MODULE_SECTIONS`; the domain's `openapi.yaml` fragment is listed here.
- **`scripts/contracts/analytics-events-bundle.ts`** — owns `ANALYTICS_SECTIONS`; stale entries here produce the named hard error.
- **`scripts/contracts/asyncapi-bundles.ts`** — owns both `ASYNC_SECTION_ORDER` and `SHARED_SECTIONS`; the shared split determines what the paired frontend receives.
- **`scripts/contracts/client-collections-bundle.ts`** — statically imports each `probes.ts` by name; deletion stops the build, but a *new* probe file without an entry here is silent (caught only by the test below).
- **`tests/cross-cutting/frontend-pairing.test.ts`** — enforces that every module has a `FRONTEND_PAIRING` entry (or a documented "none" sentence); fails on missing entries.
- **`tests/cross-cutting/probes-are-wired.test.ts`** — fails when a `probes.ts` exists on disk but is not listed in `client-collections-bundle.ts`, closing the silent-omission gap.

## Notes

- `FRONTEND_PAIRING` is the only registry that names the *other* repository; forgetting it does not break the build, it widens the FE/BE gap silently.
- The old `SEED_SECTION_ORDER` registry no longer exists. Demo data is now **published** via `npm run seed:export` (real seeders → `db/demo/demo-data.json`); a module just needs a `demo.ts`. Staleness check: `npm run check:seed-export`.
- Route mounting, the seeder, i18n boot, audit vocabulary, and the metrics registry all *walk* `enabledModules` rather than enumerating domains independently — that is why they never appear in the add/remove checklist.
- A fragment on disk with **no** section entry is worse than a section entry with no fragment: it is silently ignored, so the endpoint ships undocumented.
- Client-collection files (`contract.*.bruno`, etc.) are generated, git-ignored, and never hand-edited. A request the contract cannot describe belongs in that module's `probes.ts`, not in a collection export.
- `dependsOn` entries name siblings, not files. An undeclared cross-module import surfaces as a 500 at runtime; a declared one fails boot by name if the sibling is disabled.
