---
source: src/modules/users/tests/unit/mark-sessions-ended.test.ts
sha256: 1898c90579805c090719d91dd9d6ac7a2b51db5b4b59577fb897035a3acdabfe
generated_at: 2026-11-08T08:58:35.676547+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/mark-sessions-ended.test.ts

## Purpose

Unit tests for `markSessionsEnded`, verifying the core invariant that the `tokensValidAfter` epoch on a user document advances forward but is never set backwards.

## Key elements

- **`holder(tokensValidAfter?)`** — local factory that builds a minimal `UserDocument` stub with only the `tokensValidAfter` field set (the sole field `markSessionsEnded` reads). Uses `asStub` for type-safe partial construction.
- **Test: "sets the epoch on an account that has none"** — asserts `tokensValidAfter` is assigned when it was `undefined`.
- **Test: "moves an older epoch forward"** — asserts a newer date overwrites an older one.
- **Test: "leaves a later epoch alone"** — asserts an older date does *not* overwrite a newer one (the monotonicity guarantee).

## Relationships

- **`src/modules/users/services/credentials.ts`** — source of `markSessionsEnded`, the function under test.
- **`src/modules/users/model.ts`** — source of the `UserDocument` type imported for the stub.
- **`tests/support/stub.ts`** — provides `asStub`, the typed-partial-object helper used to construct the minimal test fixture.

## Notes

- The function is deliberately tested against a document with *only* `tokensValidAfter` populated, confirming it reads no other fields. This keeps the test tightly scoped to the epoch logic and avoids coupling to unrelated document shape changes.
- All three cases are pure assertions on a single property after a synchronous call — no mocks, spies, or async setup needed.
