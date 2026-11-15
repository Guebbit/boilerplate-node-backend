---
source: tests/integration/get-body-ignored.test.ts
sha256: d3ec418becdd3f78ec8174f5c86e35daeb43e220ebc3cc47a7cef134ced5c29d
generated_at: 2026-11-14T23:13:31.209110+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/get-body-ignored.test.ts

## Purpose

Integration test verifying that the server ignores any request body attached to a GET request. A body that would be rejected (422) if read by a controller or cache-key builder must have no effect: the response must be identical to the bare GET. This guards the guarantee that GET semantics (RFC 9110 §9.3.1, Zalando guideline) are enforced at the transport layer in `app/security.ts`.

## Key elements

- **`PERIOD`** – Query-string fragment (`from=2026-03-01&to=2026-03-31`) that satisfies the date-range validation on stats endpoints.
- **`HOSTILE_BODY`** – An object `{ page: 'not-a-number', from: '…', to: '…' }` that would fail schema validation (422) if any controller or cache layer read it. Used to prove the body is truly discarded, not merely parsed and accepted.
- **`describe('a GET body is ignored')`** – Single block containing one `it.each` over three endpoints:
  - `/products` (public)
  - `/payments/refunds` (staff-only)
  - `/stats/sales?${PERIOD}` (staff-only)
  
  For each, it sends a bare GET and a GET with `HOSTILE_BODY`, then asserts both return 200 and the bodies are deep-equal.

## Relationships

- **`tests/support/http.ts`** – Supplies `api()` (supertest wrapper) and `authenticateAs()` used to build requests and obtain a bearer token.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` seeds the test database before the suite runs.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` inserts a row so the `/products` endpoint has data to return.

## Notes

- The test asserts `withBody.status === 200` (not just "not 422"). A controller that *reads* the body and then swallows the error would still pass a weaker "not 4xx" check; the 200 + body-equality assertion rules that out.
- The file relies on the behavioral contract in `app/security.ts` (JSON parser skipped for GET/HEAD). If that guard is removed or bypassed, this test fails immediately.
- The `staff` flag in the `it.each` rows controls whether the `Authorization` header is sent; it does not change the GET-body logic under test.
- See `docs/theory/request-input.md` for the broader design rationale.
