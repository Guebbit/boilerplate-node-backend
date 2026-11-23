---
source: src/modules/account/tests/integration/auth-storage.test.ts
source_sha256: d1ee7f8497885f4683c4028dbdc54b5e1b60877db8cf1e9d1079355fc70a8bbe
context_sha256: 35bbcdaff3fa52cddc31c6fbcad89b7f4aed00b0f8ec3f42de3d0ef5bf0800a0
generated_at: 2026-11-22T03:53:06.940381+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/auth-storage.test.ts

## Purpose
Integration tests that run the `sessions` and `verificationtokens` persistence layer against a real database (via `setupTestDb()`). They cover the atomic claims, the one-live-link upsert, and TTL-date semantics, which a mocked store would only agree with itself about.

## Key elements
- `requestWithCookie(credential?)`: builds a stub `SessionRequest` carrying a `__Host-session` cookie, or no cookies when omitted.
- `describe('sessionRepository.supersede')`: tests that
  - exactly one of `RACE_SIZE` concurrent callers claims a token;
  - `purgeAt` moves to the retention window but never past the row's own `expiresAt`;
  - a `cookie`-mode row is refused, so only `jwt` rows are rotated away.
- `describe('sessionRepository.listLive')`: tests that only the account's live rows of the requested mode are listed, newest sign-in first. Superseded, expired, wrong-mode and other-user rows are excluded.
- `describe('sessionRepository.removeFamily')`: tests that the live row and its superseded predecessors are removed together, and that another account's family cannot be removed (returns 0).
- `describe('sessionRepository.removeByHash')`: tests that one session is removed, siblings are left alone, and an unknown hash is a no-op.
- `describe('sessionRepository.touch')`: tests that only the matched row is stamped, and that throttled writes happen at most once per interval.
- `describe('what the TTL monitor deletes')`: uses `reapDueSessions()` to check that only rows past `purgeAt` are deleted.
- `describe('sessionsList')`: tests that
  - one entry is returned per session family;
  - the caller's own session is marked `current`;
  - no credential or hash appears in the output;
  - nothing is marked current when no credential was sent.
- `describe('verificationTokenRepository.issue')`: tests that
  - a new link replaces the previous one for a one-live kind, such as `password`;
  - a race of upserts for one (account, kind) leaves one row;
  - a many-live kind (`mfa-challenge`) keeps every link;
  - an old `amr` is not carried onto a replacing link;
  - a kind outside the enum is rejected.
- `describe('verificationTokenRepository.findLive / spend')`: tests that `findLive` matches only a live token of the right kind by digest. It also tests that exactly one of many simultaneous spends wins, using `withTransaction`. The visible content ends partway through this block.

## Relationships
- `sessionRepository` and `verificationTokenRepository` from `../../repository` are the main subjects. `sessionModel` is imported from `../../model`.
- `sessionsList`, plus `eraseSessionsAndTokens` and `exportSessions`, come from `../../services/sessions`. `sessionsList` is exercised in the visible part.
- `SessionRequest` (type) comes from `../../session/strategy`.
- `../factories` supplies the helpers `plantSession`, `plantToken`, `reapDueSessions`, `sessionRowFor`, `sessionHashesOf`, `sessionRowsOf`, `tokenRowsOf` and `tokenTypesOf`.
- `@modules/users/tests/factories` supplies `createUser`.
- `hashToken` from `@infrastructure/security/hash-token` produces the digests used to plant and look up rows.
- `withTransaction` from `@infrastructure/runtime/database` wraps the concurrent spend test.
- `@tests/setup-test-db` provides `setupTestDb`, `@tests/race` provides `raceN` and `RACE_SIZE`, and `@tests/stub` provides `asStub`.

## Notes
- Concurrency tests use `raceN(RACE_SIZE, …)` and assert on `PromiseSettledResult` statuses rather than assuming all calls succeed.
- The invalid-kind test uses `@ts-expect-error` on purpose, to check that the schema's enum rejects a kind the types would otherwise forbid.
- `sessionsList` tests plant two live rows with one `familyId` to mimic two refreshes inside the grace window.
