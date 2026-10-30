---
source: tests/support/routes.ts
sha256: 2167bbdba18dd3476d02c687e2a2a45044e6d037c5423f8ba6e138b56c25a23b
generated_at: 2026-10-29T07:10:56.141633+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routes.ts

## Purpose

Reads an Express router's full route table back out — every mounted method/path, in order, with the middleware chain and permission guards each carries — so module tests can assert the *entire* configuration as a snapshot. It exists because route files are "configuration written as code" that fail silently (a dropped `requirePermission`, a typo'd path, a wrong cache tag), and a contract suite alone cannot prove "nothing else is mounted."

## Key elements

- **`routeTable`** (implied by doc; the main export tests call) — walks a `Router` and returns an array of `RouteRow` objects.
- **`RouteRow`** — one endpoint: `method`, `path`, `chain` (named/labelled middleware in order), `permissions` (every `PermissionAsk` on the route).
- **`PermissionAsk`** — `{ action, subject }` pair extracted from `requirePermission` guards.
- **`ROUTE_LABEL`** (`Symbol.for('tests.routeLabel')`) — the symbol under which mocked factories stamp their rendered call onto the middleware they return.
- **`labelled(label)`** — builds a pass-through middleware that carries the label; used by all mock factories.
- **`cacheMock()`** — replacement module for `@infrastructure/http/middlewares/cache`; relabels `setCache`, `searchCache`, `invalidateCache` while preserving real exports like `noStore`.
- **`securityMock()`** — replacement for `@infrastructure/http/middlewares/rate-limit`; relabels `buildRateLimiter` by `budget.namespace` and pins the three module-level limiters.
- **`routeFlagMock()`** — replacement for the route-flag middleware; relabels `routeFlag(flag)`.
- **`optionsOf(chain, factory)`** — parses a rendered label back into a `Record<string, unknown>` of `key=value` pairs; a stopgap so module tests can `toContain`-assert individual options without coupling to the full string.
- **`text` / `list` / `parseValue`** — internal render/parse helpers that avoid `[object Object]` ambiguity and preserve empty-vs-renamed array distinctions.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — every mock test file replaces this module with `cacheMock()`; this file spreads the real module via `jest.requireActual` so non-factory exports (e.g. `noStore`) remain available.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — replaced by `securityMock()`; the real `buildRateLimiter` is called only during `jest.requireActual`, so module-owned budgets built *after* the mock are relabelled.
- **`src/infrastructure/http/middlewares/upload.ts`** — a `storageMock` (referenced in the header comment) calls through to the real `upload.image()` so downstream named handlers (`validateUploadedImages`, `quarantineUploadedImages`) remain visible behind the label.
- **`src/kernel/middlewares/authorizations.ts`** — `isAuth`, `requirePermission`, `getAuth` pass through unchanged (they are named functions); step-up factories like `requireFreshAuth` are replaced with labelled versions.
- **`src/kernel/permissions.ts`** — supplies the `StepUpTier` type and the `PermissionAsk` shape that `routeTable` extracts from guards.
- **`src/modules/*/tests/unit/routes.test.ts`** (account, addresses, cart, delivery, example, inventory, invoicing, locales, notifications) — each declares its own `jest.mock` lines pointing at this file's mock factories, then calls `routeTable` and asserts the full expected array.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** — exercises a subset of routes end-to-end; this file covers the "and NOTHING else" half.

## Notes

- **`jest.mock` is per-module-registry and hoisted** — a helper cannot apply it on a test file's behalf. Every consuming test must write its own `jest.mock(...)` lines (the one-liner pattern is shown in the header doc).
- **Use `require` inside the `jest.mock` factory**, not the top-level import binding — Jest forbids closing over module scope in mock factories.
- **`optionsOf` is a deliberate stopgap**: it round-trips through the rendered string this same file built. If the render format changes, only this file breaks, not every module test.
- **`scopeKey` in `searchCache` is accepted and dropped** — it is a function that cannot be meaningfully rendered; its correctness is covered by dedicated unit tests, and the route table only needs to confirm one was passed (enforced at compile time by the `CacheOptions` type).
- **Mock factories spread the real module first** (`...jest.requireActual(...)`). Replacing the whole module object would silently break direct exports like `noStore` that are mounted without a factory call.
- **`text` uses `JSON.stringify` for objects** rather than `String()` to avoid `[object Object]` collisions between distinct configurations.
