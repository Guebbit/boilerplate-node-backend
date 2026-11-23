---
source: src/modules/invoicing/tests/unit/routes.test.ts
generated_at: 2026-11-22T05:41:04.820057+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/routes.test.ts

## Purpose
Unit tests for the invoicing module's route table. They check which routes `router` mounts, which guards protect them, and which rate-limit namespace applies to each. The router is mounted at `/orders` and shares that path with `orders`' own router.

## Key elements
- **Rate-limit mock**: the file mocks `@infrastructure/http/middlewares/rate-limit` with `securityMock()` from `@tests/routes`, so the route chains can be inspected.
- **`invoicing routes — what is mounted`**: asserts `routeSignatures(router)` equals exactly `GET /:id/invoice`, `GET /:id/credit-notes` and `GET /:id/credit-notes/:creditNoteId`, in that order.
- **`invoicing routes — authorization`**: runs `it.each` over the three signatures.
  - Each route's `guardsOn` must contain `isAuth`.
  - Each route's `guardsOn` must not contain `requirePermissionGuard`. Any logged-in caller can read, and access is scoped in the controller.
- **`invoicing routes — rate limiting`**:
  - `chainOf` for the invoice route and for the single credit-note route must contain the `invoicing-render` namespace.
  - `chainOf` for the credit-note list must not contain it, because the list renders nothing.

## Relationships
- **`src/modules/invoicing/routes.ts`**: provides the `router` under test, imported as `@modules/invoicing/routes` after the mock is set up.
- **`tests/support/routes.ts`**: imported as `@tests/routes`. It supplies the helpers `routeSignatures`, `guardsOn`, `chainOf` and `securityMock`. The mock factory also pulls `securityMock` from it via `jest.requireActual`.

## Notes
- The mock factory uses `jest.requireActual` on `@tests/routes` rather than a normal import, and the `router` import comes after the mock.
- The tests only inspect the route chain. They never send requests, so the controller-level scoping that the authorization tests mention is not tested here.
