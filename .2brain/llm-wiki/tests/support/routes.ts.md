---
source: tests/support/routes.ts
sha256: 3e8a5dd58b4537580fdd5c15473bcf23b599d1f3e3e1ebe7502e023d4118082f
generated_at: 2026-09-27T16:00:51.393684+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routes.ts

## Purpose

A test-support module that turns an Express `Router` into a serialisable route table (method, path, middleware chain) and provides `jest.mock` factory replacements for middleware that are created via closures. The goal: a test can assert the **entire** mounted route table so that silent omissions (a dropped `requirePermission`, a renamed cache tag, a wrong TTL) force a visible diff in the same commit.

## Key elements

- **`ROUTE_LABEL`** (`Symbol.for('tests.routeLabel')`) — internal symbol used to attach a rendered factory-call string onto the middleware function it returns.
- **`labelled(label)`** — returns a pass-through middleware (`passThrough.bind(undefined)`) with `[ROUTE_LABEL]` set; used by every mock factory.
- **`optionsOf(chain, factory)`** *(exported)* — finds a `factory(...)` entry in a rendered chain and parses its `key=value` pairs back into a plain object. Throws if no such entry exists. Stopgap over structured labels; only `key=value` pairs are recovered (positional args like `setCache`'s TTL are skipped).
- **`cacheMock()`** *(exported)* — replacement for `@infrastructure/http/middlewares/cache`. Spreads the real module (preserving `noStore`), then overrides `setCache`, `searchCache`, and `invalidateCache` with labelled versions that record TTL, tags, keyParameters, keyAs, and browserRevalidate.
- **`securityMock()`** *(exported)* — replacement for `@infrastructure/http/middlewares/rate-limit`. Spreads the real module, then replaces `buildRateLimiter` (labels by `budget.namespace`) and the three module-level limiters (`global`, `api-key`, `uploads`).
- **`routeFlagMock()`** *(exported)* — replacement for `@infrastructure/http/middlewares/route-flag`; records the flag name.
- **`authGuardsMock()`** *(exported)* — replacement for `@kernel/middlewares/authorizations`; passes through `isAuth`/`requirePermission`/`getAuth` (already named) and labels `requireFreshAuth`/`requireFreshAuthWhen` with their `maxAgeSeconds` argument.
- **`storageMock()`** *(exported, truncated in source)* — replacement for `@infrastructure/http/middlewares/upload`; calls through to the real `upload.image()` so sub-handlers (`validateUploadedImages`, `quarantineUploadedImages`) remain visible behind the label.
- **`routeTable(router)`** *(exported, truncated in source)* — walks an Express Router and returns `RouteRow[]` (method, path, chain of names/labels, optional `permissionKey`).
- **`text()` / `list()` / `parseValue()`** — internal rendering/parse helpers; `text` narrows by type to avoid `[object Object]`; `list` joins with `|` so an empty array is distinguishable from a renamed one.

## Relationships

| Neighbour | Interaction |
|---|---|
| `src/infrastructure/http/middlewares/cache.ts` | `cacheMock()` spreads the real module via `jest.requireActual` and overrides `setCache`/`searchCache`/`invalidateCache`. |
| `src/infrastructure/http/middlewares/rate-limit.ts` | `securityMock()` spreads the real module and overrides `buildRateLimiter` + the three module-level limiters. |
| `src/infrastructure/http/middlewares/upload.ts` | `storageMock()` wraps the real `upload.image()` to preserve sub-handler names. |
| `src/kernel/middlewares/authorizations.ts` | `authGuardsMock()` spreads the real module and overrides the two `requireFreshAuth*` factories. |
| `src/modules/*/tests/unit/routes.test.ts` (all ten modules) | Each test file calls `jest.mock` with the corresponding mock factory exported here, then asserts the `routeTable` output. |
| `tests/support/stub.ts` | Imports `asStub` (visible in the import line). |

## Notes

- **`jest.mock` must be declared in each test file**, not in this helper — Jest hoists mocks per module registry and the factory cannot reference imported bindings. The canonical one-liner uses `require(...)` inside the factory, not the top-level import.
- **Mocks spread the real module first** (`...jest.requireActual(...)`) so named exports that are mounted directly (e.g. `noStore`, `isAuth`) still resolve. Omitting the spread would leave those as `undefined`.
- **`optionsOf` is a parse-back stopgap**: it splits the very string this file just rendered, so the coupling lives in one place. It is unreliable for positional args (no `key=`) and for nested structures.
- **`searchCache`'s `scopeKey` is accepted and dropped**: it is a function, `text`/`list` cannot render it, and its behaviour is covered by dedicated unit tests. The required parameter is enforced at compile time by the real `CacheOptions` type.
- **`bind(undefined)` over a fresh closure**: `passThrough.bind` produces a new function identity per call without a new closure, which is what lets `Object.assign` attach the label without a per-route allocation.
