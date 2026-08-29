# docs/api/regenerating.md

## Purpose

A quick-reference cheat sheet that maps "what I just edited" → "what command to run next" for the contract-generation pipeline. It exists because the pipeline has a non-obvious multi-step ordering (bundle → generate → seed → collections → sync) and the correct sequence depends on *which* file changed. Developers keep this page open mid-session rather than re-deriving the dependency chain.

## Key elements

- **`npm run regenerate`** — umbrella command that runs every generator in dependency order, then syncs to the frontend. The single recommended action after any fragment edit.
- **`npm run complete`** — verification gate (build + test + lint + format). Does not write files; a `STALE` failure means `regenerate` was skipped.
- **`contracts:bundle`** — assembles module fragments + shared contracts into root documents (`openapi.yaml`, `asyncapi.yaml`, client collections, analytics catalogue). Supports named-bundle mode (`-- openapi`, `-- bruno`, etc.).
- **`gen:api`** — generates `api/models` and `api/schemas.zod.ts` from `openapi.yaml`.
- **`gen:asyncapi`** — generates `src/types/asyncapi.generated.ts` from the AsyncAPI documents.
- **`seed:export`** — runs the real application to produce `db/demo/demo-data.json`, which feeds the client collections.
- **"I changed X — run Y" table** — maps specific file paths to the minimal command chain required.
- **Failure diagnosis table** — decodes each verification failure (`STALE`, `check:spec-identity`, spectral `$ref`, prettier trailing-comma, etc.) into a concrete fix.
- **Committed-vs-generated matrix** — clarifies which outputs are gitignored (regenerated on `postinstall`) and which stay in the repo (`db/demo/demo-data.json`, AsyncAPI bundles).

## Relationships

- **`docs/api/index.md`** — parent navigation page; this file is listed as the operational "what to run" companion within the API docs section.
- **`docs/api/openapi-workflow.md`** — covers the *why* and the full lifecycle of the OpenAPI contract; this page is the short "do this now" counterpart. The content cross-links to `./contract-fragmentation.md` for the rationale behind the bundle/generate split, placing this page in the same explanatory cluster.

## Notes

- **Ordering lives in a script, not `package.json`.** npm appends `--` flags to the *last* command in a `&&` chain only, so the dependency sequence was moved into `scripts/build-contract-bundles.ts` to keep named-bundle narrowing correct.
- **Named-bundle regeneration reads committed state.** `contracts:bundle -- bruno` regenerates from the contract on disk, not from an in-memory build. Finish with a full `contracts:bundle` before committing.
- **The four client collections are opt-in.** A bare `contracts:bundle` does *not* produce them; they are only built when explicitly named. `--check` refuses them outright because they are gitignored.
- **`postinstall` covers fresh clones.** `openapi.yaml`, `api/`, and AsyncAPI types are not committed; they are regenerated automatically on `npm install`/`npm ci`. The "stale committed copy" failure mode no longer applies to those three.
- **Direct edits to generated files are overwritten.** `openapi.yaml`, `asyncapi*.yaml` (root), and all `contract.{bruno,insomnia,mockoon,postman}.*` files are outputs. Editing them is a dead end — the next bundle or generation run reverts the change.
- **Frontend mirror.** The paired frontend has its own `npm run regenerate`; it must be run after every pull or the app ships a client for the previous contract.
- **Prettier gotcha.** `analytics-events.frontend.ts` fails `prettier:check` if a source section's `as const` array ends with a trailing comma — the join step adds the separator, not the source.
