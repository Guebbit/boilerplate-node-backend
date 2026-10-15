---
source: src/modules/users/tests/integration/reencrypt.test.ts
sha256: d68ce5997e495bcc8c818e0e19fa5c2a21db1a2563e0ce18f09085f144afc5c9
generated_at: 2026-10-15T12:14:39.464054+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the users module's `reencrypt` walk. It verifies that after a PII key rotation, a phone number still stamped `v1` is rewritten to `v2`, by reading the raw stored value below the repository's own decrypt layer.

## Key elements

- **`ROTATED_PII_KEY`** – A two-entry manifest string (`v2:new-pii-key-material,v1:test-pii-encryption-key`) that simulates a deployment mid-rotation: the new key is in front, the old bare test key is behind.
- **`describe('users reencrypt')` / `it('moves a phone to v2')`** – A single test that creates a user, sets a phone via `userService.updateById` under admin caller context, then calls `usersModule.reencrypt(false)` inside a `withEnvironment` block that points `NODE_PII_ENCRYPTION_KEY` at the rotated manifest. Asserts `report.rewritten === 1` and that `versionOf(raw.phone)` returns `'v2'`.

## Relationships

- **`src/modules/users/module.ts`** – Calls `usersModule.reencrypt(false)` to trigger the rotation walk.
- **`src/modules/users/services/index.ts`** – Uses `userService.updateById` to write the initial phone value that will later be re-encrypted.
- **`src/modules/users/model.ts`** – Reads `userModel.collection.findOne` directly (bypassing the repository's decrypt) to inspect the raw version stamp.
- **`src/infrastructure/security/versioned-secret.ts`** – Imports `versionOf` to extract and assert the version prefix on the stored phone string.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` to seed a test user.
- **`tests/support/callers.ts`** – Supplies `callerContextAs('admin')` for the privileged update call.
- **`tests/support/environment.ts`** – Wraps the `reencrypt` call in `withEnvironment` to temporarily swap the PII key env var.
- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` at module top-level to provision an in-memory test database.

## Notes

- The test reads the document straight from `userModel.collection` rather than going through the repository, deliberately bypassing the decrypt layer so the version stamp is visible in the raw stored string.
- `reencrypt(false)` is called with a single-argument boolean; the `false` value is the only call-site evidence of its meaning—likely "dry-run off" or "skip dry-run," but confirm against the module's signature.
- The env var swap is scoped via `withEnvironment`, so no global mutation leaks into other tests.
