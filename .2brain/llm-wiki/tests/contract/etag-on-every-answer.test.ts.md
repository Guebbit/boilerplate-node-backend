---
source: tests/contract/etag-on-every-answer.test.ts
sha256: 1480421063f723b16b480107a88f245d4d3df6e5fa06d679c997c82351682a18
generated_at: 2026-11-14T22:57:21.728283+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/etag-on-every-answer.test.ts

## Purpose

Contract test that verifies every write response naming a resource (create, restore, or state-change action) returns a **real ETag** and a **Content-Location** header, so a subsequent edit can use `If-Match` without a prior read (RFC 9110 §8.8.3, §15.3.2, §6.4.2 rule 7). It also asserts that writes which do not name a resource carry no ETag, and that idempotent replays preserve both headers. The shared `@tests/contract` `afterEach` walks the OpenAPI spec on every response to enforce presence/absence of ETag per operation declaration.

## Key elements

- **`Answered`** — interface describing the result of one write: HTTP status, response headers, the resource URI the tag belongs to, the bearer token, and a valid PATCH body for that resource family.
- **`Door`** — interface pairing a human-readable name with a `run()` that produces an `Answered` record. Each entry in `DOORS` is one test case.
- **`EDITS`** — per-resource-family PATCH bodies (user, product, order, example, subscription, language, account) used to prove the returned ETag is accepted as `If-Match`.
- **`targetOf()`** — creates a fresh user via the users factory and returns its ID string.
- **`post(path, bearer, body?)`** — thin wrapper around `api().post()` that attaches the Authorization header; omits the body (and thus Content-Type) for no-body action endpoints to avoid a 415.
- **`userDoor(name, path, body?)`** — factory for user-action doors (assign-role, place-purchase-hold, deactivate) that operate on a freshly created target user.
- **`userAfter(name, setup, path)`** — doors requiring a prerequisite state change (deactivate or delete) before the target action (activate, restore).
- **`languageDoor(name, move)`** — registers a `pt` locale, optionally deactivates it first, then posts the activate/deactivate action.
- **`DOORS: Door[]`** — the full test matrix covering creates (products, users, orders, examples, webhooks/subscriptions), restores, and state-change actions across every resource family.
- **`setupTestDb()`** — initializes the test database lifecycle.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`@tests/contract`); its `afterEach` walks the spec and asserts that every response either carries ETag (if the operation declares it) or does not (if it doesn't). This is the enforcement mechanism behind the suite's name.
- **`tests/support/spec-walk.ts`** — provides `declaredResponseHeaders`, `readSpec`, `listOperations`; used by the contract afterEach to query the OpenAPI document.
- **`tests/support/http.ts`** — provides `api()`, `authenticateAs()`, `authenticateAsRole()` for all HTTP calls and auth setup in every door.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` for database lifecycle.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product for the product-create, product-restore, and order doors.
- **`src/modules/orders/tests/factories.ts`** — `createOrder()`, `toOrderItem()` seed an order for the order-cancel door.
- **`src/modules/users/tests/factories.ts`** — `createUser()` provides the target user for user-action doors and the admin's own user for the order-create door.
- **`src/types/index.ts`** — exports `OrderStatus` (imported for type-level use in door setup).
- **`src/modules/users/controllers/post-user-role.ts`** — the controller behind the `POST /users/{id}/assign-role` and `POST /users/{id}/revoke-role` endpoints that two of the doors exercise; this test implicitly verifies that its response carries the correct ETag and Content-Location.

## Notes

- The `post` helper intentionally sends **no body** (and thus no `Content-Type: application/json`) for action endpoints that accept no payload; a JSON content-type on those routes would be rejected with 415.
- The assertion strategy is "use the tag": each door takes the ETag from the write's answer, then issues a PATCH to the `Content-Location` resource with that tag as `If-Match`. A 200 proves the tag is the resource's real tag (not an Express byte-hash, which would 412).
- `DOORS` is the test matrix; the framework iterates it to produce one `it` per entry. The file is truncated in this snapshot—the final door (`revoke-role`) and any subsequent ones are cut off.
- Webhook-subscription doors authenticate as `manager` rather than `admin`, reflecting that role's permission on that resource.
