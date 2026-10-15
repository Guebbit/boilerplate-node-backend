---
source: src/modules/users/tests/unit/factories.test.ts
sha256: 0a6a0be3d014fb749b9c3ca4c42fa779837f205b074156a1f52f3fca30ac495e
generated_at: 2026-10-15T12:16:17.917665+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/factories.test.ts

## Purpose
Unit tests for the `makeUser` fixture builder and the shared password test constants. Guards that the fixture produces insertable users, respects override semantics, and that the password vocabulary actually satisfies the real signup policy and avoids the bundled breach list.

## Key elements
- **`satisfiesPolicy`** (local helper) — runs a candidate password through `SignupBody.shape.password.safeParse` and returns a boolean, so tests validate against the real Zod schema rather than a restated rule.
- **`describe('makeUser')`** — asserts default field values, plaintext password storage, override substitution, omission of unspecified fields, preservation of explicit `false` (`active`), ISO-string → `Date` conversion for `deletedAt`, and that a supplied hex ID drives both `_id` and `createdAt`.
- **`describe('the password vocabulary')`** — table-driven checks that `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `MINIMAL_PASSWORD`, and `PASSPHRASE_PASSWORD` pass the real policy; `WEAK_PASSWORD` fails it; `MINIMAL_PASSWORD` is exactly `signupBodyPasswordMin` chars long; the non-weak constants are absent from the bundled breach list; and all five constants are pairwise distinct.

## Relationships
- **`src/modules/users/factories.ts`** — the unit under test; provides `makeUser` and `PLAIN_PASSWORD`.
- **`src/modules/users/tests/factories.ts`** — source of the password constants (`PASSPHRASE_PASSWORD`, `MINIMAL_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`) validated in the vocabulary suite.
- **`src/infrastructure/security/breached-passwords/index.ts`** — `isInBundledBreachList` is called to confirm test passwords won't trip the runtime `assertPasswordNotBreached` guard.

## Notes
- `PLAIN_PASSWORD` is stored **plaintext** in the fixture deliberately: the model's pre-save hook performs hashing. A pre-hashed value would be double-hashed, making login tests fail with a symptom that looks like broken auth rather than a bad fixture.
- The `active: false` test exists specifically to catch a `stripUndefined` implementation that checks truthiness instead of `undefined`, which would silently drop explicit falsy overrides.
- `MINIMAL_PASSWORD` is pinned to exactly `signupBodyPasswordMin` characters; a longer value would stop exercising the length boundary without any test failing.
- The vocabulary tests intentionally reference the **real** `SignupBody` schema. Tightening the policy in production will break these tests by design — the failure message names which constant stopped fitting, distinguishing policy drift from a genuine fixture bug.
