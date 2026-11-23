---
source: src/modules/account/tests/unit/epoch.test.ts
source_sha256: 17ad71ea3f0b3b5294976ba0f2981a7af0cd6ea34a7c78e24d20c03625f94cf3
context_sha256: 40cf9b4c193d1288c3a82eda389d61942ee0f190a04481adee1f73da9bcc70eb
generated_at: 2026-11-22T04:05:22.487564+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/epoch.test.ts

## Purpose
Unit tests for the session-epoch rule in `domain/epoch`. They pin down how a token (checked by the resolver and the refresh path) and a login proof (checked at the mint) are judged against an epoch timestamp that records when an event last invalidated sessions.

## Key elements
- `describe('predatesSessionEpoch')`: tests token-vs-epoch comparison at one-second granularity. The epoch is `2026-10-06T12:00:00.900Z`, and `epochSecond` is its floored Unix-seconds value.
  - With no epoch (`undefined`), the function returns `false`.
  - A token stamped at `epochSecond - 1` is refused (`true`).
  - A token stamped at `epochSecond` is kept (`false`), so the caller survives its own bump.
  - A token stamped at `epochSecond + 5` is kept.
- `describe('proofPredatesEpoch')`: tests proof-vs-epoch comparison at millisecond granularity, using the same epoch.
  - With no epoch, the function returns `false`.
  - A proof checked at `epoch.getTime() - 1` is refused, even though it falls in the same second as the bump.
  - Proofs checked at the bump or after it (`+0` and `+1` ms) are kept.

## Relationships
- Imports `predatesSessionEpoch` and `proofPredatesEpoch` from `src/modules/account/domain/epoch.ts`, the only module under test. The tests call both functions directly, with no mocks.

## Notes
- The two rules use different units. Tokens are compared in whole seconds, so a token from the same second as the bump survives. Proofs are compared in milliseconds, so a proof from a millisecond earlier in that same second does not.
- The epoch's `.900` millisecond component is chosen so that the same-second case for tokens and the sub-second case for proofs can be told apart.
- The "no epoch" case passes `0` as the first argument and `undefined` as the epoch.
