---
source: src/modules/account/tests/contract/abilities.test.ts
sha256: 31466643fc2d3b2de1581e3af328829abf43de21f552b51420996f409fd7e081
generated_at: 2026-10-29T02:50:25.839839+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/abilities.test.ts

## Purpose

Contract test for `GET /account/abilities`. Rather than asserting response shape, it verifies the **round-trip invariant**: the rules the server packs into the payload, when unpacked by the client via CASL's `unpackRules`, produce the same allow/deny decisions the server itself would make. This catches silent drift between server-side enforcement and client-side greying-out.

## Key elements

- **`abilityFrom(body, scope)`** — Rebuilds a `MongoAbility` for one scope (`'tenant'` or `'platform'`) using `unpackRules`, mirroring the browser's code path. Scopes are never merged; each is queried independently.
- **`describe('GET /account/abilities')`** — Ten test cases covering:
  - Unauthenticated guest gets a usable guest ability (can read active products).
  - Guest cannot read another user's orders.
  - Authenticated customer sees their own rows and only their own.
  - API-key caller gets exactly the rules the key was minted with.
  - Admin (shop owner) has unrestricted tenant-scope permissions.
  - Tenant and platform scopes do not leak into each other's lists.
  - Caller without platform membership receives `platform: []` (empty, not absent).
  - `version` field is a fingerprint of the declared rule set, stable across role changes.
  - `subjects` field is the full declared subject set, independent of the caller.
  - `grantableRoles` is empty for strangers; lists assignable tenant roles for admins (excludes `operator` and `customer`).

## Relationships

- **`src/kernel/permissions.ts`** — Source of truth for `PERMISSION_RULES`, `PERMISSION_SUBJECTS`, and `permissionModelVersion`. The tests assert that the endpoint's `version` and `subjects` fields match these constants.
- **`tests/support/http.ts`** — Provides `api()` (base HTTP client) and `authenticateAs(role)` (returns `{ user, bearer }`).
- **`tests/support/credentials.ts`** — Provides `credentialHolding(scopes)` to mint an API key with a specific permission scope, used to test the API-key path.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()` to initialise a clean test database before the suite runs.

## Notes

- **Scopes are deliberately never concatenated.** A test that merged tenant + platform rules into one ability would prove the *opposite* of the invariant the endpoint guarantees. Always build one ability per scope and query the one that owns the subject.
- **`tenantId` is not a column on the data.** This single-tenant deployment stores no tenant field; the response envelope carries `tenantId`, and the client attaches it before calling `ability.can(...)`. Tests replicate this by reading `response.body.tenantId` and passing it into the subject.
- **The version is a rule-set fingerprint, not a role fingerprint.** It is computed from `PERMISSION_RULES.map(e => e.id)`; editing a role's permissions must not change it, and a rule rename or swap must.
- **`platform: []` vs. absent.** The endpoint always includes both scope keys so clients never branch on field presence—they simply build an ability that grants nothing.
