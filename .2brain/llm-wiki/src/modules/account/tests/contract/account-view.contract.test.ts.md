---
source: src/modules/account/tests/contract/account-view.contract.test.ts
source_sha256: 8401b3834c053da67cc46e78b3bbb660089c0a0d9fc9f6212aaf7a5049a1ff45
context_sha256: ca5f0d07ea444ebc49b27be728dc86bea9a4bd345e4a0554785e78fba08de848
generated_at: 2026-11-22T03:49:31.077383+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/account-view.contract.test.ts

## Purpose
Contract tests for `GET /account`, which returns the caller's CASL abilities and idle-activity clock. The tests check the round trip rather than the payload shape. They pack rules on the server, unpack them the way a browser would, and then ask the rebuilt ability the same questions the server enforces. This guards against a client-side copy of the policy drifting from the server's.

## Key elements
- `abilityFrom(body, scope)` rebuilds a `MongoAbility` for one scope (`'tenant'` or `'platform'`). It calls `unpackRules` on `body.abilities[scope]` and then `createMongoAbility`. The scopes are never merged.
- `describe('GET /account abilities')` holds the cases below:
  - **Customer rules:** a signed-in `user` can read their own `Order` but not another user's.
  - **Admin rules:** an `admin` can `delete` a `Product`, so the tenant rules narrow nothing.
  - **Scope separation:** an admin who is also a platform operator gets `ObservabilitySnapshot` readable in `platform` but not in `tenant`.
  - **Empty platform list:** a caller with no platform membership gets `abilities.platform` as `[]`, not an absent field.
  - **Version:** `abilities.version` equals `permissionModelVersion(PERMISSION_RULES.map(e => e.id))`.
  - **Grantable roles:** an admin's `grantableRoles` includes `manager`, `moderator` and `admin`, and excludes `operator` and `customer`.
  - **Removed field:** `abilities` has no `subjects` property.
  - **Activity:** `activity.lastActiveAt` is a string, and `idleTimeoutSeconds` is absent for a shopper.
  - **Tag, benign case:** the `etag` header from an earlier read is still accepted by `PATCH /account` (via `If-Match`) after a later read (200). The header matches `"<digits>.<token>"`.
  - **Tag, role change:** the same flow returns 412 when an admin assigns the `support` role between the read and the write.

## Relationships
- `@kernel/permissions` (`src/kernel/permissions.ts`) supplies `permissionModelVersion` and `PERMISSION_RULES`. The version test uses them to compute the expected value independently of the endpoint.
- `@tests/contract` is imported for its side effects only, and sets up the contract-test environment.
- `@tests/http` supplies `api()` (the HTTP client) and `authenticateAs(role)`, which returns `{ user, bearer }`.
- `@tests/setup-test-db` supplies `setupTestDb()`, called once at module level to provision the test database.
- The role-change test also calls `POST /users/:id/assign-role`, which belongs to another module.

## Notes
- The `admin` fixture is both a shop admin and a platform operator. The scope-separation test depends on this.
- The tag has two parts, a body part and an edit part. A read moves the body part through `lastActiveAt`, but writes compare only the edit part. A role change moves the edit part, which is why it produces a 412.
- `abilityFrom` casts its inputs with `as never`, because the wire payload is untyped.
