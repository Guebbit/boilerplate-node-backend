# docs/tools/package-scripts.md

## Purpose

Groups the project's `package.json` scripts by job (runtime, validation, testing, benchmarking) instead of raw list order, so a developer or AI assistant can find the right command by intent rather than scrolling an alphabetized dump. It also documents two prefix wrappers (`host`, `compose`) that eliminate repeated script twins.

## Key elements

- **Three daily scripts** — `compose:restart` (bring the stack up), `regenerate` (re-run generators after source changes), `complete` (pre-commit gate: build + lint + spec checks + tests).
- **Prefix wrappers** — `npm run host -- <script>` blanks `NODE_DB_URI`/`NODE_REDIS_URL` to `localhost` and delegates; `npm run compose -- <cmd>` expands to `${CONTAINER_ENGINE:-podman} compose`.
- **Runtime scripts** — `dev` (watch mode from `src/cluster.ts`), `demo` (self-contained in-memory API), `start`, `debug`, `dev:docker`, `dev:docker:cluster`.
- **Validation scripts** — `ts-check`, `lint`/`lint:fix`, `prettier:check`/`prettier:fix`, `build`, `check:asyncapi-types`, `check:spec-identity`, `check:dependencies`, `complete`/`complete:fix`, `complete:manual`.
- **Test scripts** — `test` (full suite in order: unit → cross-cutting → integration → contract), `test:module`, `test:unit`, `test:cross-cutting`, `test:unit:coverage`, `test:integration`, `test:contract`, `test:cluster`.
- **Benchmark scripts** — `bench`, `bench:search`, `bench:orders`, `bench:inventory` (autocannon, report-only), `bench:k6`, `bench:k6:checkout` (ramping load with pass/fail thresholds; the checkout variant **writes**).

## Relationships

- **`docs/tools/pairing-and-ports.md`** — this page references the paired frontend's mirror `regenerate` command and notes that contract/spec checks (`check:spec-identity`, `test:contract`) compare shared contract files against that frontend. Port binding constraints for `test:cluster` and `test:prism` (which must run manually via `complete:manual`) are documented on the pairing-and-ports page.

## Notes

- `regenerate` **writes** files; `complete` only **verifies**. A gate failure reading **STALE** means `regenerate` was not run first.
- `bench:*` scripts are deliberately not prefixed `test:` because they have no pass/fail (except `bench:k6` and `bench:k6:checkout`, which do).
- `bench:k6:checkout` performs writes — it must run against a throwaway database only.
- `test:cluster` and `test:prism` bind real ports and are excluded from the automated `complete` gate; use `complete:manual` instead.
- `check:dependencies` catches transitive import-tier violations that ESLint cannot see; `check:spec-identity` skips silently when the paired frontend is not on disk but is fatal under CI.
