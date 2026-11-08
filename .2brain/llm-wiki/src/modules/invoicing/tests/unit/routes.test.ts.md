---
source: src/modules/invoicing/tests/unit/routes.test.ts
sha256: f0c210a1f2d9b87ab8cd219a6f9ffd4e81821fa85eac70e9779b9bdd26a490db
generated_at: 2026-11-08T06:19:38.341888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/routes.test.ts

## Purpose

Unit test that asserts the static shape of the invoicing router: which routes are mounted, which auth guards protect them, and which rate-limit namespace budgets them. It exists to catch accidental route re-signatures, guard regressions, or rate-limit misconfigurations before they reach integration or production.

## Key elements

- **`jest.mock('@infrastructure/http/middlewares/rate-limit', …)`** — Replaces the real rate-limit middleware with the shared `securityMock()` from the test-helpers module so that `chainOf` can inspect the declared budget without a live limiter.
- **`describe('… what is mounted')`** — Asserts the exact ordered signature list on `router` via `routeSignatures`.
- **`describe('… authorization')`** — Uses `it.each` over all three signatures to assert `isAuth` is present and `requirePermissionGuard` is absent (any logged-in user may read; scoping happens in the controller).
- **`describe('… rate limiting')`** — Asserts the `invoicing-render` budget appears in the middleware chain for the two PDF-render endpoints and is *absent* for the list endpoint (which returns JSON, not a rendered document).

## Relationships

- **`src/modules/invoicing/routes.ts`** — The SUT. This test imports its `router` export and makes all assertions against it.
- **`tests/support/routes.ts`** — Provides the three introspection helpers (`routeSignatures`, `guardsOn`, `chainOf`) and the `securityMock()` factory consumed by the jest.mock.

## Notes

- The mock is intentionally circular: the rate-limit middleware is replaced by a helper that lives in the *same* module the test imports from. If `tests/support/routes.ts` changes its export shape, the mock factory breaks at runtime, not at import time.
- The file's JSDoc calls this a "shared" router (mounted alongside `orders`' router). The test does **not** assert mount order or the shared context—it only inspects the invoicing `router` in isolation.
- The list endpoint is deliberately excluded from the `invoicing-render` budget; adding a guard or rate-limit entry to it will fail the last test block.
