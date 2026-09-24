---
source: src/modules/account/tests/contract/abilities.test.ts
sha256: d1ce13839df3738ea7c7684b13a950d624524902c91ea1714b6c6b41c8c34ac9
generated_at: 2026-09-23T18:12:12.147020+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/abilities.test.ts

## Purpose

Contract test for `GET /account/abilities`. It verifies that the endpoint publishes the *same* rules the server enforces, by unpacking the wire payload with CASL's own `unpackRules` and asserting specific allow/deny decisions per role and scope. The goal is to catch drift between server-side policy and what a client can actually act on — not to assert response shape.

## Key elements

- **`abilityFrom(body, scope)`** — Rebuilds a single-scope `MongoAbility` from the response body using `unpackRules` (the exact client code path). Accepts scope by name so the two lists are never merged, preserving the invariant that a client asks the list that owns the subject.
- **Guest read Product** — Unauthenticated caller gets 200 with a usable ability that allows reading active products.
- **Guest deny Order** — Same caller cannot read another user's order.
- **Authenticated user — own rows only** — `authenticateAs('user')` yields an ability that allows reading their own order but denies another user's.
- **Admin (shop owner) — broad grant** — `authenticateAs('admin')` can delete a Product; the tenant rule set "narrows nothing."
- **Scope separation** — The admin (who holds both memberships) proves the platform list answers platform subjects and the tenant list does not, and vice-versa.
- **Empty platform list** — A user with no platform membership receives `[]` (present, not absent) so clients never branch on field presence.
- **Version fingerprint** — The `version` field equals `permissionModelVersion(PERMISSION_KEYS.map(e => e.key))`, tying it to the key set rather than any single role.
- **Stable subject set** — `subjects` equals `PERMISSION_SUBJECTS` for every caller, giving clients a fixed type-level surface.

## Relationships

- **`src/kernel/permissions.ts`** — Provides `permissionModelVersion`, `PERMISSION_KEYS`, and `PERMISSION_SUBJECTS`; the test asserts the response's `version` and `subjects` fields match these canonical exports.
- **`tests/support/http.ts`** — Supplies `api()` (unauthenticated request builder) and `authenticateAs(role)` (returns `{ user, bearer }` for role-scoped auth headers).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top to seed a clean Mongo instance before the suite runs.

## Notes

- The file deliberately tests **round-trip semantics** (pack → wire → unpack → decide) rather than asserting a fixed JSON shape, because the contract is "the client can use what arrives."
- `abilityFrom` takes a scope *by name* on purpose: concatenating tenant + platform rules into one ability would prove the opposite of the scope-separation invariant.
- `tenantId` is read from the **response envelope** (`body.data.tenantId`), not from the collection — the deployment is single-tenant and stores no tenant column.
- The `version` assertion uses a key-fingerprint (not a simple count) so that a key rename or key-for-key swap would be detected, while editing a role's conditions would not bump it.
