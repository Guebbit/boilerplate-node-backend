---
source: tests/support/routes.ts
sha256: 31ee10d908d9642f689669061537af6bcda1428fe0b4ebb9453c81fb3da65469
generated_at: 2026-11-08T09:59:06.303858+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routes.ts

## Purpose

Test-support utility that reads an Express router's mounted route table (method, path, middleware chain, permissions) back out as plain data for assertions. It also exports `jest.mock` factory replacements for middleware modules whose real exports are anonymous closures (cache, rate-limit, route-flag, step-up), so that factory *arguments*—cache tags, TTLs, namespaces—become visible strings on the middleware instead of being captured invisibly inside a closure. The goal: a test states the **entire** route table, and any edit that changes a mounted path, permission, or cache tag forces a deliberate test change in the same commit.

## Key elements

- **`PermissionAsk`** (exported interface) — `{ action, subject }` pair captured from a `requirePermission` guard.
- **`ROUTE_LABEL`** — module-private `Symbol.for('tests.routeLabel')`; the slot where labelled middleware stores their rendered factory call.
- **`RouteRow`** (internal) — one endpoint: `method`, `path`, `chain: string[]`, `permissions: PermissionAsk[]`.
- **`routeTable`** (exported, in truncated region) — walks a `Router` and returns `RouteRow[]`.
- **`optionsOf(chain, factory)`** (exported) — parses a rendered label like `setCache(3600, tags=[a|b], …)` back into a `Record<string, unknown>`. Stopgap: only reliable for `key=value` pairs; positional args are skipped.
- **`cacheMock()`** (exported) — `jest.mock` factory for `@infrastructure/http/middlewares/cache`. Spreads the real module (keeping `noStore` intact), then overrides `setCache`, `searchCache`, `invalidateCache` with labelled pass-throughs that record TTL, tags, keyParameters, keyAs, browserRevalidate.
- **`securityMock()`** (exported) — `jest.mock` factory for `@infrastructure/http/middlewares/rate-limit`. Relabels `buildRateLimiter` by `budget.namespace`; gives fixed labels to the module's own `rateLimiter`, `apiKeyLimiter`, `uploadLimiter`.
- **`routeFlagMock()`** (exported) — `jest.mock` factory for `@infrastructure/http/middlewares/route-flag`. Records the flag string.
- **Authorizations mock** (exported, in truncated region) — replacement for `@kernel/middlewares/authorizations` step-up factories (`isAuth`, `requirePermission`, `getAuth` pass through; step-up factories are labelled).
- **`text` / `list` / `parseValue`** (internal) — rendering and inverse-parsing helpers that avoid `[object Object]` ambiguity.
- **`labelled(label)`** (internal) — returns a `passThrough`-based middleware with `[ROUTE_LABEL]` set to the given string.

## Relationships

- **`@domain-primitives/time`** — imports `HOUR_SECONDS` as the default TTL in `mockSearchCache`.
- **`@infrastructure/http/middlewares/cache`** — `cacheMock` spreads the real module via `jest.requireActual` (preserving `noStore`) then overrides the factory exports.
- **`@infrastructure/http/middlewares/rate-limit`** — `securityMock` similarly spreads the real module and overrides `buildRateLimiter` plus the three named limiters.
- **`@infrastructure/http/middlewares/upload`** — the (truncated) storage mock calls through to the real `upload.image()` so downstream named handlers (`validateUploadedImages`, `quarantineUploadedImages`) remain visible in the chain.
- **`@kernel/middlewares/authorizations`** — the (truncated) authorizations mock replaces step-up factories; `isAuth` / `requirePermission` / `getAuth` are kept as-is because they are declared functions with intact names.
- **`@kernel/permissions`** — imports `PermissionAction`, `PermissionSubject`, `StepUpTier` types used in `PermissionAsk` and the authorizations mock.
- **`@tests/stub`** — imports `asStub` (used in the truncated region, likely for step-up mocks).
- **All `src/modules/*/tests/unit/routes.test.ts`** — primary consumers; each declares `jest.mock` calls pointing at this file's `cacheMock`, `securityMock`, `routeFlagMock`, etc., then asserts on `routeTable` output.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** — exercises a subset of routes end-to-end; this file's table assertion complements it by covering the "nothing else is mounted" guarantee.

## Notes

- `jest.mock` is hoisted per module registry and **cannot** be applied from a helper file. Each consuming test must declare its own `jest.mock('…', () => require('@tests/routes').cacheMock())`. Use `require` inside the factory—`jest.mock` factories may not close over imported bindings.
- `optionsOf` is explicitly a stopgap: it parses the string format this same file built. The coupling to the rendered format is confined to `optionsOf` and `parseValue`; module tests should prefer `toContain` on the chain string where possible.
- `mockSearchCache` accepts and drops `scopeKey`: it is a function that `text`/`list` cannot render, and its behavior is already covered by dedicated unit tests. The route table only needs to know one was passed, which the real signature enforces at compile time.
- The mocks are **labelling wrappers**, not stubs, wherever the real middleware chain contains named handlers worth preserving (e.g., `storageMock` → real `upload.image()` → `validateUploadedImages`). A test that asserts on the chain string still sees those names.
- `RouteRow` and `LabelledMiddleware` are deliberately not exported; only `PermissionAsk`, `routeTable`, `optionsOf`, and the `*Mock` factories are part of the public surface.
