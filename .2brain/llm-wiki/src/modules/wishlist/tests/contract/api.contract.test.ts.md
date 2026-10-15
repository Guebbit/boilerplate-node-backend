---
source: src/modules/wishlist/tests/contract/api.contract.test.ts
sha256: e1b13f52f81766bed282a095b716ffcea5666a03b510b723b26d703474234c78
generated_at: 2026-10-15T12:27:59.061354+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/wishlist` API surface. Every route requires authentication and returns the same `WishlistResponseEnvelope` shape the cart uses. These tests verify that each declared response branch (success, 404, 403) is actually reachable over HTTP; they do not assert behavioural logic (that belongs to the unit suite).

## Key elements

- **`MALFORMED_ID`** — local constant (`'not-an-object-id'`) used to exercise the "invalid path param" branch, which the API treats identically to a missing id (404).
- **`authenticateWithWishlist()`** — helper that logs in as `user`, creates a product, saves it to the wishlist, and returns `{ bearer, product }`. Reused by PUT/DELETE/move-to-cart tests to avoid repeating setup.
- **`describe('GET /wishlist')`** — covers empty wishlist and wishlist-with-items.
- **`describe('PUT /wishlist/{productId}')`** — covers save, idempotent re-save (RFC 9110 §9.3.4), malformed id (404), and non-existent id (404).
- **`describe('DELETE /wishlist/{productId}')`** — covers successful removal, role-restriction (manager/moderator/admin get 403 on move-to-cart while wishlist line persists), never-saved id (404), and malformed id (404).
- **`describe('POST /wishlist/{productId}/move-to-cart')`** — covers successful move (cross-checks `/cart` to confirm the line landed), never-saved id (404), and malformed id (404).

## Relationships

- **`@tests/contract`** (`tests/support/contract.ts`) — imported at module level; provides shared contract-test infrastructure (likely envelope matchers or setup hooks).
- **`@tests/setup-test-db`** (`tests/support/setup-test-db.ts`) — calls `setupTestDb()` at module scope to provision a clean database before the suite runs.
- **`@tests/http`** (`tests/support/http.ts`) — supplies `api()` (HTTP client), `authenticateAs(role)`, and `authenticateAsRole(role)` used in every test.
- **`@modules/products/tests/factories`** (`src/modules/products/tests/factories.ts`) — provides `createProduct()` to seed a valid product for wishlist operations.
- **`@tests/ids`** (`tests/support/ids.ts`) — provides `MISSING_ID` (a validly-shaped but non-existent ObjectId) for the "not found" error-path tests.

## Notes

- **Malformed vs. missing id are intentionally equivalent.** The contract treats an unparseable path param the same as a nonexistent one (both 404). `MALFORMED_ID` is defined locally because `@tests/ids` only supplies a well-formed-but-absent id.
- **Role test lives inside the DELETE block** even though it exercises `POST /move-to-cart`. The assertion is that the wishlist line *survives* the forbidden move, so the test is grouped with the deletion-adjacent scenarios.
- **Cross-module assertion:** the move-to-cart success test issues a `GET /cart` call and asserts on the cart's response shape, coupling this file's correctness to the cart contract.
- **Idempotency is tested explicitly** (PUT twice → same 200, same list), citing RFC 9110 §9.3.4 in a comment.
