---
source: src/modules/account/tests/integration/auth-storage.test.ts
sha256: c683ffca454642b986ed48ee76d714483adaa54b0a77bf1ecd809a529babf750
generated_at: 2026-10-14T09:07:59.275225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-storage.test.ts

## Purpose

Integration tests that exercise `sessionRepository` and `verificationTokenRepository` against a **real** database (Mongoose). The goal is to verify behaviours that a mocked store cannot honestly simulate: atomic single-winner claims under race, the one-live-link upsert semantics for verification tokens, TTL/purgeAt clamping, and cross-account isolation.

## Key elements

- **`sessionRepository.supersede`** — asserts exactly one concurrent caller wins a token claim; verifies `purgeAt` is clamped to `min(now + window, expiresAt)`; confirms `cookie`-mode rows are never rotated.
- **`sessionRepository.listLive`** — filters by account, mode, and liveness; orders newest sign-in first; excludes superseded, expired, wrong-mode, and foreign-account rows.
- **`sessionRepository.removeFamily`** — deletes the live row plus all rotated-away predecessors sharing a `familyId`; proves it cannot affect another account's rows.
- **`sessionRepository.removeByHash`** — single-row deletion; unknown hash is a no-op (returns 0).
- **`sessionRepository.touch`** — stamps `lastUsedAt` only on the matched row; honours a throttle interval (at most one write per window).
- **TTL monitor (`reapDueSessions`)** — deletes rows past `purgeAt` and leaves the rest.
- **`sessionsList`** — user-facing listing: deduplicates by `familyId` (grace-window duplicates collapse to one entry), marks the caller's own session via the `__Host-session` cookie, and never leaks token hashes in the output.
- **`verificationTokenRepository.issue`** — one-live kinds replace the prior link atomically (even under `raceN`); many-live kinds coexist; stale `amr` is not carried forward; unknown kinds are rejected by the schema enum.
- **`verificationTokenRepository.findLive` / `spend`** — lookup requires matching kind + digest + live status; `spend` is atomic under concurrency (single winner).
- **Helpers** — `requestWithCookie` builds a stub `SessionRequest`; all factory/assertion helpers come from `../factories`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `repository.ts` | SUT — `sessionRepository` and `verificationTokenRepository` are the objects under test. |
| `model.ts` | Imports `sessionModel` (used indirectly by factories/assertions). |
| `services/sessions.ts` | SUT — `sessionsList` is tested for dedup, current-marking, and credential leakage. |
| `session/strategy.ts` | Provides the `SessionRequest` type for the cookie-stub helper. |
| `infrastructure/security/hash-token.ts` | `hashToken` produces the digests passed to every repository call. |
| `infrastructure/runtime/database.ts` | `withTransaction` is imported (used internally by the repositories; surfaced in the dependency graph). |
| `account/tests/factories.ts` | All `plant*`, `reap*`, and `*Rows/Hashes/Types` helpers. |
| `users/tests/factories.ts` | `createUser` seeds a real user row per test. |
| `tests/support/race.ts` | `raceN` / `RACE_SIZE` drive the concurrency harness. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the real DB for the suite. |
| `tests/support/stub.ts` | `asStub` casts a plain object to a typed `SessionRequest`. |

## Notes

- The module docblock states the explicit intent: these tests verify "behaviours a mocked store could only agree with itself about." Do not convert them to unit tests with in-memory fakes.
- `purgeAt` is **clamped** to the row's own `expiresAt` — a short-lived session will always get `purgeAt === expiresAt` regardless of the retention window passed to `supersede`.
- `sessionsList` deduplicates on `familyId` because two refreshes inside a grace window can leave two live rows for the same logical session.
- The `@ts-expect-error` in the `issue` test is intentional: it asserts the Mongoose schema enum rejects unknown token kinds at runtime.
- `cookie`-mode sessions are a separate lifecycle; `supersede` explicitly refuses them (`resolves.toBe(false)`), so they must be tested/managed through a different code path.
