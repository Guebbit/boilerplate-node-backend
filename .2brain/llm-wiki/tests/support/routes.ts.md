---
source: tests/support/routes.ts
sha256: 39f79163e405f8efc6045b203f3cfa93920a527d65ba3aa86f28ac438a29e1ea
generated_at: 2026-10-15T13:01:00.725459+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routes.ts

## Purpose

Provides the test-side machinery for asserting a module's complete Express route table (every method, path, and middleware chain) rather than spot-checking a few routes. It exports `jest.mock` factories that replace middleware *factories* (cache, rate-limit, route-flag, authorizations) with labelled pass-throughs, so arguments captured in anonymous closures—TTLs, cache tags, permission tiers, budget namespaces—become readable strings on the mounted handler. A test then states the full table and any accidental route change forces a visible, reviewable test edit.

## Key elements

- **`ROUTE_LABEL`** – `Symbol.for('tests.routeLabel')`; the property on which each labelled middleware stores its factory-call string.
- **`labelled(label)`** – Wraps `passThrough` in a fresh function (via `bind`) and writes `label` onto it; the building block every mock factory returns.
- **`text()` / `list()`** – Render values into assertion strings; avoid `String()` on objects to prevent `[object Object]` collisions.
- **`parseValue()` / `optionsOf(chain, factory)`** – Parse a rendered label back into a `key=value` record. Documented as a stopgap so the string-format coupling lives here, not in every test's `toContain`.
- **`cacheMock()`** – Exported factory for `jest.mock` of `@infrastructure/http/middlewares/cache`. Spreads the real module first (so `noStore` etc. survive), then replaces `setCache`, `searchCache`, `invalidateCache` with labelled versions.
- **`securityMock()`** – Exported factory for `jest.mock` of `@infrastructure/http/middlewares/rate-limit`. Replaces `buildRateLimiter` (labels by `budget.namespace`) and the three pre-built limiters (`global`, `api-key`, `uploads`).
- **`routeFlagMock()`** – Labels `routeFlag('…')` calls.
- **`authMock()`** (truncated) – Replaces `requireFreshAuth` / `requireFreshAuthWhen` with labelled versions; `isAuth` / `requirePermission` pass through unchanged since they are named functions.
- **`routeTable(router)`** (referenced, truncated) – Walks an Express `Router` and returns `RouteRow[]` (method, path, `chain: string[]`, `permissionKey?`, `exactPermission?`).
- **`RouteRow` / `LabelledMiddleware`** – Internal interfaces for the walker's output.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** – Mocked by `cacheMock()`; the real module is loaded via `jest.requireActual` and spread, then individual factories are overwritten.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Mocked by `securityMock()`; same spread-then-override pattern.
- **`src/infrastructure/http/middlewares/upload.ts`** – The (truncated) `storageMock` calls through to the real `upload.image()` so that `validateUploadedImages` / `quarantineUploadedImages` retain their names behind the label.
- **`src/kernel/middlewares/authorizations.ts`** – Mocked by `authMock()` for the step-up factories; `isAuth` / `requirePermission` pass through as named functions.
- **`src/kernel/permissions.ts`** – Source of the `StepUpTier` type imported at the top; the `permissionKey` / `exactPermission` fields on `RouteRow` reflect the key each `requirePermission` guard closed over.
- **Every `src/modules/*/tests/unit/routes.test.ts`** – Consumer side: each file declares its own `jest.mock` one-liner pointing at the exports here, then calls `routeTable` and asserts the full table.

## Notes

- `jest.mock` is hoisted per module registry and **cannot** be applied from this helper; every consuming test file must declare its own `jest.mock('@…', () => require('@tests/routes').cacheMock())` (note `require`, not the imported binding, because `jest.mock` factories may not close over module scope).
- `passThrough` is declared once and `bind`-ed per call rather than closed over, so each labelled middleware gets a unique function identity (required for `Object.assign` to write the label onto the right object).
- `optionsOf` only reliably extracts `key=value` pairs; a factory's leading positional argument (e.g. `setCache`'s TTL) has no key and is skipped.
- The mocks intentionally spread the real module first so non-factory exports (`noStore`, named limiters) remain available; replacing the whole module with a handful of keys would break `router.use(noStore)` in modules like `account`.
- `searchCache` is built on top of `mockSetCache` rather than calling the real one, because the real `searchCache` closes over the real `setCache`, which would produce an unlabelled middleware invisible to `routeTable`.
