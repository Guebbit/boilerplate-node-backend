---
source: tests/contract/write-methods.test.ts
sha256: 6de82e63dbe346ecf44c3bb758f6ea2d81605136632f13b0b018d8e58a065be0
generated_at: 2026-11-14T22:59:46.371425+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/write-methods.test.ts

## Purpose

Cross-module contract tests for write-method API rules that must hold on **every** route, exercised over real HTTP. Each `describe` block pins one universal rule (empty-string rejection, `Location` on 201, idempotency replay, content-type enforcement, conditional writes, 304 revalidation, cache headers). Module-specific write assertions intentionally live in the owning module's own test files.

## Key elements

- **`EMPTY_STRING_CASES`** – `readonly WriteCase[]` listing every optional free-text field with `minLength: 1` across the API (16 entries). Each tuple is `[method, url, body]` where the body is valid except the target field is `''`.
- **`describe('an empty string is never a stored value')`** – parameterised over `EMPTY_STRING_CASES`; asserts 422. Sends an `Idempotency-Key` on every case because stock/ship routes gate on that header (400) before parsing the body.
- **`describe('the body media type')`** – PATCH with `text/plain` → 415 + `Accept-Patch` header; PATCH with `application/merge-patch+json` → 200; PUT with merge-patch → 415.
- **`describe('stock writes replay under an Idempotency-Key')`** – POSTs to `/inventory/levels/{id}/receive` and `adjust` twice with the same key; second call returns `idempotent-replayed: true` and identical body.
- **`sendKeyedContact`** – local helper POSTing to `/tasks` with a fixed key; used to verify a bodiless 202 replays as an empty 202.
- **`describe('a 201 names the new resource in Location')`** – checks `Location` header on user creation, webhook subscription creation, and `/account/signup` (always `/account`, success or refusal).
- **`STALE_TAG`** (`'"1.stale"'`) – a well-formed two-part ETag that no fresh row would carry; used in conditional-write tests.
- **`describe('conditional writes (RFC 9110 §13.1.1)')`** – stale `If-Match` on PATCH/DELETE → 412 with `PRECONDITION_FAILED`; matching `If-Match` → 200 with a **new** ETag.
- **`describe('a revalidating read answers 304 …')`** (×3) – `If-None-Match` on `GET /users` (private, no-cache), `GET /products/facets` (public cache), and `GET /config` (public, max-age=60); each returns empty 304 with preserved ETag.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`@tests/contract`); installs shared response assertions (ETag on 200, 412 must be spec-declared, `cache-policy-declared`) that run against every `api()` call in this file. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module top-level to provision a clean test database before any test runs. |
| `tests/support/http.ts` | Provides `api()` (supertest-style client), `authenticateAs(role)`, and `authenticateAsRole(role)` used by every authenticated request. |
| `tests/support/shopper-routes.ts` | `roleReaching({ path })` returns the least-privileged role that can hit a given URL, used to pick the correct bearer token per case. |
| `tests/support/ids.ts` | Exports `MISSING_ID`, a sentinel placed in route parameters where the test expects validation (422) to fire before the id is resolved. |
| `src/modules/products/tests/factories.ts` | `createProduct()` factory creates a product row for conditional-write, idempotency, and empty-string tests. |
| `src/modules/users/tests/factories.ts` | `PLAIN_PASSWORD` constant used in the `/account/signup` Location-header test. |

## Notes

- **`Idempotency-Key` on empty-string cases is deliberate.** Without it, stock/ship routes return 400 (missing header) before the body is validated, masking the 422 assertion.
- **`MISSING_ID` is intentional**, not a bug. The 422 is expected from body validation (`minLength: 1`), not from a missing resource; the id is never resolved.
- **The shared `@tests/contract` import is a side-effect.** It registers global response assertions, so a server that drops an `ETag` or undeclared `412` will fail here even if the test's own `expect` passes.
- **`GET /config` is the only route where this file is the sole cache-policy guard**, because the root contract is outside the `cache-policy-declared` shared check that covers the other 304 tests.
