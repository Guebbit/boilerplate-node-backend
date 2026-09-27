---
source: tests/unit/scripts/db/host-scripts.test.ts
sha256: 8aa2e3a83b4c9f80a863077792ab108b2a6dfe9af75a332971559ae9525db656
generated_at: 2026-09-27T16:13:03.512264+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/db/host-scripts.test.ts

## Purpose

Guards the `npm run host -- <script>` wrapper (a thin script in `package.json`) and the `getDatabaseUri()` resolver it depends on. The wrapper lets a developer run DB/Redis scripts from the host machine against a containerised database by blanking the full-URI env vars and overriding only the hostname to `127.0.0.1`, so all other fragments (port, database name) still come from `.env`. This test file pins down the invariants that must hold for that mechanism to keep working, and prevents regressions that would silently seed the wrong database or fail to connect.

## Key elements

- **`describe('the host script')`** — seven assertions against the raw `host` script string read from `package.json` at test time:
  - No literal MongoDB/Redis URI or hardcoded database name.
  - Blanks `NODE_DB_URI` / `NODE_REDIS_URL` and sets `*_HOST=127.0.0.1`.
  - Never uses the name `localhost` (must be the literal `127.0.0.1`).
  - Ends in `npm run` so `--` arguments pass through to the delegated script.
  - Is the **only** script in `package.json` that redirects a hostname.
- **`describe('database URI resolution')`** — four tests for `getDatabaseUri()`:
  - Explicit `NODE_DB_URI` wins.
  - **Empty** `NODE_DB_URI` (the load-bearing case) falls through to `NODE_MONGODB_HOST`/`PORT`/`NAME` fragments.
  - A renamed database name is honoured (the original bug this wrapper fixes).
  - All-vars-unset defaults to `mongodb://127.0.0.1:27017/boilerplate-node-backend`.
- **`MONGO_VARS`** — the four env keys saved in `beforeEach` and restored in `afterEach` so tests don't leak state.
- **`ROOT` / `packageScripts` / `hostScript`** — resolved from `__dirname/../../../..` and read via `readFileSync` at module-load time.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — exports `getDatabaseUri`, which the second `describe` block calls directly under controlled `process.env` states. The test asserts the resolver's fall-through contract (empty URI → fragments) that the `host` script relies on.

## Notes

- The test reads `package.json` from the filesystem (not via a module import), so it will fail if the project root layout changes.
- The "falls through when `NODE_DB_URI` is EMPTY" test is explicitly documented as the easiest assertion to break by "tidying" a falsy check to `!== undefined`. An empty string is a deliberate signal, not an absence.
- The `127.0.0.1` vs `localhost` assertion is not a style preference: on dual-stack machines `localhost` can resolve to `::1` first, while Docker/Podman publish to `0.0.0.0` (IPv4 only), causing silent `ECONNRESET` or hangs.
- The "only one redirector" test scans **all** scripts in `package.json`, so adding a new `:host` twin anywhere will fail the suite.
