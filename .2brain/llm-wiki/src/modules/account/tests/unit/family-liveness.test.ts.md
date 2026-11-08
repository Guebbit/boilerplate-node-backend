---
source: src/modules/account/tests/unit/family-liveness.test.ts
sha256: 86fe83f3898a938ba5214a352f85cf35c212df3d12abcac6a6833ff7896eaa19
generated_at: 2026-11-08T04:47:12.459836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/family-liveness.test.ts

## Purpose

Unit tests for `resolveInLiveFamily` (from `../../session/family-liveness.ts`), verifying the decision logic that determines whether a session family is revoked, idle-ended, expired, or allowed through, and whether a "stamp" (`touchFamily`) is written. The store is fully mocked; the tests exercise only the in-memory branching.

## Key elements

- **`resolveInLiveFamily`** (imported from `@modules/account/session/family-liveness`) — the function under test; takes caller id, family id, token, a caller-fetch callback, and a `{ passive }` option.
- **`store`** — a stub of `sessionRepository` with `familyActivity`, `touchFamily`, and `removeFamily` as `jest.fn()`s.
- **`SHOPPER` / `STAFF`** — two caller fixtures distinguishing tenant vs. platform roles (staff has `roles.tenant = 'editor'`; shopper has it `null`).
- **`ago(seconds)`** — helper returning a `Date` offset from now, used to fabricate `startedAt` / `lastActiveAt` / `stampedAt` values.
- **`resolve(caller, passive?)`** — thin wrapper that calls `resolveInLiveFamily('u1','f1','jwt', …, { passive })` with a fixed caller-fetch stub.
- **Test cases** — cover: missing live row → `{ miss: 'revoked' }`; staff idle past limit → `{ miss: 'idle' }`; staff past lifetime cap → `{ miss: 'expired' }`; within cap → `{ ok }`; shopper immune to age/idle; stamp written when absent or >60 s old; stamp skipped when <60 s; passive requests judged but never stamped; resolution succeeds even if `touchFamily` rejects.

## Relationships

- **`src/modules/account/session/family-liveness.ts`** — the module under test; `resolveInLiveFamily` is imported directly.
- **`src/modules/account/repository.ts`** — `sessionRepository` is mocked via `jest.mock`, exposing `familyActivity`, `touchFamily`, `removeFamily` as spies.
- **`tests/support/stub.ts`** — `asStub` is used to type-cast the mocked repository and the caller-fetch callback.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_SESSION_IDLE_TIME_STAFF` (and optionally `NODE_SESSION_LIFETIME_STAFF`) to control the thresholds under test.

## Notes

- The mock replaces only three methods on `sessionRepository`; all other repository exports pass through via `...actual`.
- `stampedAt` is the field that gates stamping: if absent or older than 60 s, `touchFamily` fires; if present and within 60 s, it does not.
- A passive request still passes through the idle/expiry checks but never triggers a stamp — the test asserts `touchFamily` is *not* called, not merely that the result is `{ ok }`.
- The lifetime-cap test sets `NODE_SESSION_LIFETIME_STAFF` to `'0'` (disabled) to confirm the cap can be turned off.
- Shopper callers are deliberately immune to both idle timeout and lifetime cap; the tests assert `removeFamily` is never invoked for them regardless of age.
