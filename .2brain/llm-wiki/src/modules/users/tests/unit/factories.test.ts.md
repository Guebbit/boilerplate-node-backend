---
source: src/modules/users/tests/unit/factories.test.ts
sha256: 534555cd41363307d480a541672f0b6e9723076c8a40df3e8545e0a0990d9d81
generated_at: 2026-09-23T19:36:33.632200+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeUser` fixture builder and the shared password vocabulary constants. Ensures the factory produces valid, insertable user objects with correct defaults/overrides, and that each password constant fulfills its designated role (settable, legacy, minimal, weak) against the _real_ Zod policy and the bundled breach list.

## Key elements

- **`satisfiesPolicy`** — local helper that runs a candidate password through `zodUserSchema.pick({ password: true }).safeParse` and returns a boolean.
- **`describe('makeUser')`** — verifies: complete default object (id, username, email); plaintext password storage; override behavior; omission of unset fields (role, verifiedAt, deletedAt, tokens); preservation of explicit `false`; ISO-string → `Date` conversion for `deletedAt`; id round-trip and `createdAt` derivation from ObjectId timestamp.
- **`describe('the password vocabulary')`** — table-driven checks that `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `MINIMAL_PASSWORD` are accepted by the real policy; `LEGACY_PASSWORD` and `WEAK_PASSWORD` are rejected; `LEGACY_PASSWORD` meets the minimum-length floor; `MINIMAL_PASSWORD` is exactly at the floor; all accepted constants are absent from the bundled breach list; all five constants are pairwise distinct.

## Relationships

- **`src/modules/users/factories.ts`** — imports `makeUser` (the function under test) and `PLAIN_PASSWORD` (the shared login credential).
- **`src/modules/users/tests/factories.ts`** — imports the four additional password constants (`LEGACY_PASSWORD`, `MINIMAL_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`) and validates their roles.
- **`src/modules/users/model.ts`** — imports `zodUserSchema` to exercise the _actual_ password validation policy rather than a local re-statement.
- **`src/infrastructure/security/breached-passwords/index.ts`** — imports `isInBundledBreachList` to confirm fixture passwords won't collide with the breach-check that runs before any signup path.

## Notes

- `PLAIN_PASSWORD` is intentionally plaintext so the model's pre-save hook hashes it; storing a pre-hashed value here would be double-hashed and cause login tests to fail in a misleading way.
- The `active: false` test exists specifically to guard against a `stripUndefined` implementation that mistakenly drops falsy (but defined) values.
- Password-vocabulary tests run against the real Zod schema, so tightening the policy in `model.ts` will surface here with the constant's name in the failure message rather than as an opaque 422 in downstream integration tests.
- The `createUserBodyPasswordMin` import from `@api/schemas.zod` is used only for length-floor assertions on `LEGACY_PASSWORD` / `MINIMAL_PASSWORD`, not for policy logic.
