---
source: tests/cross-cutting/contract-error-declarations.test.ts
sha256: e39056171268147f31bcaf9cf979e254debbc03e1c2d6d63f39d58b6752aeff0
generated_at: 2026-09-27T15:49:54.411004+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-error-declarations.test.ts

## Purpose

Contract-level guard that every OpenAPI operation accepting an id parameter declares a `422` response. It exists because `databaseErrorInterpreter` answers 422 for malformed ids on *any* such route, so an omission in one fragment makes the shared contract inconsistent and breaks the generated client and the PHP twin. The test reads the per-module fragments (the editable source of truth) rather than the generated bundle.

## Key elements

- **`operations()`** — Walks every module directory under `MODULES_ROOT`, parses its `openapi.yaml` fragment, and returns a flat array of `{ module, route, method, codes }` for every HTTP method entry found.
- **`TAKES_AN_ID`** (regex) — Matches route paths containing an id-like template parameter (`{id}`, `{orderId}`, `{userId}`, …). Used instead of a hardcoded route list so new id-bearing endpoints are covered automatically.
- **`takingAnId()`** — Filters `operations()` to id-taking routes.
- **Canary assertion** (`expect(operations().length).toBeGreaterThan(40)`) — Fails loudly if a fragment is renamed or the path shape changes, preventing a silently empty sweep from passing.
- **422 assertion** — Fails with a per-operation message listing every id-taking route that omits `422` from its declared response codes.

## Relationships

- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the filesystem root under which each module's `openapi.yaml` fragment is expected. The test is entirely dependent on this path being correct; if it points to the generated bundle or a stale directory, every assertion sweeps the wrong files.
- **`package.json`** — Supplies the `yaml` dependency used to parse the fragments and the `@tests` path alias that resolves `@tests/paths`.

## Notes

- **Reads fragments, not the bundle.** The generated `openapi.yaml` at the repo root is a build artifact; this test deliberately parses the per-module sources so a failure names a file a developer actually edits.
- **Scope is intentionally 422 only.** A 500 sweep finds three gaps (`GET /account`, `GET /observability/events`, `GET /observability/metrics`) that are left unasserted here because resolving them requires coordinated edits across three repositories. The test states one rule it can defend rather than two it cannot.
- **Method filtering uses a fixed `Set`.** Only `get`, `post`, `put`, `patch`, `delete` are treated as operations; any non-standard key in a path object is silently ignored.
- **The canary is load-bearing.** Both assertions depend on `operations()` returning a non-trivial list; without the canary, a broken `MODULES_ROOT` would produce an empty array and the 422 check would pass vacuously.
