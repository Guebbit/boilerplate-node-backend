---
source: src/modules/api-keys/tests/unit/actions.test.ts
source_sha256: ed6c37cd766c4a7463626143818876c5d1881bc2840de2a44bcc032a4cef5ad6
context_sha256: 7199ea5a34b6273692dc57fb610212b16584755ecfa00569876d8a9350dd5c17
generated_at: 2026-11-22T04:25:40.536005+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/unit/actions.test.ts

## Purpose
Unit tests for `actionsForRows` from `src/modules/api-keys/services/actions.ts`. They check which actions a caller may perform on an API key (credential) row. The only action is revoking, which requires the `delete:ApiKey` key and is unavailable once the credential is already revoked.

## Key elements
- `describe('actionsForRows')` has three cases, each building `actionsFor` from `actionsForRows(callerContextAs(...))` and calling it with a row object:
  - **Admin, live credential:** `actionsFor({})` returns `{ revoke: true }`.
  - **Admin, revoked credential:** `actionsFor({ revokedAt: <ISO string> })` returns `{ revoke: false }`.
  - **Customer, no key:** `actionsFor({})` returns `{ revoke: false }`.

## Relationships
- **`src/modules/api-keys/services/actions.ts`:** the module under test, imported as `../../services/actions`. `actionsForRows` takes a caller context and returns a function that maps a row to an actions object.
- **`tests/support/callers.ts`:** provides `callerContextAs`, imported through the `@tests/callers` alias. It builds caller contexts for the `'admin'` and `'customer'` roles.

## Notes
- A row counts as revoked when `revokedAt` is set. The tests pass an ISO date string.
- When the caller lacks the key, revoke is `false` whether or not the row is revoked. Only the live-row case is tested for the customer.
