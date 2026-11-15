---
source: src/modules/account/tests/contract/account-view.contract.test.ts
sha256: ac7597087a71d8acd0ce3358dd472caaa6c145ae96a3c2a584f5c90dc4f1835b
generated_at: 2026-11-14T18:58:55.783702+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/account-view.contract.test.ts

## Purpose

Contract test that verifies the `GET /account` response carries the *same* permission rules the server enforces, so a client can derive its UI state from the wire payload rather than duplicating policy. It also pins the idle-clock fields and the optimistic-concurrency (`If-Match`/ETag) semantics of `PATCH /account`.

## Key elements

- **`abilityFrom(body, scope)`** – Rebuilds a single CASL `MongoAbility` from one scope (`tenant` or `platform`) of the response's `abilities` object, using `unpackRules` from `@casl/ability/extra`. Scopes are never merged; each is asked independently.
- **`describe('GET /account abilities')`** block – Individual `it` cases cover:
  - A customer's rules only permit their own rows (row-level scoping).
  - A shop owner's rules narrow nothing within the tenant.
  - Tenant and platform scopes stay separate in one payload (no cross-scope leak).
  - A caller without a platform membership receives `abilities.platform` as `[]` (present, not absent).
  - `abilities.version` equals `permissionModelVersion(PERMISSION_RULES.map(e => e.id))` — it tracks rule changes, not role changes.
  - `grantableRoles` lists assignable tenant roles and excludes platform/`operator` and `customer`.
  - The removed `subjects` key is **not** present in the payload.
  - `activity.lastActiveAt` is a string; `activity.idleTimeoutSeconds` is absent for a shopper.
  - `PATCH /account` accepts an `If-Match` tag whose *edit part* (the numeric prefix of the ETag) is unchanged, even after an intervening `GET` advanced the activity part.
  - `PATCH /account` returns **412** when a role change (via `POST /users/:id/assign-role`) mutated the edit part before the write.

## Relationships

- **`src/kernel/permissions.ts`** — Imports `PERMISSION_RULES` and `permissionModelVersion`; the test computes the expected version stamp from the same constants the server uses, asserting the two sides agree.
- **`tests/support/contract.ts`** — Imported as a side-effect module (`import '@tests/contract'`); no values are destructured from it.
- **`tests/support/http.ts`** — Provides `api()` (an HTTP client factory) and `authenticateAs(role)` (returns `{ user, bearer }` for the named fixture role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to seed/reset the test database before any test executes.

## Notes

- **ETag shape is `"<edit>.<activity>"`** (e.g. `"3.abc-123"`). The `If-Match` comparison on `PATCH /account` looks *only* at the edit part; the activity part (`lastActiveAt`) advances on every `GET` and must not invalidate a pending write.
- The test that exercises the 412 path performs a real `POST /users/:id/assign-role` to mutate the edit part, proving the server-side comparison, not a client-side one.
- `abilityFrom` casts through `as never` twice because `unpackRules` returns `Rule[]` while `createMongoAbility` expects a specific CASL rule type; this is a type-level bridge, not a runtime concern.
- The two scopes (`tenant`, `platform`) are intentionally **never merged** into one ability; the test that asserts separation relies on an `admin` who also holds a platform `operator` membership.
