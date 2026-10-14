---
source: src/modules/account/tests/contract/abilities.test.ts
sha256: 7ecbb2ef26b363f24ab154eae7bf6729a008809c85afee9f7872c1841371db7f
generated_at: 2026-10-14T09:03:08.820598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/abilities.test.ts

## Purpose

Contract test for `GET /account/abilities`. It verifies the round-trip invariant: rules the server packs into the response must unpack (via CASL `unpackRules`) into a working `MongoAbility` on the client side. The point is not endpoint shape but that both sides agree on the same policy, preventing silent drift between server enforcement and client-side UI greying-out.

## Key elements

- **`abilityFrom(body, scope)`** — Rebuilds a single-scope `MongoAbility` from the wire payload using `unpackRules` (CASL's own reader for `packRules` output). Accepts `'tenant'` or `'platform'` as the scope; the two lists are never merged.
- **`describe('GET /account/abilities')`** — The test suite. Covers:
  - Guest (unauthenticated) gets `guest` role, can read active Products, cannot read others' Orders.
  - Authenticated customer sees only their own Orders.
  - Admin (shop owner) can delete Products.
  - Scope isolation: platform-only subjects (`ObservabilitySnapshot`) are reachable solely from the platform list, even for a caller holding all tenant keys.
  - Non-platform callers receive an empty `platform` array (not absent), preserving a uniform response shape.
  - `version` field equals `permissionModelVersion(PERMISSION_KEYS.map(k => k.key))` — a fingerprint of the declared key set, independent of the caller's role.
  - `subjects` field always equals `PERMISSION_SUBJECTS`, regardless of caller.
  - `grantableRoles` is empty for strangers; for admins it lists tenant roles (`customer`, `manager`, `moderator`, `admin`) but excludes `operator`.

## Relationships

- **`src/kernel/permissions.ts`** — Provides `permissionModelVersion`, `PERMISSION_KEYS`, and `PERMISSION_SUBJECTS`. The test uses these to assert the `version` fingerprint and the published `subjects` array, ensuring the endpoint's metadata tracks the declared permission model rather than any individual role.
- **`tests/support/http.ts`** — Provides `api()` (the HTTP request helper) and `authenticateAs(role)` (creates a session and returns `{ user, bearer }`). All requests in this file go through these.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to provision a clean test database before the suite runs.

## Notes

- **Round-trip, not shape.** Tests deliberately unpack the packed rules and query the resulting ability rather than asserting on the raw JSON structure. This mirrors the actual client code path.
- **Scopes are never concatenated.** The `abilityFrom` helper takes a single scope name. A test that merged tenant and platform rules would prove the opposite of the intended invariant (scope isolation).
- **`tenantId` is client-supplied.** The collection has no `tenant` column (single-tenant deployment); the envelope's `tenantId` is what a client attaches before calling `.can()`. Tests reflect this by pulling `tenantId` from the response body.
- **Empty ≠ absent for platform scope.** Non-platform callers get `platform: []`, not a missing field, so clients never branch on field presence.
