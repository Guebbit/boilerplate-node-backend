---
source: src/modules/users/tests/integration/reencrypt.test.ts
sha256: 8f468f418833edb40f2bb62be05e98d0c2474b30f46787829d4012b36cbca87a
generated_at: 2026-11-08T08:56:07.653071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the `reencrypt` walk on the users module. It verifies that after a PII key rotation (v1 → v2), a phone field still stamped with the old key version is rewritten to the new version. The test reads the raw Mongo document—bypassing the repository's own decryption layer—to inspect the version stamp directly.

## Key elements

- **`ROTATED_PII_KEY`** – A composite key string (`v2:new-…,v1:test-…`) that simulates a deployment mid-rotation: the new v2 key is active, the old v1 test key is still present.
- **`'moves a phone to v2'`** (test) – Creates a user, sets a phone via `userService.updateById`, then inside `withEnvironmentOverrides` pointing at the rotated key, calls `usersModule.reencrypt(false)`. Asserts `report.rewritten === 1` and that `keyVersionOf` on the raw `phone` field returns `'v2'`.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` bootstraps a real test database at module load.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` supplies the caller context for the `updateById` write.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` temporarily swaps `NODE_PII_ENCRYPTION_KEY` so the reencrypt walk sees the rotated key, then restores it.
- **`src/infrastructure/security/versioned-secret.ts`** – `keyVersionOf` extracts the version stamp from an encrypted value for the final assertion.
- **`src/modules/users/module.ts`** – `usersModule.reencrypt(false)` is the system under test.
- **`src/modules/users/model.ts`** – `userModel.collection.findOne` reads the raw document to inspect the stamp without going through the model's decrypt path.
- **`src/modules/users/services/index.ts`** – `userService.updateById` writes the phone value that the reencrypt walk must subsequently rewrite.
- **`src/modules/users/tests/factories.ts`** – `createUser` provides a fresh user record for each test.

## Notes

- The test intentionally reads the **raw** collection document (`userModel.collection.findOne`) rather than using the model's typed getter, because the goal is to observe the version stamp that the repository layer would otherwise strip during decryption.
- `reencrypt(false)` — the boolean argument appears to be a flag (likely "dry-run" or "skip-verify") passed to the walk; the test does not exercise the `true` path.
- The composite key uses a comma separator between version-prefixed segments; the leading segment is the active write key.
