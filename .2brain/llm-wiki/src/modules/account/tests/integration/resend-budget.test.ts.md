---
source: src/modules/account/tests/integration/resend-budget.test.ts
sha256: 4b41f2f213f53174d596ff6b908b7c0db27878f73a3e08b90ce2106626195085
generated_at: 2026-11-14T19:07:37.271231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/resend-budget.test.ts

## Purpose

Integration test that verifies a **refused** email-verification resend (cooldown / 429) does **not** consume the signed-in credential budget — the budget should only be spent by wrong passwords on `/reauth` and `/password`. It asserts this by reading the `RateLimit` header the real app writes, rather than inspecting an internal limiter.

## Key elements

- **`signedInRemaining(response)`** – Parses the `RateLimit` header with the regex `"credentials-signed-in";r=(\d+)` and returns the remaining count. Throws if the budget identifier is absent.
- **Test: "leaves the budget /reauth spends untouched"** –
  1. Creates an *unverified* user, logs in to obtain a bearer token.
  2. Fires a wrong-password `/reauth` to establish a baseline (`before`).
  3. Sends a valid resend (`200`), then a second resend that hits the cooldown (`429`).
  4. Fires another wrong `/reauth` and asserts the budget dropped by exactly **1** (only the two wrong reauths), confirming the refused resend spent nothing.
  5. Also asserts the `429` response's `RateLimit` header does **not** carry the `credentials-signed-in` entry (it's a different limiter).

## Relationships

- **`tests/support/http.ts`** – Provides the `api()` helper used to issue all HTTP requests in the test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once to initialise/reset the test database before the suite runs.
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser` (with `'unverified'` status) and the shared `PLAIN_PASSWORD` constant for deterministic logins.

## Notes

- The budget is read **through the wire** (the `RateLimit` response header) rather than by querying a rate-limiter service; this is intentional so the test exercises the real app's header-writing logic.
- The `429` resend response is expected to have its own (different) `RateLimit` entry; the test explicitly asserts the signed-in budget identifier is *absent* from that header to guard against accidental coupling of the two limiters.
- The test depends on call ordering (wrong-reauth → resend → resend → wrong-reauth); reordering would change which budget decrements are attributed to which request.
