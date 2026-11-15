---
source: src/modules/orders/tests/integration/reencrypt.test.ts
sha256: d83b58debe35f202a6ee9c490a27ffce0703ec0debc09012d9f59e8e114c17fa
generated_at: 2026-11-14T20:54:17.916411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the orders module's `reencrypt` walk. Verifies that after a PII key rotation (v1 → v2), an order's frozen PII fields (shipping address, notes) and timeline staff notes are re-encrypted to the new key version, and that the order still deserializes and reads back correctly through the public API.

## Key elements

- **`ROTATED_PII_KEY`** — A two-segment key string (`v2:new-…,v1:test-…`) that simulates a deployment mid-rotation: the new v2 key is "in front" and the v1 test key is still valid behind it.
- **Test: "moves addresses and notes to v2 and the order still serializes"** — Creates an order with a shipping address and a note, runs the module's reencrypt under the rotated key, asserts `report.rewritten === 6`, checks the raw ciphertext version via `keyVersionOf`, and confirms the model still deserializes the address.
- **Test: "moves a staff note on the timeline to v2 and it still reads back"** — Seeds a staff note via the order service, reencrypts, asserts `report.rewritten === 1`, verifies the raw `orderEventModel` row carries the v2 stamp, and confirms `timelineAs` still returns the plaintext text.

## Relationships

- **`src/modules/orders/module.ts`** — Under-test; the test invokes its `reencrypt` entry point and inspects the returned report.
- **`src/modules/orders/model.ts`** — Supplies `orderModel` / `orderEventModel`; the test reads the underlying collection directly to inspect raw ciphertext version stamps, then reads through the model to confirm normal deserialization.
- **`src/modules/orders/services/index.ts`** — The test uses the exported order service to seed a staff note on the timeline before reencrypting.
- **`src/infrastructure/security/versioned-secret.ts`** — Provides `keyVersionOf` to extract the version tag from a ciphertext string.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `timelineAs` build fixture data and read the timeline.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** — `createUser`, `createProduct` supply prerequisite entities.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_PII_ENCRYPTION_KEY` to the rotated value for the duration of the reencrypt call.
- **`tests/support/callers.ts`** — `callerContextAs('admin', …)` / `asAdmin()` build the auth context needed by the service and timeline readers.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the test database before the suite runs.

## Notes

- The test intentionally reads **below** the repository's own decrypt layer (raw collection access) so it can assert on the version stamp embedded in the ciphertext. Reading through the model afterward confirms the public path still works.
- `reencrypt(false)` — the `false` argument is passed positionally (likely `dryRun: false`); the return value is a `report` object with a `rewritten` counter.
- The PII key format is `vN:material,vN:material` (comma-separated, most-recent-first); the test relies on the reencrypt walk recognizing the v1 segment as "stale" and rewriting to v2.
