---
source: src/modules/notifications/tests/unit/routes.test.ts
source_sha256: 1c71be02cdc667a0c169fe990c525f9a9ddfd32805d4ff94b9ca6d8cbb9e0462
context_sha256: e2a33e2f71e6a3cd2f0103580720b0060584f8bd1336516de1bf2e4ca5c552e4
generated_at: 2026-11-22T05:59:18.751826+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/routes.test.ts

## Purpose
Unit test that pins the authentication guards on the notifications route table. It checks that every inbox route requires a bearer session with no permission rule, and that the SSE stream authenticates by refresh cookie instead of a bearer token (an `EventSource` cannot send the header).

## Key elements
- **`it.each` block** — for each of `GET /`, `POST /read-all`, `DELETE /`, `GET /:id` and `DELETE /:id`, asserts the guards include `isAuth` and do not include `requirePermissionGuard`.
- **Stream test** — for `GET /stream`, asserts the guards include `requireSessionViaCookieGuard` and exclude both `requirePermissionViaCookieGuard` and `isAuth`.
- **`guardsOn(router, signature)`** — helper used to look up the guards attached to a route signature such as `'GET /'`.

## Relationships
- **`src/modules/notifications/routes.ts`** — supplies the `router` under test. The test only inspects the guards declared on its routes.
- **`tests/support/routes.ts`** — supplies `guardsOn`, imported through the `@tests/routes` alias.

## Notes
- The stream's cookie credential is described in the file header as the one thing that can silently break. Switching it to a bearer guard would break `EventSource` clients, and this test catches that.
- Routes are identified by `"METHOD path"` signature strings. A new notifications route has to be added to the `it.each` list to be covered.
