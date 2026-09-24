---
source: tests/unit/scripts/db/host-scripts.test.ts
sha256: 5fcb6318a924d9a07ec6d63d87c7708c8b22e74b7341e521ca21a5972f0f7b74
generated_at: 2026-09-23T20:29:56.920114+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/db/host-scripts.test.ts

## Purpose

Guards two invariants that make `npm run host -- <script>` work correctly: the `host` wrapper in `package.json` must redirect only the hostname (never a full URI or database name), and `getDatabaseUri()` must fall through to fragment-level env vars when `NODE_DB_URI` is empty (not merely undefined). Without these, renaming the database in `.env` silently seeds the wrong database, and on dual-stack machines the `localhost` name can resolve to IPv6 while the container only listens on IPv4.

## Key elements

- **`hostScript`** — reads the `host` entry from `package.json` scripts; the primary SUT for the first `describe` block.
- **`MONGO_VARS`** — tuple of `NODE_DB_URI`, `NODE_MONGODB_HOST`, `NODE_MONGODB_PORT`, `NODE_MONGODB_NAME`; used to snapshot/restore env in the URI-resolution tests.
- **`describe('the host script')`** — six assertions on the raw script string: no literal URI, no DB name, blanks both URIs + sets `*_HOST=127.0.0.1`, never contains `localhost`, ends with `npm run`, and is the *only* script that redirects a hostname.
- **`describe('database URI resolution')`** — four tests calling `getDatabaseUri()`: explicit URI wins, **empty** string falls through to fragments, a renamed DB is honoured, and defaults are `mongodb://127.0.0.1:27017/boilerplate-node-backend`.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — source of `getDatabaseUri()`, the function exercised by the second `describe` block. The tests assert its fallback semantics (empty-string vs. undefined, fragment reassembly) directly.
- **`package.json`** (project root) — read at module-load time to extract the `host` script and all sibling scripts; the test validates the wrapper string and scans every other script for hostname-redirect patterns.

## Notes

- The "empty URI falls through" test is explicitly called out as the most fragile line: a well-meaning refactor to `!== undefined` would pass type-checking but break the host-script contract. The test pins the *falsy* path.
- The `localhost` ban is not stylistic: on dual-stack hosts the resolver may return `::1` first, while Docker/Podman publish to `0.0.0.0` (IPv4 only), producing opaque `ECONNRESET` or hangs. `127.0.0.1` is order-independent.
- The "only redirector" test scans *all* scripts in `package.json`; adding any new `*_HOST=127.0.0.1` or `*_HOST=localhost` assignment to another script will fail this assertion.
- `ROOT` is resolved four levels up from the test file (`tests/unit/scripts/db/` → repo root). If the test is moved, the `package.json` path must move with it.
