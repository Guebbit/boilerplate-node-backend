---
source: src/modules/invoicing/tests/unit/routes.test.ts
sha256: f0c210a1f2d9b87ab8cd219a6f9ffd4e81821fa85eac70e9779b9bdd26a490db
generated_at: 2026-10-15T10:41:06.048808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/routes.test.ts

## Purpose

Unit test for the invoicing route table. Verifies the exact set of mounted endpoints, their authorization guards, and their rate-limiting assignments — essentially a contract check on `router` so that route changes surface immediately in CI.

## Key elements

- **`describe('invoicing routes — what is mounted')`** — asserts the router exposes exactly three GET endpoints: `/:id/invoice`, `/:id/credit-notes`, `/:id/credit-notes/:creditNoteId`.
- **`describe('invoicing routes — authorization')`** — via `it.each`, confirms every endpoint carries the `isAuth` guard and does *not* carry `requirePermissionGuard` (read-scoping is deferred to the controller).
- **`describe('invoicing routes — rate limiting')`** — confirms `GET /:id/invoice` and `GET /:id/credit-notes/:creditNoteId` share the `invoicing-render` rate-limit namespace, while `GET /:id/credit-notes` is explicitly excluded (it renders nothing).
- **`jest.mock`** — replaces `@infrastructure/http/middlewares/rate-limit` with the `securityMock()` helper exported by `@tests/routes`, keeping the middleware out of the guard/chain assertions.

## Relationships

- **`src/modules/invoicing/routes.ts`** — the system under test; the file imports its `router` export and inspects it via the test helpers.
- **`tests/support/routes.ts`** — supplies the three assertion helpers (`routeSignatures`, `guardsOn`, `chainOf`) and also provides the `securityMock` used by the jest mock above.

## Notes

- The module docstring notes this router is mounted at `/orders` and shared with the `orders` module's own router (see `../../module.ts`). Route-signature assertions here therefore reflect the *shared* table, not a private one.
- The rate-limit mock is applied *before* the `router` import to ensure the middleware never executes during guard/chain inspection.
- The list endpoint is intentionally un-budgeted; if a future change adds rendering there, the "does not budget the list" test will fail and signal the policy change.
