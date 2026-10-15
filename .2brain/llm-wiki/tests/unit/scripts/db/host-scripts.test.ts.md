---
source: tests/unit/scripts/db/host-scripts.test.ts
sha256: 35d58c4a27ee1270f9a775107957a91286ddd352f78e8e95f61a5ba13188c243
generated_at: 2026-10-15T13:27:01.279196+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/db/host-scripts.test.ts

## Purpose

Guards the `npm run host -- <script>` wrapper and the `getDatabaseUri()` resolver it depends on. The wrapper lets a developer run any DB script against a containerised database from the host by blanking the full URI and overriding only the hostname to `127.0.0.1`. This test file locks down the invariants that keep that mechanism correct: no hardcoded URI, no hardcoded database name, empty-string fallthrough to `.env` fragments, and a single point of hostname redirection.

## Key elements

- **`describe('the host script')`** — Asserts on the raw `package.json` script string (read at test time via `readFileSync`). Checks: no literal Mongo/Redis URI, no `NODE_MONGODB_NAME` or default DB name, blanks both `NODE_DB_URI` and `NODE_REDIS_URL`, sets `*_HOST=127.0.0.1`, never uses `localhost`, ends with `npm run`, and is the *only* script matching a hostname-redirect pattern.
- **`describe('database URI resolution')`** — Exercises `getDatabaseUri()` directly. Verifies: explicit `NODE_DB_URI` wins; **empty-string** `NODE_DB_URI` falls through to host/port/name fragments; a renamed database propagates; all-unset defaults to `mongodb://127.0.0.1:27017/boilerplate-node-backend`.
- **`MONGO_VARS`** — Constant array of the four Mongo env vars, unset via `setEnvironment` in `beforeEach` to prevent ambient values from leaking into tests.
- **`packageScripts` / `hostScript`** — Parsed from `package.json` at module load time relative to `__dirname`.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Imports `getDatabaseUri`, the resolver under test. The "empty URI falls through" and "renamed database" tests directly exercise its branching logic.
- **`tests/support/environment.ts`** — Imports `setEnvironment` to set and clear process env vars per test case, isolating each resolution scenario.

## Notes

- The empty-string (`''`) fallthrough is the load-bearing invariant. A `!== undefined` truthiness check would treat `''` as "set" and skip the fragment path, silently using whatever default the resolver hardcodes. The test is deliberately written as its own `it` so a "tidy-up" PR that changes the check produces an obvious, named failure.
- `127.0.0.1` is asserted against `localhost` separately from the mechanism test so the failure message identifies *which* rule broke. The distinction matters because `localhost` is resolver-ordered on dual-stack hosts, while Docker/Podman publish to `0.0.0.0` (IPv4 only).
- The script-string assertions are regex/substring checks on the `package.json` value, not a functional invocation. They cannot catch a runtime change to `getDatabaseUri`—that is covered by the second `describe` block.
- `ROOT` is derived from `__dirname`, so the test must be run with the repo layout intact (four levels up from `tests/unit/scripts/db/`).
