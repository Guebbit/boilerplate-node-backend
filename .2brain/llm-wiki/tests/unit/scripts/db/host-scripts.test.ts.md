---
source: tests/unit/scripts/db/host-scripts.test.ts
sha256: 89317b51b2cb18bfc18e4b552fcdb22491280f00ea6ba3c86376ceda835ebd6b
generated_at: 2026-11-08T10:35:39.727740+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/db/host-scripts.test.ts

## Purpose

Unit tests for `getDatabaseUri`, the resolver that powers `npm run host -- <script>`. The suite pins the fall-through contract: an **empty-string** `NODE_DB_URI` must be treated as unset (not merely `undefined`), so the resolver composes a URI from the `NODE_MONGODB_HOST`/`PORT`/`NAME` fragments. This is the behavior most likely to regress silently if someone "simplifies" the check to `!== undefined`.

## Key elements

- **`MONGO_VARS`** – `as const` tuple of the four relevant env keys (`NODE_DB_URI`, `NODE_MONGODB_HOST`, `NODE_MONGODB_PORT`, `NODE_MONGODB_NAME`); used to reset state in `beforeEach`.
- **`beforeEach`** – blanks all four variables via `setEnvironment(…)` so no ambient value leaks between cases.
- **`prefers an explicit NODE_DB_URI`** – a full `mongodb+srv://…` URI wins outright; `NODE_MONGODB_NAME` is ignored.
- **`falls through to the fragments when NODE_DB_URI is EMPTY`** – the guard-rail test: `NODE_DB_URI: ''` triggers fragment assembly (`mongodb://localhost:27017/renamed-db`).
- **`honours a renamed database`** – asserts the composed URI contains the developer's name and does **not** contain the boilerplate default `boilerplate-node-backend`.
- **`defaults host, port and name when nothing is configured`** – no vars set at all → `mongodb://127.0.0.1:27017/boilerplate-node-backend`.

## Relationships

- **`src/infrastructure/runtime/database.ts`** – source under test; the suite imports and exercises `getDatabaseUri`.
- **`tests/support/environment.ts`** – test helper; provides `setEnvironment` to inject/clear process-environment values in isolation.

## Notes

- The empty-string case (`NODE_DB_URI: ''`) is deliberately isolated in its own `it` block with a doc-comment warning against "correcting" it to `!== undefined`. Treat that test as a behavioral contract, not a stylistic preference.
- The default database name `boilerplate-node-backend` appears in two assertions (the defaults test and the "renamed database" negative check). Changing the default in `database.ts` will break both.
- Tests rely on `setEnvironment` mutating (or clearing) the process environment; they do **not** snapshot/restore on their own—cleanup is assumed to come from the test runner's global teardown.
