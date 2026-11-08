---
source: tests/unit/infrastructure/http/middlewares/method-not-allowed.test.ts
sha256: acaee6aebc0d33d53d39a3ad9d63439cf99840351bda779900a75a948f0c54b1
generated_at: 2026-11-08T10:14:39.390129+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/method-not-allowed.test.ts

## Purpose

Unit-tests the `methodNotAllowed` HTTP middleware guard. It drives the guard with hand-crafted Express `Request`/`Response` objects against a small, in-file route table to verify 405 responses, `Allow` header construction, pass-through behaviour, and the separate "literal-paths-only" phase that runs before the routers.

## Key elements

- **`TABLE`** — `readonly OperationRoute[]` with five entries: a static path (`/things`), a nested literal (`/things/search`), a parameterized path (`/things/{id}`), a module excluded from this build (`/ghosts`), and a system route with `module: null` (`/ping`).
- **`Outcome`** — interface capturing what the guard did: optional `status`, optional `allow` header value, and a `passed` boolean.
- **`run(method, path, literalOnly?)`** — builds a fake `Request` via `Object.create(express.request)` + `Object.defineProperties`, a stub `Response` (via `asStub`) that records `status`, `Allow` header, and `next()` call, then invokes `methodNotAllowed(TABLE, new Set(['things']), literalOnly)`. Returns the captured `Outcome`.
- **`describe('methodNotAllowed')`** — 10 `it` blocks covering: correct 405 + sorted `Allow` list, HEAD implied by GET, OPTIONS pass-through, unknown-path pass-through, excluded-module pass-through, system-route 405, trailing-slash normalization, union-of-matching-templates `Allow`, and the `literalOnly` phase (literal paths judged alone; templated paths deferred to routers).

## Relationships

- **`src/infrastructure/http/middlewares/method-not-allowed.ts`** — the system under test. The test imports `methodNotAllowed` and calls it directly with the route table, a served-modules `Set`, the `literalOnly` flag, and a synthetic `(request, response, next)` triple.
- **`tests/support/stub.ts`** — provides `asStub<T>`, used to create the fake `Response` object whose `status`, `setHeader`, and `json` methods are spied to record the guard's actions.

## Notes

- `path` is a getter on Express's request prototype, so the test redefines it via `Object.defineProperties` on a fresh instance rather than plain assignment.
- The `literalOnly` flag exercises the pre-router mount: only paths whose pattern has `parameterCount === 0` are judged; parameterized paths are left to the downstream routers.
- `Allow` lists are always alphabetically sorted and always include `HEAD` whenever `GET` is present.
- A path that matches multiple templates (e.g. `/things/search` matches both the literal and the `{id}` pattern) yields the **union** of all declared methods in the `Allow` header.
