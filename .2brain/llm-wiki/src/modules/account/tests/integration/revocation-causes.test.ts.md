---
source: src/modules/account/tests/integration/revocation-causes.test.ts
sha256: be1677619e0ab96205ad109e79c7e776ac12149ed18eb0e1aeaeaf97aac16297
generated_at: 2026-11-14T19:08:51.330854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/revocation-causes.test.ts

## Purpose

Integration test that validates every row of the `REVOCATION` table (from `domain/revocation.ts`) against the real HTTP doors. For each cause it fires the cause through its actual API endpoint and asserts the three side-effects the row promises: whether pending links are purged (`pending`), whether an outbox event is written (`announce`), and whether the caller retains one live session (`callerKeeps`). A new cause added to the table without a corresponding trigger here is a **compile error** thanks to the `Record<RevocationCause, Trigger>` type.

## Key elements

- **`TRIGGERS: Record<RevocationCause, Trigger>`** — Compile-time guarantee that every key in `REVOCATION` has a trigger. Adding a cause without a trigger here fails the build.
- **Nine trigger functions** (`viaPasswordChange`, `viaPasswordReset`, `viaLogoutAll`, `viaEmailConfirm`, `viaEmailUndo`, `viaTwoFactorConfirm`, `viaBan`, `viaDeletion`, `viaRefreshReuse`) — Each fires its cause through the real API door and returns a `Scenario` (caller ID, victim bearer, and the `fire` thunk).
- **`loginAs(email)`** — Signs in under the active session mode (`jwt` or `cookie`) and returns a bearer token plus optional cookie header.
- **`accountWithVictim(email)`** — Shared setup: creates a verified user, plants a pending verification token, and logs in a "victim" device.
- **`describe.each(MODES)` / `describe.each(causes)`** — Runs every cause in both `jwt` and `cookie` session modes, filtering out `JWT_ONLY` causes in cookie mode.
- **Assertion block** (single `it` per cause) — After `fire()` + `settleOutboxNudges()`, checks: victim bearer is dead, caller session count matches `row.callerKeeps`, `verify` token purged iff `row.pending`, and the outbox revocation event payload matches `row.announce`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/domain/revocation.ts` | Imports `REVOCATION` table and `RevocationCause` type; iterates the table's keys to generate test cases. |
| `src/modules/account/session/jwt.ts` | Imports `startSession`, `rotateRefreshToken`, `TokenReuseError` for the `refresh-reuse` trigger. |
| `src/kernel/outbox.ts` | Imports `outboxEventModel` (to query the revocation event) and `settleOutboxNudges` (to flush async outbox writes before asserting). |
| `src/modules/account/tests/factories.ts` | Imports `plantToken`, `sessionRowsOf`, `tokenTypesOf` for seeding tokens and inspecting session state. |
| `src/modules/users/repository.ts` | Imports `userRepository` to directly set `pendingEmail` / `previousEmail` for the email-change triggers. |
| `src/modules/users/tests/factories.ts` | Imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`. |
| `tests/support/http.ts` | Imports `api` (HTTP client) and `authenticateAs` (admin auth for the ban trigger). |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb` for per-run DB isolation. |
| `tests/support/environment.ts` | Imports `setEnvironment` to set `NODE_MAIL_TRANSPORT`, `NODE_TOKEN_ROTATION_GRACE_MS`, `NODE_TOKEN_REUSE_WINDOW_MS`, and `NODE_SESSION_MODE`. |
| `tests/support/cookies.ts` | Imports `cookieHeader` to build the `Cookie` header in `jwt` session mode. |
| `tests/support/totp.ts` | Imports `codeFor` to generate a valid TOTP code for the two-factor-change trigger. |

## Notes

- **Compile-time exhaustiveness**: The `Record<RevocationCause, Trigger>` type is the safety net. If a new cause is added to the `REVOCATION` table in `domain/revocation.ts`, this file will not compile until a matching trigger is added.
- **`refresh-reuse` is jwt-only**: Listed in the `JWT_ONLY` set; it is skipped in cookie mode because a refresh-token replay has no cookie-mode equivalent.
- **Timing**: `PAST_THE_SECOND_MS = 1100` is slept before firing so that tokens minted during setup have an `iat` earlier than the revocation's "now." The `NODE_TOKEN_ROTATION_GRACE_MS` is set to `'1'` so the 20 ms sleep in `viaRefreshReuse` exceeds the grace window.
- **`settleOutboxNudges()` must be called** between `fire()` and the outbox assertion; without it the outbox row may not yet be written.
- The test uses `describe.each` over both session modes, so every cause (except `refresh-reuse`) is exercised twice — once in `jwt` mode, once in `cookie` mode.
