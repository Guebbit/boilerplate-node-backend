---
source: src/modules/account/tests/unit/session-listing.test.ts
sha256: d7b31c8946aeec06417deb164276d16550c631436f06450a9578adbaf49e0f9d
generated_at: 2026-10-14T14:45:59.879972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-listing.test.ts

## Purpose

Unit tests for the session-listing module (`session/listing.ts`). They verify two contracts: that `newestPerFamily` collapses rotation-duplicate rows to a single entry per family, and that `listSessions` publishes the correct shape (family id, timestamps, `current` flag, and conditionally-present optional fields) without inventing data that the store did not supply.

## Key elements

- **`USER_ID`** – a fixed ObjectId string shared by every test case as the account under listing.
- **`listLive`** – the stubbed `sessionRepository.listLive` mock (extracted via `asStub`), re-mocked in every `beforeEach` via `jest.resetAllMocks()`.
- **`row(familyId, overrides)`** – factory that builds a `SessionRow` with a fresh ObjectId, a deterministic timestamp pair, and a random token hash. Callers override specific fields per scenario.
- **`describe('newestPerFamily')`** – two tests: (1) only the later-written row survives regardless of input order, (2) all families are preserved in input order.
- **`describe('listSessions')`** – four tests covering: normal listing with `current` flag, grace-window marking when the caller holds the older row, no-credential caller (all `current: false`), and optional-field presence/absence (`lastUsedAt`, `device`).

## Relationships

- **`src/modules/account/session/listing.ts`** – the module under test; provides `listSessions` and `newestPerFamily`.
- **`src/modules/account/repository.ts`** – mocked; supplies `sessionRepository.listLive` (the only store interaction) and the `SessionRow` type used in fixtures.
- **`src/infrastructure/security/hash-token.ts`** – imported solely to produce realistic token-hash values in row fixtures so `listSessions` can compare the caller's credential.
- **`tests/support/stub.ts`** – provides `asStub`, used both to extract the `listLive` mock from the repository object and to type-cast plain fixture objects into `SessionRow`.

## Notes

- The mock setup uses `jest.requireActual` and spreads the real repository, overriding only `listLive`. Any other exported member of `repository.ts` remains the real implementation—tests must not accidentally depend on that.
- "Newer" in `newestPerFamily` is determined by ObjectId ordering (later hex = later written), not by any explicit timestamp field on the row.
- The optional-field test asserts the properties are **absent** (`not.toHaveProperty`), not merely `undefined` or `null`. This pins the "absent rather than invented" contract called out in the module docstring.
- `asStub` is used as a plain identity/type-cast here (no runtime stubbing); the actual mock behavior comes from the `jest.mock` factory at the top of the file.
