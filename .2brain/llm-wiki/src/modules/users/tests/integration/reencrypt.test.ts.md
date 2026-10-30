---
source: src/modules/users/tests/integration/reencrypt.test.ts
sha256: 8f468f418833edb40f2bb62be05e98d0c2474b30f46787829d4012b36cbca87a
generated_at: 2026-10-29T06:22:18.206604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the `reencrypt` walk in the users module. It verifies that, after a PII encryption key rotation, a phone value still stamped with the old key version (`v1`) is rewritten to the new version (`v2`). It asserts both the reported rewrite count and the actual version stamp visible in the raw collection data.

## Key elements

- **`ROTATED_PII_KEY`** – Simulates a deployment mid-rotation: a `v2` key in front of the legacy `v1` test key, passed as a comma-separated `NODE_PII_ENCRYPTION_KEY` value.
- **`describe('users reencrypt')` / `it('moves a phone to v2')`** – Single test case that creates a user, sets a phone, then invokes the reencrypt walk under the rotated-key environment and checks the outcome.
- **`usersModule.reencrypt(false)`** – The function under test; returns a `report` with a `rewritten` counter.
- **`keyVersionOf(raw?.phone)`** – Reads the version prefix directly from the raw ciphertext to confirm the stamp advanced to `v2`.
- **`withEnvironmentOverrides`** – Temporarily swaps `NODE_PII_ENCRYPTION_KEY` so the walk sees a rotated key without touching the real environment.

## Relationships

- **`src/modules/users/module.ts`** – Source of `usersModule.reencrypt`, the code path being exercised.
- **`src/modules/users/model.ts`** – Provides `userModel.collection` for reading the raw (undecrypted) document to inspect the version stamp.
- **`src/modules/users/services/index.ts`** – Provides `userService.updateById` used to write a phone value before reencryption.
- **`src/infrastructure/security/versioned-secret.ts`** – Provides `keyVersionOf`, the helper that extracts the version prefix from a stamped ciphertext.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` to seed a user document in the test DB.
- **`tests/support/callers.ts`** – Provides `callerContextAs('admin')` to supply an authorized caller context for the `updateById` call.
- **`tests/support/environment.ts`** – Provides `withEnvironmentOverrides` to inject the rotated key for the duration of the assertion block.
- **`tests/support/setup-test-db.ts`** – Initializes the in-memory test database before the suite runs.

## Notes

- The test deliberately reads **raw** via `userModel.collection.findOne`, bypassing the repository's own decryption layer. This is how the version *stamp* is observable; a normal read would return the decrypted phone and hide the prefix.
- `reencrypt(false)` is the only call; the `false` argument is passed positionally (the test does not name it). Verify the module's signature if you need to confirm its meaning (e.g. "skip dry-run" vs. another flag).
- The test asserts `report.rewritten === 1` **and** the per-document stamp, covering both the aggregate and the row-level effect.
