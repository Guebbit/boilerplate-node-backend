---
source: src/modules/api-keys/tests/integration/outcomes.test.ts
sha256: affa2d51f61b03652c15172b51f9e77d8f8f08bfa6533f44a5175defb0a1ebc5
generated_at: 2026-10-29T03:16:25.225330+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/outcomes.test.ts

## Purpose

Integration test suite that pins the observable outcomes of the API-key service at the service boundary: the one-year expiry ceiling (including leap-day edge cases), the exact wording and structure of refusal errors, the listing/status/sorting/export behaviour, and the audit + mail side-effects of minting. It complements `api-keys.test.ts` (permission-subset rules) by covering the "what comes out" side at the service door rather than the HTTP contract.

## Key elements

- **`describe('the one-year ceiling')`** — Verifies `latestExpiry` returns a calendar-year (not 365-day) boundary, and that `mint` accepts exactly the ceiling, rejects a millisecond past it (422 + `VALIDATION_ERROR`), and accepts a few seconds inside.
- **`describe('what a refusal says')`** — Asserts the error payload when a user requests permissions they cannot grant (names the offending permission list in `details`).
- **`describe('listing')`** — Covers tenant isolation, status reporting (`active` / `revoked` / `expired` / `suspended`), priority of `revoked` over `suspended` when the minter is also banned, sort by `expiresAt` (asc/desc), `maxExpiresAt` in the response, and `findOwnApiKeys` scoping to one user.
- **`describe('minting leaves an audit row and a mail')`** — Asserts an `ADMIN_API_KEY_MINTED` audit event with the granted permissions and a queued email (template, locale, subject).
- **`mockOutbox` / `jest.mock('…mailer')`** — Captures `enqueueEmail` calls for later assertion; the array is cleared in `beforeEach`.
- **`jest.mock('…observability/audit')`** — Replaces the audit port with `auditPortMock()` so `emitAuditEvent` can be inspected via `mockEmitAuditEvent`.
- **Helpers** — `createRealUser`, `contextFor`, `eventually` (50 ms × 40 poll), `auditedAs`, `mintKey`, `expireAt` (mutates a persisted key's expiry via `apiKeyRepository`).

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** — The unit under test; `mint`, `revoke`, `list`, `findOwnApiKeys`, `latestExpiry` are called directly.
- **`src/modules/api-keys/audit.ts`** — `apiKeysAuditActions` constants name the audit rows asserted.
- **`src/modules/api-keys/repository.ts`** — `apiKeyRepository` is used in the `expireAt` helper to persist an expired key for status tests.
- **`src/infrastructure/observability/audit.ts`** — Mocked wholesale; `emitAuditEvent` is the capture point for audit assertions.
- **`src/infrastructure/adapters/logger.ts`** — Imported (likely for spy/restore in the truncated section).
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` re-registers module wiring before every test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus; `emitDomainEvent` is available for tests that need to fire events (e.g. `ACCOUNT_SESSIONS_REVOKED`).
- **`src/modules.ts`** — Provides `enabledModules` for the registry setup.
- **`src/modules/account/index.ts`** — `ACCOUNT_SESSIONS_REVOKED` event constant, used to simulate a family-level revocation in the truncated portion.
- **`src/modules/users/tests/factories.ts`** — Supplies `userRepository` (test-scoped) for creating/banning users.
- **`src/modules/users/index.ts`** — `userService` imported (used in truncated portion, likely for locale/locale-aware mail tests).
- **`src/types/auth-context.ts`** — `TenantCallerContext` shapes every service call in this file.

## Notes

- The mailer mock uses `jest.requireActual` spread so only `enqueueEmail` is replaced; the rest of the mailer surface stays real.
- `mockOutbox` is a module-level array (not a `jest.fn` mock) precisely so the hoisted `jest.mock` factory can close over it; it must be reset manually in `beforeEach`.
- `eventually` is a manual poll loop (not `jest.waitFor`) because the mail is fired-and-forgotten by the code under test; do not replace it with `await` on a promise.
- `freezeDate` is used only in the boundary test; `afterEach` restores real timers. All other tests rely on relative offsets from `Date.now()`.
- The `IN_A_WEEK` constant is computed at module load time (not per-test), so it is stable within a single run but not across clock manipulations.
