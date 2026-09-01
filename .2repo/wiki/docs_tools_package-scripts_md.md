# docs/tools/package-scripts.md

## Purpose

A job-oriented reference for the `package.json` scripts. Instead of listing scripts alphabetically, it groups them by what you're doing (run the server, validate, test, benchmark) so a developer or AI assistant can find the right command without reading the raw `package.json`.

## Key elements

- **Three "daily" scripts** — `compose:restart` (bring stack up), `regenerate` (run generators), `complete` (pre-commit gate).
- **Prefix wrappers** — `npm run host -- <script>` (redirects datastores to `localhost`) and `npm run compose -- <cmd>` (expands to `${CONTAINER_ENGINE:-podman} compose`).
- **Runtime scripts** — `dev`, `demo`, `start`, `debug`, `dev:docker`, `dev:docker:cluster`.
- **Validation scripts** — `ts-check`, `lint`/`lint:fix`, `prettier:*`, `build`, `check:spec-identity`, `check:dependencies`, `complete`, `complete:fix`, `complete:manual`.
- **Bench scripts** — `bench`, `bench:search`, `bench:orders`, `bench:inventory`, `bench:k6`, `bench:k6:checkout`.
- **Test scripts** — `test`, `test:module`, `test:unit`, `test:cross-cutting`, `test:integration`, `test:contract`, `test:cluster`, `test:unit:report`, `test:report`, `test:unit:coverage`.

## Relationships

- **docs/getting-started.md** — `compose:restart` is the entry point for local setup.
- **docs/api/regenerating.md** — `regenerate` re-runs code/spec generators; `test:cross-cutting` includes bundle-freshness checks that catch stale output.
- **docs/tools/demo-profile.md** — `demo` boots the self-contained in-memory stack used by the paired frontend.
- **docs/tools/cluster-testing.md** — `test:cluster` boots forked workers and asserts shared rate-limit budget; listed under `complete:manual`.
- **docs/tools/contract-testing.md** — `test:contract` validates real HTTP responses against `openapi.yaml`.
- **docs/tools/dependency-graph.md** — `check:dependencies` enforces tier walls (transitive reachability) that ESLint cannot detect.
- **docs/api/openapi-workflow.md / docs/api/asyncapi-workflow.md / docs/api/contract-fragmentation.md** — `check:spec-identity` and the contract checks keep these spec artefacts in sync with the paired frontend.
- **docs/reference/scripts.md** — the canonical raw script list; this page is its narrative re-organisation.
- **README.md / docs/index.md** — top-level navigation that points here for "which command do I run?"

## Notes

- `regenerate` **writes** files; `complete` only **verifies**. A gate failure tagged **STALE** means `regenerate` was not run after a source change.
- The paired frontend has its own `npm run regenerate`; run it after every `git pull` or the shipped client targets the previous contract.
- `host` does not just change a flag — it blanks `NODE_DB_URI` and `NODE_REDIS_URL`, pointing both hostnames at `localhost`, then delegates to `npm run`.
- `bench:*` scripts (except `bench:k6`) have **no pass/fail**; they report latency only, which is why they are not prefixed `test:`.
- `bench:k6:checkout` **writes data** (login → cart → checkout). Use a throwaway database.
- `check:spec-identity` silently skips when the paired frontend is not on disk, but becomes fatal under CI.
- `test:module` runs serially (not in parallel) because contract and integration suites share the same test database.
