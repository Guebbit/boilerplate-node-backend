# docs/api/regenerating.md

## Purpose

Quick-reference cheat sheet for "I edited a fragment — now what does the pipeline need?" It documents the regeneration pipeline (bundle → generate → seed → sync), the dependency ordering that makes it non-trivial, and the verification gates that catch skipped steps. It complements `contract-fragmentation.md` (the *why*) with the *how*.

## Key elements

- **`npm run regenerate`** — umbrella command: runs every generator in dependency order, then syncs to the paired frontend. Writes.
- **`npm run complete`** — gate (build + test + lint + format). Verifies; a `STALE` failure means `regenerate` was not run.
- **`contracts:bundle`** — assembles authored fragments (`src/modules/*/openapi/*.yaml`, `shared/contracts/*.yaml`) into `openapi.yaml`, `asyncapi.yaml`, `asyncapi.public.yaml`. Also accepts a single bundle name (`openapi`, `asyncapi`, `bruno`, `insomnia`, `mockoon`, `postman`) for narrowed runs.
- **`gen:api`** — generates `api/models/` and `api/schemas.zod.ts` from `openapi.yaml`.
- **`gen:asyncapi`** — generates `src/types/asyncapi.generated.ts` from `asyncapi.yaml` / `asyncapi.public.yaml`.
- **`seed:export`** — runs the application to produce `db/demo/demo-data.json` (committed; the client collections embed its example bodies).
- **`sync:frontend`** — copies generated bundles to the paired frontend.
- **`check:contracts-bundle`** — asserts every bundle matches a fresh assembly from its fragments.
- **`lint:openapi` / `lint:asyncapi`** — spectral validation of the generated specs.
- **`check:spec-identity`** — verifies the paired frontend holds byte-identical copies.
- **`test:contract`** — runs real requests against the spec (`jest-openapi`).
- **"I changed X — run Y" table** — maps each file type (OpenAPI fragments, root contract, AsyncAPI fragments, `demo.ts`, `probes.ts`, module code) to the minimal commands needed.
- **Dependency chain** — `openapi.yaml → api/ → demo-data.json → client collections`; nothing generates a collection unless explicitly asked.

## Relationships

- **`docs/api/contract-fragmentation.md`** — this file explicitly defers to it for the *reason* the pipeline is shaped as it is.
- **`docs/api/openapi-workflow.md` / `docs/api/asyncapi-workflow.md`** — cover the per-format generation steps in detail; this page is the cross-cutting "which order, when" layer.
- **`docs/api/index.md`** — parent index; lists this page as the operational quick-reference.
- **`docs/reference/contracts.md` / `docs/reference/root.md`** — structural reference for the fragment layout (`shared/contracts/openapi.root.yaml`, per-module fragments) that `contracts:bundle` reads.
- **`docs/reference/scripts.md`** — documents `scripts/build-contract-bundles.ts` and `scripts/contracts/client-collections-bundle.ts`, the scripts that implement the ordering described here.
- **`docs/tools/package-scripts.md`** — full listing of the npm scripts (`regenerate`, `complete`, `contracts:bundle`, etc.) referenced throughout.
- **`docs/tools/pairing-and-ports.md`** — context for the paired frontend that `sync:frontend` targets and that `check:spec-identity` compares against.

## Notes

- `openapi.yaml`, `api/models/`, `api/schemas.zod.ts`, and `src/types/asyncapi.generated.ts` are **gitignored** and rebuilt by `postinstall` on every `npm install`/`npm ci`. There is no committed copy to go stale.
- **Exception:** `db/demo/demo-data.json`, `asyncapi.yaml`, and `asyncapi.public.yaml` **are** committed.
- The four client collections (`contract.bruno.yml`, `contract.insomnia.json`, `contract.mockoon.json`, `contract.postman.json`) are produced **only** when explicitly named; a bare `contracts:bundle` will not emit them. `--check` also refuses them because uncommitted files cannot be "stale."
- A **named** bundle run (`contracts:bundle -- bruno`) regenerates from the contract **on disk**, not from a freshly bundled one in the same session. Finish with a full `contracts:bundle` before committing.
- The ordering lives in `scripts/build-contract-bundles.ts`, deliberately **not** as `&&`-chained commands in `package.json` — npm appends `--` flags to the last command in a chain only, which silently broke narrowed runs.
- Editing `openapi.yaml` or `asyncapi*.yaml` directly is a dead end: the next bundle overwrites it, and `--check` fails first. Edit the fragments.
- `postinstall` fires only at install time, not on every save — mid-session edits still require an explicit `regenerate`.
