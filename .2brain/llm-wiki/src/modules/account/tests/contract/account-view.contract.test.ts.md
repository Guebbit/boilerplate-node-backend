---
source: src/modules/account/tests/contract/account-view.contract.test.ts
sha256: b33ef771c40ecb45ef90e581c6057f6fa99280a7783eac2d914b128a900d00c5
generated_at: 2026-11-08T04:30:39.766061+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/account-view.contract.test.ts

## Purpose

Contract test for `GET /account` that asserts the permission rules (abilities) the server sends to the client are the *same* rules the server itself enforces. Rather than checking response shape, every test reconstructs a CASL ability from the wire payload and asks it the same questions the server would, guaranteeing no silent drift between client-side greying-out and server-side 403s.

## Key elements

- **`abilityFrom(body, scope)`** — local helper that unpacks one scope's (`tenant` or `platform`) packed rules via `unpackRules` and returns a `MongoAbility`. Models how a browser would rebuild one ability per scope without merging the two lists.
- **`describe('GET /account abilities')`** — nine tests covering:
  - User-scoped rules narrow to the caller's own rows (read own Order → true, read another's → false).
  - Admin (shop owner) rules are broad (delete any Product in the tenant).
  - Platform and tenant scopes stay separate in the same payload (admin can read `ObservabilitySnapshot` in platform scope, not in tenant scope).
  - A caller with no platform membership receives `platform: []` (empty, not absent).
  - `version` equals `permissionModelVersion(PERMISSION_RULES.map(e => e.id))` — moves with rules, not with a role.
  - `grantableRoles` includes tenant roles but excludes `operator` and `customer`.
  - Removed `subjects` key is absent from the payload.
  - `activity.lastActiveAt` is present for authenticated users; `idleTimeoutSeconds` is absent for a shopper.
  - ETag is computed over the stored account document and therefore stable across repeated calls (does not change when abilities change).

## Relationships

- **`src/kernel/permissions.ts`** — imports `permissionModelVersion` and `PERMISSION_RULES` to compute the expected version stamp independently of the route handler.
- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`); likely registers shared contract-test helpers or globals.
- **`tests/support/http.ts`** — provides `api()` (supertest-style HTTP client) and `authenticateAs(role)` which returns a `{ user, bearer }` pair.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module scope to create/seed the test database before any test runs.

## Notes

- The file asserts *semantics* (can/cannot) rather than *structure*; adding a field to the response won't break these tests unless it changes what the ability answers.
- Two scopes are deliberately never merged: each test asks the scope that owns the subject. A client that merges both lists would produce different answers.
- `setupTestDb()` is invoked at module top-level (outside any `beforeAll`), so the DB is ready before Jest loads the describe block.
- ETag stability test issues two sequential `GET` calls and compares headers; it does not mutate state between them.
