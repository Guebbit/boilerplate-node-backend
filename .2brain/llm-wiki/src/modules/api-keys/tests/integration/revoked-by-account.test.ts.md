---
source: src/modules/api-keys/tests/integration/revoked-by-account.test.ts
sha256: 1ddae696cc001edd5f8ba5479591130d6bd2400c1401851374f7cf5a227b6f39
generated_at: 2026-11-08T05:06:23.284922+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/revoked-by-account.test.ts

## Purpose

Integration test that proves account-level "epoch-moving" actions — logout everywhere, password reset, email-change undo — actually revoke a user's API keys via the outbox, and that related-but-distinct actions (replayed refresh token, ordinary password change, scheduled account deletion/restore) leave keys in the correct state. It exercises the real HTTP surface rather than unit-testing the event handler (which lives in `api-keys.contract.test.ts`).

## Key elements

- **`adminWithKey()`** — Helper that creates a verified admin, mints a live API key via `mint()`, logs in over HTTP, and returns `{ user, bearer, secret }` for use across all test cases.
- **`FRONTEND`** — The single allowed CORS origin (`https://shop.example`) required by the replayed-refresh-token test.
- **`describe("keys end with the sessions…")`** — Five cases:
  - Logout everywhere (`DELETE /account/sessions`) → key revoked.
  - Password reset confirm (`POST /account/password/reset/confirm`) → key revoked.
  - Email-change undo (`POST /account/email-change/undo`) → key revoked.
  - Replayed refresh token (grace set to 0) → sessions wiped, key **not** revoked.
  - Ordinary password change (`POST /account/password`) → key **not** revoked.
- **`describe("keys wait out a scheduled account deletion")`** — Account deletion (`DELETE /account`, 202) suspends the key; account restore (`POST /account/restore`) revives it.
- **`settleOutboxNudges()`** — Called after each action that emits a revocation event; must precede any `credentialOf` assertion.
- **`credentialOf(secret)`** — Resolves a key secret against the live credential store; `undefined` means revoked.
- **`plantToken` / `sessionRowsOf`** — From the account test factories; used to seed account tokens (reset, undo, restore) and inspect session rows.
- **`apiKeysModule.onRegistered?.()`** — Called once at module scope to install the credential resolver, mirroring a real boot.

## Relationships

- **`@modules/api-keys/module`** — Imported and booted (`onRegistered`) so the credential resolver is active for `credentialOf` calls.
- **`@modules/api-keys/services/api-keys`** — `mint()` creates the key under test.
- **`@kernel/outbox`** — `settleOutboxNudges()` flushes the transactional outbox so revocation events are delivered before assertions.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes the `TenantCallerContext` used during minting.
- **`@kernel/permissions`** — `permissionsOfRole('admin')` populates the caller's permission set.
- **`@modules/users/tests/factories`** — `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` provide the user fixture and password constants.
- **`@modules/account/tests/factories`** — `plantToken` seeds account tokens; `sessionRowsOf` inspects remaining sessions.
- **`@tests/credentials`** — `credentialOf` is the assertion primitive for key liveness.
- **`@tests/http`, `@tests/cookies`, `@tests/setup-test-db`, `@tests/environment`** — Standard test infrastructure (supertest wrapper, cookie parsing, DB reset, env-var injection).
- **`@types`** — `TenantCallerContext` type for the minting context.

## Notes

- **Outbox ordering matters.** Every revocation assertion must come *after* `settleOutboxNudges()`. The event is written transactionally with the account mutation; the relay delivers it only after the commit. Forgetting this call produces flaky "key still alive" failures.
- **Suspension ≠ revocation.** Account deletion returns `202` and *suspends* the key (resolver refuses a locked minter) rather than hard-revoking it. Restore brings it back. This is intentionally distinct from the three hard-revoke paths.
- **Replay test requires zero grace.** The test sets `NODE_TOKEN_ROTATION_GRACE_MS: '0'` so the second use of a swapped refresh token is classified as theft (session wipe) rather than a benign race. Without this, the 401 and empty-session assertions would not fire.
- **`beforeEach` references `FRONTEND` before its `const` declaration** in source order. This is safe because the callback executes after module evaluation, but it can confuse readers scanning top-to-bottom.
