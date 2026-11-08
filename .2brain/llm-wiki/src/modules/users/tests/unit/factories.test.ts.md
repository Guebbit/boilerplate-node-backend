---
source: src/modules/users/tests/unit/factories.test.ts
sha256: 0a6a0be3d014fb749b9c3ca4c42fa779837f205b074156a1f52f3fca30ac495e
generated_at: 2026-11-08T08:58:28.601337+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/factories.test.ts

## Purpose
Unit tests for the `makeUser` fixture builder and the shared password constants. Verifies that the fixture produces a complete, insertable user document with correct override semantics, and that every password constant in the test vocabulary actually satisfies (or violates) the real signup policy rather than a hand-written copy of it.

## Key elements
- **`describe('makeUser')`** — asserts default field values, override behavior, omission of unspecified fields, preservation of explicit `false`, ISO-string→`Date` conversion, and ObjectId-derived `createdAt`.
- **`describe('the password vocabulary')`** — parameterized checks that `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `MINIMAL_PASSWORD`, `PASSPHRASE_PASSWORD` pass the policy; `WEAK_PASSWORD` fails it; `MINIMAL_PASSWORD` is exactly `signupBodyPasswordMin` chars; none of the settable constants appear in the bundled breach list; all five constants are pairwise distinct.
- **`satisfiesPolicy(password)`** — local helper that runs the value through `SignupBody.shape.password.safeParse` and returns a boolean, so tests assert against the *actual* Zod schema.
- **`HEX`** — a 24-char hex string used as a known ObjectId to verify `createdAt` derivation.

## Relationships
- **`src/modules/users/factories.ts`** — source of `makeUser` and `PLAIN_PASSWORD` under test.
- **`src/modules/users/tests/factories.ts`** — source of `PASSPHRASE_PASSWORD`, `MINIMAL_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`; this file validates those constants.
- **`src/infrastructure/security/breached-passwords/index.ts`** — provides `isInBundledBreachList`, used to guard against fixtures that would silently fail the pre-signup breach check.

## Notes
- `PLAIN_PASSWORD` is intentionally plaintext. The Mongoose pre-save hook hashes it on save; storing a pre-computed hash would be double-hashed, causing login tests to fail in a way that looks like a broken auth flow rather than a bad fixture.
- The `active: false` test exists specifically to catch a `stripUndefined` implementation that tests truthiness instead of `=== undefined`.
- Password policy assertions call the real Zod schema. Tightening the policy in the app will (correctly) break these tests; the failure message names *which* constant stopped working, so downstream 422s read as consequences rather than unrelated errors.
- Breach-list checks are per-constant (`it.each`), so a collision surfaces as "this constant is in the list" rather than a generic signup failure.
